import type { FrameworkModule, ModuleContext } from '../contracts/CoreContracts';
import { KIT_SERVICE_KEYS } from '../service/KitServiceKeys';
import { PlatformService, WebPlatformAdapter } from './PlatformService';

/** 注册当前 Web Mobile 平台的默认适配器。 */
export class PlatformModule implements FrameworkModule {
    public readonly name = 'platform';
    private readonly service = new PlatformService(new WebPlatformAdapter());

    public register(context: ModuleContext): void {
        context.services.register(KIT_SERVICE_KEYS.platform, this.service);
    }

    public dispose(context: ModuleContext): void {
        context.services.unregister(KIT_SERVICE_KEYS.platform);
    }
}
