import type { FrameworkModule, ModuleContext } from '../contracts/CoreContracts';
import { KIT_SERVICE_KEYS } from '../service/KitServiceKeys';
import { NetworkService } from './NetworkService';

/** 注册网络服务，并在退出时关闭所有长连接。 */
export class NetworkModule implements FrameworkModule {
    public readonly name = 'network';
    private readonly service = new NetworkService();

    public register(context: ModuleContext): void {
        context.services.register(KIT_SERVICE_KEYS.network, this.service);
    }

    public dispose(context: ModuleContext): void {
        this.service.dispose();
        context.services.unregister(KIT_SERVICE_KEYS.network);
    }
}
