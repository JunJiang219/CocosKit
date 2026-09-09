import type { AssetService } from '../assets/AssetService';
import type { FrameworkModule, ModuleContext } from '../contracts/CoreContracts';
import { KIT_SERVICE_KEYS } from '../service/KitServiceKeys';
import { DataService } from './DataService';

/** 注册配置数据服务。 */
export class DataModule implements FrameworkModule {
    public readonly name = 'data';
    public readonly dependencies = ['assets'];
    private service: DataService | null = null;

    public register(context: ModuleContext): void {
        const assets = context.services.resolve<AssetService>(KIT_SERVICE_KEYS.assets);
        this.service = new DataService(assets);
        context.services.register(KIT_SERVICE_KEYS.data, this.service);
    }

    public dispose(context: ModuleContext): void {
        this.service?.clear();
        context.services.unregister(KIT_SERVICE_KEYS.data);
        this.service = null;
    }
}
