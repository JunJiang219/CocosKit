import type { Unsubscribe } from '../contracts/CoreContracts';

export type AppLifecycleState = 'active' | 'background';

export interface AppStateChange {
    readonly previous: AppLifecycleState;
    readonly current: AppLifecycleState;
}

export interface SceneChangeTarget {
    readonly source: 'main' | 'bundle';
    readonly sceneName: string;
    readonly bundleName?: string;
}

export interface SceneChangeResult {
    readonly target: SceneChangeTarget;
    readonly success: boolean;
    readonly error?: unknown;
}

type Listener<T> = (event: T) => void;

/**
 * 汇总应用与场景生命周期。
 * 引擎适配器负责写入状态，业务只订阅变化，不直接监听各平台事件。
 */
export class LifecycleService {
    private currentState: AppLifecycleState = 'active';
    private readonly stateListeners = new Set<Listener<AppStateChange>>();
    private readonly beforeSceneListeners = new Set<Listener<SceneChangeTarget>>();
    private readonly afterSceneListeners = new Set<Listener<SceneChangeResult>>();

    public get state(): AppLifecycleState {
        return this.currentState;
    }

    public get isActive(): boolean {
        return this.currentState === 'active';
    }

    public onStateChange(listener: Listener<AppStateChange>): Unsubscribe {
        return this.subscribe(this.stateListeners, listener);
    }

    public onBeforeSceneChange(listener: Listener<SceneChangeTarget>): Unsubscribe {
        return this.subscribe(this.beforeSceneListeners, listener);
    }

    public onAfterSceneChange(listener: Listener<SceneChangeResult>): Unsubscribe {
        return this.subscribe(this.afterSceneListeners, listener);
    }

    /** 供平台适配层更新前后台状态；相同状态不会重复派发。 */
    public setAppState(next: AppLifecycleState): void {
        if (next === this.currentState) {
            return;
        }
        const change: AppStateChange = {
            previous: this.currentState,
            current: next,
        };
        this.currentState = next;
        this.emit(this.stateListeners, change);
    }

    /** 由场景服务在真正发起切换前调用。 */
    public notifyBeforeSceneChange(target: SceneChangeTarget): void {
        this.emit(this.beforeSceneListeners, target);
    }

    /** 无论切换成功还是失败都派发，便于调用方成对收尾。 */
    public notifyAfterSceneChange(result: SceneChangeResult): void {
        this.emit(this.afterSceneListeners, result);
    }

    public clear(): void {
        this.stateListeners.clear();
        this.beforeSceneListeners.clear();
        this.afterSceneListeners.clear();
    }

    private subscribe<T>(listeners: Set<Listener<T>>, listener: Listener<T>): Unsubscribe {
        listeners.add(listener);
        return () => listeners.delete(listener);
    }

    private emit<T>(listeners: Set<Listener<T>>, event: T): void {
        // 使用副本，允许监听器在回调期间安全取消订阅。
        [...listeners].forEach((listener) => listener(event));
    }
}
