import type { AssetService } from '../assets/AssetService';
import type { FrameworkModule, ModuleContext } from '../contracts/CoreContracts';
import { KIT_SERVICE_KEYS } from '../service/KitServiceKeys';
import { UIService } from './UIService';

/** 注册 UI 服务，退出时关闭界面并释放其资源。 */
export class UIModule implements FrameworkModule {
    public readonly name = 'ui';
    public readonly dependencies = ['assets'];
    private service: UIService | null = null;

    public register(context: ModuleContext): void {
        const assets = context.services.resolve<AssetService>(KIT_SERVICE_KEYS.assets);
        this.service = new UIService(assets);
        context.services.register(KIT_SERVICE_KEYS.ui, this.service);
    }

    public dispose(context: ModuleContext): void {
        this.service?.dispose();
        context.services.unregister(KIT_SERVICE_KEYS.ui);
        this.service = null;
    }
}
