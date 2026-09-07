/** 服务键使用字符串或 Symbol，阶段一使用集中声明的字符串键。 */
export type ServiceToken<T> = string | symbol;

/** 最小服务容器契约。 */
export interface IServiceContainer {
    register<T>(token: ServiceToken<T>, service: T): void;
    resolve<T>(token: ServiceToken<T>): T;
    tryResolve<T>(token: ServiceToken<T>): T | undefined;
    unregister<T>(token: ServiceToken<T>): boolean;
    clear(): void;
}

export type EventKey = string | symbol;
export type EventHandler<T> = (payload: T) => void;
export type Unsubscribe = () => void;

/** 进程内事件契约。 */
export interface IEventBus {
    on<T>(event: EventKey, handler: EventHandler<T>): Unsubscribe;
    emit<T>(event: EventKey, payload: T): void;
    clear(event?: EventKey): void;
}

/** 日志契约，业务不需要知道具体输出目标。 */
export interface ILogger {
    debug(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
}

/** 生命周期执行时提供给模块的公共上下文。 */
export interface ModuleContext {
    readonly services: IServiceContainer;
    readonly events: IEventBus;
    readonly logger: ILogger;
}

/** 所有代码模块遵循同一套生命周期。 */
export interface FrameworkModule {
    readonly name: string;
    readonly dependencies?: readonly string[];
    register(context: ModuleContext): void | Promise<void>;
    initialize?(context: ModuleContext): void | Promise<void>;
    start?(context: ModuleContext): void | Promise<void>;
    stop?(context: ModuleContext): void | Promise<void>;
    dispose?(context: ModuleContext): void | Promise<void>;
}

export type ModuleState = 'discovered' | 'registered' | 'initialized' | 'running' | 'disposed';
