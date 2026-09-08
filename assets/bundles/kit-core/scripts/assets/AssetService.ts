import { Asset, AssetManager, assetManager } from 'cc';
import { AssetHandle } from './AssetHandle';
import { IMMEDIATE_ASSET_RELEASE } from './AssetReleaseStrategy';
import type {
    AssetReleaseStrategy,
    AssetReleaseTask,
} from './AssetReleaseStrategy';
import {
    AssetLoadOptions,
    AssetLoadProgressCallback,
    AssetLoadProgressUnit,
    RemoteAssetLoadOptions,
    createAssetLoadProgress,
} from './AssetLoadOptions';

export type AssetConstructor<T extends Asset> = new (...args: never[]) => T;

const DEFAULT_SCOPE = 'global';

interface ItemProgressReporter {
    readonly callback: ((completed: number, total: number) => void) | null;
    readonly complete: (fallbackTotal: number) => void;
}

/**
 * 统一加载 Bundle 与远程资源，并通过句柄和作用域管理资源引用。
 */
export class AssetService {
    private readonly scopedHandles = new Map<string, Set<AssetHandle<Asset>>>();
    private readonly pendingReleaseTasks = new Set<AssetReleaseTask>();

    /** 加载单个 Bundle 资源；路径不带扩展名。 */
    public async load<T extends Asset>(
        bundleName: string,
        path: string,
        type: AssetConstructor<T>,
        options: AssetLoadOptions = {},
    ): Promise<AssetHandle<T>> {
        const bundle = this.requireBundle(bundleName);
        const progress = this.createItemProgressReporter(options.onProgress);
        const asset = await new Promise<T>((resolve, reject) => {
            bundle.load(
                path,
                type,
                progress.callback,
                (error, loadedAsset) => {
                    if (error) {
                        reject(this.createLoadError(`${bundleName}/${path}`, error));
                        return;
                    }
                    resolve(loadedAsset);
                },
            );
        });

        progress.complete(1);
        return this.createHandle(asset, this.getScope(options));
    }

    /** 一次加载一组同类型 Bundle 资源，返回顺序与传入路径一致。 */
    public async loadMany<T extends Asset>(
        bundleName: string,
        paths: readonly string[],
        type: AssetConstructor<T>,
        options: AssetLoadOptions = {},
    ): Promise<AssetHandle<T>[]> {
        if (paths.length === 0) {
            this.reportProgress(options.onProgress, 0, 0, 'items', true);
            return [];
        }

        const bundle = this.requireBundle(bundleName);
        const progress = this.createItemProgressReporter(options.onProgress);
        const assets = await new Promise<T[]>((resolve, reject) => {
            bundle.load(
                [...paths],
                type,
                progress.callback,
                (error, loadedAssets) => {
                    if (error) {
                        reject(this.createLoadError(`${bundleName}/[${paths.join(', ')}]`, error));
                        return;
                    }
                    resolve(loadedAssets);
                },
            );
        });

        progress.complete(paths.length);
        return this.createHandles(assets, this.getScope(options));
    }

    /** 加载 Bundle 指定目录下的全部同类型资源。 */
    public async loadDir<T extends Asset>(
        bundleName: string,
        directory: string,
        type: AssetConstructor<T>,
        options: AssetLoadOptions = {},
    ): Promise<AssetHandle<T>[]> {
        const bundle = this.requireBundle(bundleName);
        const progress = this.createItemProgressReporter(options.onProgress);
        const assets = await new Promise<T[]>((resolve, reject) => {
            bundle.loadDir(
                directory,
                type,
                progress.callback,
                (error, loadedAssets) => {
                    if (error) {
                        reject(this.createLoadError(`${bundleName}/${directory}`, error));
                        return;
                    }
                    resolve(loadedAssets);
                },
            );
        });

        progress.complete(assets.length);
        return this.createHandles(assets, this.getScope(options));
    }

    /**
     * 加载单个远程资源。
     * URL 没有扩展名时必须通过 options.ext 指定，例如 `.png`。
     */
    public async loadRemote<T extends Asset = Asset>(
        url: string,
        options: RemoteAssetLoadOptions = {},
    ): Promise<AssetHandle<T>> {
        let lastTotalBytes = 0;
        const requestOptions: Record<string, unknown> = {
            ...options.requestOptions,
            onFileProgress: (loaded: number, total: number): void => {
                lastTotalBytes = total;
                this.reportProgress(options.onProgress, loaded, total, 'bytes');
            },
        };
        if (options.ext !== undefined) {
            requestOptions.ext = options.ext;
        }
        if (options.reloadAsset !== undefined) {
            requestOptions.reloadAsset = options.reloadAsset;
        }

        this.reportProgress(options.onProgress, 0, 1, 'items');
        const asset = await new Promise<T>((resolve, reject) => {
            assetManager.loadRemote<T>(url, requestOptions, (error, loadedAsset) => {
                if (error) {
                    reject(this.createLoadError(url, error));
                    return;
                }
                resolve(loadedAsset);
            });
        });

        if (lastTotalBytes > 0) {
            this.reportProgress(
                options.onProgress,
                lastTotalBytes,
                lastTotalBytes,
                'bytes',
            );
        } else {
            // 命中缓存等情况下底层可能没有字节回调，仍保证通知完成。
            this.reportProgress(options.onProgress, 1, 1, 'items');
        }

        return this.createHandle(asset, this.getScope(options));
    }

    /** 按指定策略释放单个句柄，默认立即释放。 */
    public release<T extends Asset>(
        handle: AssetHandle<T>,
        strategy: AssetReleaseStrategy = IMMEDIATE_ASSET_RELEASE,
    ): void {
        this.scheduleRelease([handle], strategy);
    }

    /** 按指定策略释放一个作用域内的全部句柄，默认立即释放。 */
    public releaseScope(
        scope: string,
        strategy: AssetReleaseStrategy = IMMEDIATE_ASSET_RELEASE,
    ): void {
        const handles = this.scopedHandles.get(scope);
        if (!handles) {
            return;
        }

        // 先移除旧作用域，避免等待期间新加载的资源被一并释放。
        this.scopedHandles.delete(scope);
        this.scheduleRelease([...handles], strategy);
    }

    /** 框架销毁时立即释放全部显式引用和待释放资源。 */
    public releaseAll(): void {
        [...this.scopedHandles.keys()].forEach((scope) => this.releaseScope(scope));
        [...this.pendingReleaseTasks].forEach((task) => task.flush());
        this.pendingReleaseTasks.clear();
    }

    private requireBundle(name: string): AssetManager.Bundle {
        const bundle = assetManager.getBundle(name);
        if (!bundle) {
            throw new Error(`资源所在 Bundle 尚未加载：${name}`);
        }
        return bundle;
    }

    private createHandles<T extends Asset>(assets: readonly T[], scope: string): AssetHandle<T>[] {
        return assets.map((asset) => this.createHandle(asset, scope));
    }

    private createHandle<T extends Asset>(asset: T, scope: string): AssetHandle<T> {
        const handle = new AssetHandle(asset, (releasedHandle) => {
            this.untrack(scope, releasedHandle);
        });
        this.track(scope, handle);
        return handle;
    }

    private getScope(options: AssetLoadOptions): string {
        return options.scope ?? DEFAULT_SCOPE;
    }

    private createItemProgressReporter(
        onProgress?: AssetLoadProgressCallback,
    ): ItemProgressReporter {
        if (!onProgress) {
            return {
                callback: null,
                complete: () => undefined,
            };
        }

        let lastTotal = 0;
        this.reportProgress(onProgress, 0, 1, 'items');
        return {
            callback: (completed, total) => {
                lastTotal = Math.max(lastTotal, total);
                this.reportProgress(onProgress, completed, total, 'items');
            },
            complete: (fallbackTotal) => {
                const total = Math.max(lastTotal, fallbackTotal);
                this.reportProgress(onProgress, total, total, 'items', total === 0);
            },
        };
    }

    private reportProgress(
        callback: AssetLoadProgressCallback | undefined,
        completed: number,
        total: number,
        unit: AssetLoadProgressUnit,
        emptyCompleted = false,
    ): void {
        if (!callback) {
            return;
        }

        const progress = createAssetLoadProgress(completed, total, unit);
        const normalizedProgress = emptyCompleted ? { ...progress, ratio: 1 } : progress;
        try {
            callback(normalizedProgress);
        } catch (error) {
            // 调用方的显示逻辑异常不应中断底层资源加载。
            console.error('[AssetService] 加载进度回调执行失败', error);
        }
    }

    private createLoadError(target: string, error: Error): Error {
        return new Error(`资源加载失败：${target}，${error.message}`);
    }

    private scheduleRelease(
        handles: readonly AssetHandle<Asset>[],
        strategy: AssetReleaseStrategy,
    ): void {
        let task: AssetReleaseTask | null = null;
        let completed = false;
        const release = (): void => {
            if (completed) {
                return;
            }
            completed = true;
            handles.forEach((handle) => handle.release());
            if (task) {
                this.pendingReleaseTasks.delete(task);
            }
        };

        try {
            task = strategy.schedule(release);
            if (task && !completed) {
                this.pendingReleaseTasks.add(task);
            }
        } catch (error) {
            // 自定义策略异常时回退到立即释放，避免资源引用永久遗留。
            console.error('[AssetService] 资源释放策略执行失败，已立即释放资源', error);
            release();
        }
    }

    private track<T extends Asset>(scope: string, handle: AssetHandle<T>): void {
        const handles = this.scopedHandles.get(scope) ?? new Set<AssetHandle<Asset>>();
        handles.add(handle);
        this.scopedHandles.set(scope, handles);
    }

    private untrack<T extends Asset>(scope: string, handle: AssetHandle<T>): void {
        const handles = this.scopedHandles.get(scope);
        if (!handles) {
            return;
        }
        handles.delete(handle);
        if (handles.size === 0) {
            this.scopedHandles.delete(scope);
        }
    }
}
