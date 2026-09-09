import type { AssetService } from '../assets/AssetService';
import type { FrameworkModule, ModuleContext } from '../contracts/CoreContracts';
import { KIT_SERVICE_KEYS } from '../service/KitServiceKeys';
import { AudioService } from './AudioService';

/** 注册音频服务，退出时停止播放并释放资源。 */
export class AudioModule implements FrameworkModule {
    public readonly name = 'audio';
    public readonly dependencies = ['assets'];
    private service: AudioService | null = null;

    public register(context: ModuleContext): void {
        const assets = context.services.resolve<AssetService>(KIT_SERVICE_KEYS.assets);
        this.service = new AudioService(assets);
        context.services.register(KIT_SERVICE_KEYS.audio, this.service);
    }

    public dispose(context: ModuleContext): void {
        this.service?.dispose();
        context.services.unregister(KIT_SERVICE_KEYS.audio);
        this.service = null;
    }
}
