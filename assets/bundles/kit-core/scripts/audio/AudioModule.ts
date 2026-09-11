import type { AssetService } from '../assets/AssetService';
import type { FrameworkModule, ModuleContext } from '../contracts/CoreContracts';
import type { LifecycleService } from '../lifecycle/LifecycleService';
import { KIT_SERVICE_KEYS } from '../service/KitServiceKeys';
import { AudioService } from './AudioService';

/** 注册音频服务，退出时停止播放并释放资源。 */
export class AudioModule implements FrameworkModule {
    public readonly name = 'audio';
    public readonly dependencies = ['assets', 'lifecycle'];
    private service: AudioService | null = null;
    private unsubscribeLifecycle: (() => void) | null = null;

    public register(context: ModuleContext): void {
        const assets = context.services.resolve<AssetService>(KIT_SERVICE_KEYS.assets);
        const lifecycle = context.services.resolve<LifecycleService>(KIT_SERVICE_KEYS.lifecycle);
        this.service = new AudioService(assets);
        this.unsubscribeLifecycle = lifecycle.onStateChange(({ current }) => {
            if (current === 'background') {
                this.service?.pause();
            } else {
                this.service?.resume();
            }
        });
        context.services.register(KIT_SERVICE_KEYS.audio, this.service);
    }

    public dispose(context: ModuleContext): void {
        this.unsubscribeLifecycle?.();
        this.unsubscribeLifecycle = null;
        this.service?.dispose();
        context.services.unregister(KIT_SERVICE_KEYS.audio);
        this.service = null;
    }
}
