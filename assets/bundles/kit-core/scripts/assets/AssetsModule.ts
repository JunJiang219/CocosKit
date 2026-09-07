import { FrameworkModule, ModuleContext } from '../contracts/CoreContracts';
import { KIT_SERVICE_KEYS } from '../service/KitServiceKeys';
import { AssetService } from './AssetService';

/** 注册资源服务，并在模块销毁时回收所有显式资源引用。 */
export class AssetsModule implements FrameworkModule {
    public readonly name = 'assets';
    private readonly service = new AssetService();

    public register(context: ModuleContext): void {
        context.services.register(KIT_SERVICE_KEYS.assets, this.service);
    }

    public dispose(context: ModuleContext): void {
        this.service.releaseAll();
        context.services.unregister(KIT_SERVICE_KEYS.assets);
    }
}
