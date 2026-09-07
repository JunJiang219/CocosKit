import {
    EventHandler,
    EventKey,
    IEventBus,
    Unsubscribe,
} from '../contracts/CoreContracts';

/** 同步进程内事件总线，订阅者必须保存并调用取消函数。 */
export class EventBus implements IEventBus {
    private readonly listeners = new Map<EventKey, Set<EventHandler<unknown>>>();

    /** 订阅事件并返回幂等的取消订阅函数。 */
    public on<T>(event: EventKey, handler: EventHandler<T>): Unsubscribe {
        const listeners = this.getOrCreateListeners(event);
        const storedHandler = handler as EventHandler<unknown>;
        listeners.add(storedHandler);

        return () => {
            listeners.delete(storedHandler);
            if (listeners.size === 0) {
                this.listeners.delete(event);
            }
        };
    }

    /** 按订阅顺序同步发送事件。复制集合可避免回调中退订影响本轮派发。 */
    public emit<T>(event: EventKey, payload: T): void {
        const listeners = this.listeners.get(event);
        if (!listeners) {
            return;
        }
        [...listeners].forEach((handler) => handler(payload));
    }

    /** 清理指定事件；不传事件时清理全部订阅。 */
    public clear(event?: EventKey): void {
        if (event === undefined) {
            this.listeners.clear();
            return;
        }
        this.listeners.delete(event);
    }

    private getOrCreateListeners(event: EventKey): Set<EventHandler<unknown>> {
        const existing = this.listeners.get(event);
        if (existing) {
            return existing;
        }

        const created = new Set<EventHandler<unknown>>();
        this.listeners.set(event, created);
        return created;
    }
}
