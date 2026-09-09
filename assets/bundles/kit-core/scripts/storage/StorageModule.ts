import type { FrameworkModule, ModuleContext } from '../contracts/CoreContracts';
import { KIT_SERVICE_KEYS } from '../service/KitServiceKeys';
import { StorageService, createDefaultStorage } from './StorageService';

/** 注册本地存储服务。 */
export class StorageModule implements FrameworkModule {
    public readonly name = 'storage';
    private readonly service = new StorageService(createDefaultStorage());

    public register(context: ModuleContext): void {
        context.services.register(KIT_SERVICE_KEYS.storage, this.service);
    }

    public dispose(context: ModuleContext): void {
        context.services.unregister(KIT_SERVICE_KEYS.storage);
    }
}
