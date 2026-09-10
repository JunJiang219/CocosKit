import { Node, Prefab, instantiate } from 'cc';
import type { AssetHandle } from '../assets/AssetHandle';
import type { AssetService } from '../assets/AssetService';
import type { UITransition } from './UITransition';

export type UILayer = 'scene' | 'page' | 'window' | 'popup' | 'toast' | 'guide' | 'overlay';
export type UIViewState = 'opening' | 'opened' | 'closing' | 'closed';

export interface UIRoute {
    readonly id: string;
    readonly bundle: string;
    readonly prefabPath: string;
    readonly layer?: UILayer;
    readonly cache?: boolean;
    readonly transition?: UITransition;
}

interface UIViewRecord {
    readonly route: UIRoute;
    readonly node: Node;
    readonly handle: AssetHandle<Prefab>;
    readonly transition?: UITransition;
    state: UIViewState;
}

const UI_LAYERS: readonly UILayer[] = [
    'scene', 'page', 'window', 'popup', 'toast', 'guide', 'overlay',
];

/** Prefab 驱动的轻量 UI 路由、层级、返回栈和开关动画流程。 */
export class UIService {
    private readonly routes = new Map<string, UIRoute>();
    private readonly views = new Map<string, UIViewRecord>();
    private readonly layerRoots = new Map<UILayer, Node>();
    private readonly defaultTransitions = new Map<UILayer, UITransition>();
    private readonly openingRequests = new Map<string, Promise<Node>>();
    private readonly closingRequests = new Map<string, Promise<void>>();
    private readonly stack: string[] = [];
    private root: Node | null = null;
    private generation = 0;

    public constructor(private readonly assets: AssetService) {}

    /** 绑定 Canvas 下的 UI 根节点，并按固定顺序创建层级节点。 */
    public bindRoot(root: Node): void {
        if (this.root === root) {
            return;
        }
        this.closeAll();
        this.destroyLayerRoots();
        this.root = root;
        UI_LAYERS.forEach((layer) => {
            const node = new Node(`kit-ui-${layer}`);
            root.addChild(node);
            this.layerRoots.set(layer, node);
        });
    }

    /** 先校验整批路由再注册，任意一项错误都不会产生部分注册。 */
    public registerMany(routes: readonly UIRoute[]): void {
        const pendingIds = new Set<string>();
        routes.forEach((route) => {
            const id = route.id.trim();
            if (!id) {
                throw new Error('UI 路由 ID 不能为空');
            }
            if (this.routes.has(id) || pendingIds.has(id)) {
                throw new Error(`UI 路由重复注册：${id}`);
            }
            pendingIds.add(id);
        });
        routes.forEach((route) => {
            const id = route.id.trim();
            this.routes.set(id, id === route.id ? route : { ...route, id });
        });
    }

    /** 设置层级默认动画，只影响此后创建的 UI 实例。 */
    public setDefaultTransition(layer: UILayer, transition: UITransition): void {
        this.defaultTransitions.set(layer, transition);
    }

    public clearDefaultTransition(layer: UILayer): void {
        this.defaultTransitions.delete(layer);
    }

    /** 同一界面的并发打开请求复用一个 Promise，避免重复加载和实例化。 */
    public open<TParams = unknown>(id: string, params?: TParams): Promise<Node> {
        const routeId = id.trim();
        const pending = this.openingRequests.get(routeId);
        if (pending) {
            return pending;
        }

        const request = this.openInternal(routeId, params);
        this.openingRequests.set(routeId, request);
        const cleanup = (): void => {
            if (this.openingRequests.get(routeId) === request) {
                this.openingRequests.delete(routeId);
            }
        };
        void request.then(cleanup, cleanup);
        return request;
    }

    /** 等待关闭动画完成后，再隐藏缓存界面或销毁普通界面。 */
    public close(id: string): Promise<void> {
        const routeId = id.trim();
        const pending = this.closingRequests.get(routeId);
        if (pending) {
            return pending;
        }

        const request = this.closeInternal(routeId);
        this.closingRequests.set(routeId, request);
        const cleanup = (): void => {
            if (this.closingRequests.get(routeId) === request) {
                this.closingRequests.delete(routeId);
            }
        };
        void request.then(cleanup, cleanup);
        return request;
    }

    public async back(): Promise<boolean> {
        const id = this.stack[this.stack.length - 1];
        if (!id) {
            return false;
        }
        await this.close(id);
        return true;
    }

    /** 批量清理用于切场景和退出，不等待表现动画。 */
    public closeAll(): void {
        this.generation += 1;
        [...this.views].forEach(([id, record]) => this.destroyRecord(id, record));
        this.stack.length = 0;
    }

    /** 内核退出时同时清理界面、层级节点和路由。 */
    public dispose(): void {
        this.closeAll();
        this.destroyLayerRoots();
        this.routes.clear();
        this.defaultTransitions.clear();
        this.root = null;
    }

    private async openInternal<TParams>(id: string, params?: TParams): Promise<Node> {
        const route = this.requireRoute(id);
        this.requireRoot();
        await this.closingRequests.get(id);

        const existing = this.views.get(id);
        if (existing) {
            if (existing.state === 'opened') {
                existing.node.emit('kit-ui-open', params);
                this.pushStack(id);
                return existing.node;
            }
            await this.playOpen(existing, params);
            return existing.node;
        }

        return this.loadAndOpen(route, params);
    }

    private async loadAndOpen<TParams>(route: UIRoute, params?: TParams): Promise<Node> {
        const generation = this.generation;
        const handle = await this.assets.load(route.bundle, route.prefabPath, Prefab, {
            scope: `kit.ui.${route.id}`,
        });
        let record: UIViewRecord | null = null;
        try {
            if (generation !== this.generation) {
                throw new Error(`UI 打开过程已被取消：${route.id}`);
            }
            record = {
                route,
                node: instantiate(handle.asset),
                handle,
                transition: this.resolveTransition(route),
                state: 'closed',
            };
            this.views.set(route.id, record);
            await this.playOpen(record, params);
            return record.node;
        } catch (error) {
            if (record && this.views.get(route.id) === record) {
                this.destroyRecord(route.id, record);
            } else if (!record) {
                this.assets.release(handle);
            }
            throw error;
        }
    }

    private async playOpen<TParams>(record: UIViewRecord, params?: TParams): Promise<void> {
        try {
            this.attach(record);
            record.state = 'opening';
            record.node.emit('kit-ui-open', params);
            this.pushStack(record.route.id);
            await record.transition?.playOpen(record.node);
            if (this.views.get(record.route.id) !== record) {
                throw new Error(`UI 打开过程已被取消：${record.route.id}`);
            }
            record.state = 'opened';
            record.node.emit('kit-ui-opened', params);
        } catch (error) {
            this.destroyRecord(record.route.id, record);
            throw error;
        }
    }

    private async closeInternal(id: string): Promise<void> {
        try {
            await this.openingRequests.get(id);
        } catch {
            return;
        }

        const record = this.views.get(id);
        if (!record || record.state === 'closed') {
            return;
        }

        record.state = 'closing';
        this.removeFromStack(id);
        let transitionError: unknown;
        let transitionFailed = false;
        try {
            record.node.emit('kit-ui-close');
            await record.transition?.playClose(record.node);
            if (this.views.get(id) === record) {
                record.node.emit('kit-ui-closed');
            }
        } catch (error) {
            transitionFailed = true;
            transitionError = error;
        }

        if (this.views.get(id) === record) {
            if (record.route.cache) {
                record.state = 'closed';
                record.node.active = false;
                record.node.removeFromParent();
            } else {
                this.destroyRecord(id, record);
            }
        }

        if (transitionFailed) {
            throw transitionError;
        }
    }

    private attach(record: UIViewRecord): void {
        const layer = record.route.layer ?? 'window';
        const layerRoot = this.layerRoots.get(layer);
        if (!this.root || !layerRoot) {
            throw new Error('UI 根节点尚未绑定，请先调用 bindRoot');
        }
        record.node.active = true;
        layerRoot.addChild(record.node);
    }

    private destroyRecord(id: string, record: UIViewRecord): void {
        if (this.views.get(id) !== record) {
            return;
        }
        record.state = 'closed';
        record.transition?.cancel?.(record.node);
        record.node.destroy();
        this.assets.release(record.handle);
        this.views.delete(id);
        this.removeFromStack(id);
    }

    private destroyLayerRoots(): void {
        this.layerRoots.forEach((layer) => layer.destroy());
        this.layerRoots.clear();
    }

    private requireRoute(id: string): UIRoute {
        const route = this.routes.get(id);
        if (!route) {
            throw new Error(`UI 路由不存在：${id}`);
        }
        return route;
    }

    private resolveTransition(route: UIRoute): UITransition | undefined {
        const layer = route.layer ?? 'window';
        return route.transition ?? this.defaultTransitions.get(layer);
    }

    private requireRoot(): Node {
        if (!this.root) {
            throw new Error('UI 根节点尚未绑定，请先调用 bindRoot');
        }
        return this.root;
    }

    private pushStack(id: string): void {
        this.removeFromStack(id);
        this.stack.push(id);
    }

    private removeFromStack(id: string): void {
        const index = this.stack.lastIndexOf(id);
        if (index >= 0) {
            this.stack.splice(index, 1);
        }
    }
}
