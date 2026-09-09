import type { AssetService } from './assets/AssetService';
import type { AudioService } from './audio/AudioService';
import type { DataService } from './data/DataService';
import type { NetworkService } from './network/NetworkService';
import type { PlatformService } from './platform/PlatformService';
import type { StorageService } from './storage/StorageService';
import type { UIService } from './ui/UIService';

/** 对外开放的资源能力，不包含仅供内核销毁阶段使用的 releaseAll。 */
export type KitAssetsFacade = Pick<
    AssetService,
    'load' | 'loadMany' | 'loadDir' | 'loadRemote' | 'release' | 'releaseScope'
>;

export type KitUIFacade = Pick<
    UIService,
    'bindRoot' | 'register' | 'open' | 'close' | 'back'
>;

export type KitDataFacade = Pick<
    DataService,
    'loadTable' | 'registerTable' | 'getTable' | 'unload'
>;

export type KitStorageFacade = Pick<StorageService, 'partition'>;

export type KitAudioFacade = Pick<
    AudioService,
    | 'playMusic'
    | 'playEffect'
    | 'stopMusic'
    | 'setMusicVolume'
    | 'setEffectVolume'
    | 'setMuted'
>;

export type KitNetworkFacade = Pick<
    NetworkService,
    'configure' | 'request' | 'openSocket' | 'closeSocket'
>;

export type KitPlatformFacade = Pick<
    PlatformService,
    'name' | 'use' | 'supports' | 'copyText' | 'vibrate' | 'openUrl'
>;

/** kit-core 对启动层和业务层公开的统一门面。 */
export interface KitCoreFacade {
    readonly assets: KitAssetsFacade;
    readonly ui: KitUIFacade;
    readonly data: KitDataFacade;
    readonly storage: KitStorageFacade;
    readonly audio: KitAudioFacade;
    readonly network: KitNetworkFacade;
    readonly platform: KitPlatformFacade;
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
