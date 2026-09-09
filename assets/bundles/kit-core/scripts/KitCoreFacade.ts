import type { AssetService } from './assets/AssetService';

/** 对外开放的资源能力，不包含仅供内核销毁阶段使用的 releaseAll。 */
export type KitAssetsFacade = Pick<
    AssetService,
    'load' | 'loadMany' | 'loadDir' | 'loadRemote' | 'release' | 'releaseScope'
>;

/** kit-core 对启动层和业务层公开的统一门面。 */
export interface KitCoreFacade {
    readonly assets: KitAssetsFacade;
    readonly scenes: {
        enterBundleScene(bundleName: string, scenePath: string): Promise<void>;
        enterMainScene(sceneName: string): Promise<void>;
    };
    boot(): Promise<void>;
    shutdown(): Promise<void>;
}

declare global {
    /** kit-core 的脚本随 Bundle 加载后会把门面注册到这里。 */
    var cocosKitCore: KitCoreFacade | undefined;
}
