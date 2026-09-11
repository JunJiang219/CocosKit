import { FrameworkModule, ModuleContext } from '../contracts/CoreContracts';
import { LifecycleService } from '../lifecycle/LifecycleService';
import { KIT_SERVICE_KEYS } from '../service/KitServiceKeys';
import { SceneService } from './SceneService';

/** 场景模块在资源模块之后注册，保证未来可安全接入资源作用域。 */
export class SceneModule implements FrameworkModule {
    public readonly name = 'scene';
    public readonly dependencies = ['assets', 'lifecycle'];
    private service: SceneService | undefined;

    public register(context: ModuleContext): void {
        const lifecycle = context.services.resolve<LifecycleService>(KIT_SERVICE_KEYS.lifecycle);
        this.service = new SceneService(context.logger, lifecycle);
        context.services.register(KIT_SERVICE_KEYS.scenes, this.service);
    }

    public dispose(context: ModuleContext): void {
        context.services.unregister(KIT_SERVICE_KEYS.scenes);
        this.service = undefined;
    }
}
