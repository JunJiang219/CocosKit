import { IServiceContainer, ServiceToken } from '../contracts/CoreContracts';

/** 小型显式服务容器，不做自动扫描或反射注入。 */
export class ServiceContainer implements IServiceContainer {
    private readonly services = new Map<ServiceToken<unknown>, unknown>();

    /** 注册服务；重复注册通常表示模块边界有问题，因此直接报错。 */
    public register<T>(token: ServiceToken<T>, service: T): void {
        if (this.services.has(token)) {
            throw new Error(`服务重复注册：${String(token)}`);
        }
        this.services.set(token, service);
    }

    /** 获取必需服务。 */
    public resolve<T>(token: ServiceToken<T>): T {
        const service = this.tryResolve<T>(token);
        if (service === undefined) {
            throw new Error(`服务不存在：${String(token)}`);
        }
        return service;
    }

    /** 获取可选服务。 */
    public tryResolve<T>(token: ServiceToken<T>): T | undefined {
        return this.services.get(token) as T | undefined;
    }

    /** 注销指定服务。 */
    public unregister<T>(token: ServiceToken<T>): boolean {
        return this.services.delete(token);
    }

    /** 清空容器，只在框架销毁阶段调用。 */
    public clear(): void {
        this.services.clear();
    }
}
