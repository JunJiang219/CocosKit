import { game, Game } from 'cc';
import type { FrameworkModule, ModuleContext } from '../contracts/CoreContracts';
import { KIT_SERVICE_KEYS } from '../service/KitServiceKeys';
import { LifecycleService } from './LifecycleService';

/** 注册统一生命周期服务，并管理 Creator 事件监听的释放。 */
export class LifecycleModule implements FrameworkModule {
    public readonly name = 'lifecycle';
    private readonly service = new LifecycleService();
    private readonly enterBackground = (): void => this.service.setAppState('background');
    private readonly enterForeground = (): void => this.service.setAppState('active');

    public register(context: ModuleContext): void {
        context.services.register(KIT_SERVICE_KEYS.lifecycle, this.service);
    }

    public initialize(): void {
        game.on(Game.EVENT_HIDE, this.enterBackground);
        game.on(Game.EVENT_SHOW, this.enterForeground);
    }

    public dispose(context: ModuleContext): void {
        game.off(Game.EVENT_HIDE, this.enterBackground);
        game.off(Game.EVENT_SHOW, this.enterForeground);
        this.service.clear();
        context.services.unregister(KIT_SERVICE_KEYS.lifecycle);
    }
}
