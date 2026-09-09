import { Node, Prefab, instantiate } from 'cc';
import type { AssetHandle } from '../assets/AssetHandle';
import type { AssetService } from '../assets/AssetService';

export type UILayer = 'scene' | 'page' | 'window' | 'popup' | 'toast' | 'guide' | 'overlay';

export interface UIRoute {
    readonly id: string;
    readonly bundle: string;
    readonly prefabPath: string;
    readonly layer?: UILayer;
    readonly cache?: boolean;
}

interface UIViewRecord {
    readonly route: UIRoute;
    readonly node: Node;
    readonly handle: AssetHandle<Prefab>;
}

const UI_LAYERS: readonly UILayer[] = [
    'scene', 'page', 'window', 'popup', 'toast', 'guide', 'overlay',
];

/** Prefab 驱动的轻量 UI 路由、层级和返回栈。 */
export class UIService {
    private readonly routes = new Map<string, UIRoute>();
    private readonly views = new Map<string, UIViewRecord>();
    private readonly layerRoots = new Map<UILayer, Node>();
    private readonly stack: string[] = [];
    private root: Node | null = null;

    public constructor(private readonly assets: AssetService) {}

    /** 绑定 Canvas 下的 UI 根节点，并按固定顺序创建层级节点。 */
    public bindRoot(root: Node): void {
        if (this.root === root) {
            return;
        }
        this.closeAll();
        this.layerRoots.forEach((layer) => layer.destroy());
        this.layerRoots.clear();
        this.root = root;
        UI_LAYERS.forEach((layer) => {
            const node = new Node(`kit-ui-${layer}`);
            root.addChild(node);
            this.layerRoots.set(layer, node);
        });
    }

    public register(route: UIRoute): void {
        if (!route.id.trim()) {
            throw new Error('UI 路由 ID 不能为空');
        }
        if (this.routes.has(route.id)) {
            throw new Error(`UI 路由重复注册：${route.id}`);
        }
        this.routes.set(route.id, route);
    }

    /** 打开界面；参数通过 kit-ui-open 节点事件交给具体组件。 */
    public async open<TParams = unknown>(id: string, params?: TParams): Promise<Node> {
        const route = this.requireRoute(id);
        this.requireRoot();
        const existing = this.views.get(id);
        if (existing) {
            this.attach(existing);
            existing.node.emit('kit-ui-open', params);
            this.pushStack(id);
            return existing.node;
        }

        const handle = await this.assets.load(route.bundle, route.prefabPath, Prefab, {
            scope: `kit.ui.${id}`,
        });
        let node: Node | null = null;
        try {
            node = instantiate(handle.asset);
            const record: UIViewRecord = {
                route,
                node,
                handle,
            };
            this.views.set(id, record);
            this.attach(record);
            record.node.emit('kit-ui-open', params);
            this.pushStack(id);
            return record.node;
        } catch (error) {
            node?.destroy();
            this.views.delete(id);
            this.removeFromStack(id);
            this.assets.release(handle);
            throw error;
        }
    }

    /** 关闭界面；缓存界面只隐藏，非缓存界面同时释放 Prefab 引用。 */
    public close(id: string): void {
        const record = this.views.get(id);
        if (!record) {
            return;
        }
        record.node.emit('kit-ui-close');
        this.removeFromStack(id);
        if (record.route.cache) {
            record.node.active = false;
            record.node.removeFromParent();
            return;
        }
        this.destroyRecord(id, record);
    }

    public back(): boolean {
        const id = this.stack[this.stack.length - 1];
        if (!id) {
            return false;
        }
        this.close(id);
        return true;
    }

    public closeAll(): void {
        [...this.views].forEach(([id, record]) => this.destroyRecord(id, record));
        this.stack.length = 0;
    }

    /** 内核退出时同时清理界面、层级节点和路由。 */
    public dispose(): void {
        this.closeAll();
        this.layerRoots.forEach((layer) => layer.destroy());
        this.layerRoots.clear();
        this.routes.clear();
        this.root = null;
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
        record.node.destroy();
        this.assets.release(record.handle);
        this.views.delete(id);
        this.removeFromStack(id);
    }

    private requireRoute(id: string): UIRoute {
        const route = this.routes.get(id);
        if (!route) {
            throw new Error(`UI 路由不存在：${id}`);
        }
        return route;
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
