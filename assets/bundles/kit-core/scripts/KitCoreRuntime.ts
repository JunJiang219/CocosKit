import { AssetService } from './assets/AssetService';
import { AssetsModule } from './assets/AssetsModule';
import { AudioModule } from './audio/AudioModule';
import { AudioService } from './audio/AudioService';
import { ModuleContext } from './contracts/CoreContracts';
import { DataModule } from './data/DataModule';
import { DataService } from './data/DataService';
import { EventBus } from './event/EventBus';
import { KitCoreFacade } from './KitCoreFacade';
import { Logger } from './log/Logger';
import { ModuleManager } from './module/ModuleManager';
import { NetworkModule } from './network/NetworkModule';
import { NetworkService } from './network/NetworkService';
import { PlatformModule } from './platform/PlatformModule';
import { PlatformService } from './platform/PlatformService';
import { SceneModule } from './scene/SceneModule';
import { SceneService } from './scene/SceneService';
import { ServiceContainer } from './service/ServiceContainer';
import { KIT_SERVICE_KEYS } from './service/KitServiceKeys';
import { StorageModule } from './storage/StorageModule';
import { StorageService } from './storage/StorageService';
import { UIModule } from './ui/UIModule';
import { UIService } from './ui/UIService';

/** 组装内核模块，并通过统一门面隐藏服务容器等内部结构。 */
export class KitCoreRuntime implements KitCoreFacade {
    private readonly services = new ServiceContainer();
    private readonly events = new EventBus();
    private readonly logger = new Logger('kit-core');
    private readonly modules: ModuleManager;
    private booted = false;

    public constructor() {
        const context: ModuleContext = {
            services: this.services,
            events: this.events,
            logger: this.logger,
        };
        this.modules = new ModuleManager(context);
        this.modules.add(new AssetsModule());
        this.modules.add(new SceneModule());
        this.modules.add(new UIModule());
        this.modules.add(new DataModule());
        this.modules.add(new StorageModule());
        this.modules.add(new AudioModule());
        this.modules.add(new NetworkModule());
        this.modules.add(new PlatformModule());
    }

    /** 暴露场景门面，不暴露服务容器本身。 */
    public get scenes(): SceneService {
        return this.services.resolve<SceneService>(KIT_SERVICE_KEYS.scenes);
    }

    /** 启动全部内核模块，重复调用不会重复注册。 */
    public async boot(): Promise<void> {
        if (this.booted) {
            return;
        }
        await this.modules.boot();
        this.booted = true;
        this.logger.info('通用模块初始化完成');
    }

    /** 按依赖反序销毁模块、事件和服务。 */
    public async shutdown(): Promise<void> {
        if (!this.booted) {
            return;
        }
        await this.modules.shutdown();
        this.events.clear();
        this.services.clear();
        this.booted = false;
        this.logger.info('通用模块已释放');
    }

    /** 通过门面对外提供受控的资源服务能力。 */
    public get assets(): AssetService {
        return this.services.resolve<AssetService>(KIT_SERVICE_KEYS.assets);
    }

    public get ui(): UIService {
        return this.services.resolve<UIService>(KIT_SERVICE_KEYS.ui);
    }

    public get data(): DataService {
        return this.services.resolve<DataService>(KIT_SERVICE_KEYS.data);
    }

    public get storage(): StorageService {
        return this.services.resolve<StorageService>(KIT_SERVICE_KEYS.storage);
    }

    public get audio(): AudioService {
        return this.services.resolve<AudioService>(KIT_SERVICE_KEYS.audio);
    }

    public get network(): NetworkService {
        return this.services.resolve<NetworkService>(KIT_SERVICE_KEYS.network);
    }

    public get platform(): PlatformService {
        return this.services.resolve<PlatformService>(KIT_SERVICE_KEYS.platform);
    }
}
