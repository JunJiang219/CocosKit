import { AssetManager, assetManager } from 'cc';
import { BundleCatalog } from './BundleCatalog';

/**
 * 启动层的底层 Bundle 加载器。
 * 它不依赖 kit-core，确保内核尚未加载时也能工作。
 */
export class BundleLoader {
    private readonly loading = new Map<string, Promise<AssetManager.Bundle>>();

    /** 按清单依赖顺序加载 Bundle，已经加载的 Bundle 会直接复用。 */
    public async loadWithDependencies(
        catalog: BundleCatalog,
        name: string,
    ): Promise<AssetManager.Bundle> {
        for (const definition of catalog.getLoadOrder(name)) {
            await this.load(definition.name);
        }
        return this.require(name);
    }

    /** 加载单个 Bundle，并合并同一 Bundle 的并发请求。 */
    public load(nameOrUrl: string): Promise<AssetManager.Bundle> {
        const loaded = assetManager.getBundle(nameOrUrl);
        if (loaded) {
            return Promise.resolve(loaded);
        }

        const pending = this.loading.get(nameOrUrl);
        if (pending) {
            return pending;
        }

        const request = this.createLoadRequest(nameOrUrl);
        this.loading.set(nameOrUrl, request);
        const clearPending = (): void => {
            this.loading.delete(nameOrUrl);
        };
        request.then(clearPending, clearPending);
        return request;
    }

    /** 获取已加载 Bundle；未加载时明确报错。 */
    public require(name: string): AssetManager.Bundle {
        const bundle = assetManager.getBundle(name);
        if (!bundle) {
            throw new Error(`Bundle 尚未加载：${name}`);
        }
        return bundle;
    }

    /** 释放 Bundle 内资产并从 AssetManager 移除 Bundle。 */
    public unload(name: string): boolean {
        const bundle = assetManager.getBundle(name);
        if (!bundle) {
            return false;
        }

        bundle.releaseAll();
        assetManager.removeBundle(bundle);
        return true;
    }

    private createLoadRequest(nameOrUrl: string): Promise<AssetManager.Bundle> {
        return new Promise((resolve, reject) => {
            assetManager.loadBundle(nameOrUrl, (error, bundle) => {
                if (error) {
                    reject(new Error(`Bundle 加载失败：${nameOrUrl}，${error.message}`));
                    return;
                }
                resolve(bundle);
            });
        });
    }
}
