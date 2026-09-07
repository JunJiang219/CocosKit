import { FrameworkModule, ModuleContext } from '../contracts/CoreContracts';
import { KIT_SERVICE_KEYS } from '../service/KitServiceKeys';
import { SceneService } from './SceneService';

/** 场景模块在资源模块之后注册，保证未来可安全接入资源作用域。 */
export class SceneModule implements FrameworkModule {
    public readonly name = 'scene';
    public readonly dependencies = ['assets'];
    private service: SceneService | undefined;

    public register(context: ModuleContext): void {
        this.service = new SceneService(context.logger);
        context.services.register(KIT_SERVICE_KEYS.scenes, this.service);
    }

    public dispose(context: ModuleContext): void {
        context.services.unregister(KIT_SERVICE_KEYS.scenes);
        this.service = undefined;
    }
}
