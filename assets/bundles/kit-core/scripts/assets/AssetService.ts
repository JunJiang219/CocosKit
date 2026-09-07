import { Asset, assetManager } from 'cc';
import { AssetHandle } from './AssetHandle';

type AssetConstructor<T extends Asset> = new (...args: never[]) => T;

/**
 * 对已加载 Bundle 提供高级资源加载与作用域释放。
 */
export class AssetService {
    private readonly scopedHandles = new Map<string, Set<AssetHandle<Asset>>>();

    /** 加载资源并返回显式句柄；路径不带扩展名。 */
    public load<T extends Asset>(
        bundleName: string,
        path: string,
        type: AssetConstructor<T>,
        scope = 'global',
    ): Promise<AssetHandle<T>> {
        const bundle = assetManager.getBundle(bundleName);
        if (!bundle) {
            return Promise.reject(new Error(`资源所在 Bundle 尚未加载：${bundleName}`));
        }

        return new Promise((resolve, reject) => {
            bundle.load(path, type, (error, asset) => {
                if (error) {
                    reject(new Error(`资源加载失败：${bundleName}/${path}，${error.message}`));
                    return;
                }

                let handle: AssetHandle<T>;
                handle = new AssetHandle(asset, () => this.untrack(scope, handle));
                this.track(scope, handle);
                resolve(handle);
            });
        });
    }

    /** 释放一个作用域内的全部句柄。 */
    public releaseScope(scope: string): void {
        const handles = this.scopedHandles.get(scope);
        if (!handles) {
            return;
        }
        [...handles].forEach((handle) => handle.release());
        this.scopedHandles.delete(scope);
    }

    /** 框架销毁时释放全部显式引用。 */
    public releaseAll(): void {
        [...this.scopedHandles.keys()].forEach((scope) => this.releaseScope(scope));
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
