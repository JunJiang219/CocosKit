import { _decorator, Component, Label, Node, UITransform } from 'cc';

const { ccclass, property } = _decorator;

/** 启动信息展示组件；没有绑定 Label 时退化为控制台输出。 */
@ccclass('LaunchView')
export class LaunchView extends Component {
    @property(Label)
    private statusLabel: Label | null = null;

    protected onLoad(): void {
        if (!this.statusLabel) {
            this.statusLabel = this.createDefaultLabel();
        }
    }

    /** 更新启动状态。 */
    public showStatus(message: string): void {
        if (this.statusLabel) {
            this.statusLabel.string = message;
        }
        console.info(`[Launch] ${message}`);
    }

    /** 展示可读错误，同时保留完整错误到控制台。 */
    public showError(error: unknown): void {
        const message = error instanceof Error ? error.message : String(error);
        if (this.statusLabel) {
            this.statusLabel.string = `启动失败：${message}`;
        }
        console.error('[Launch] 启动失败', error);
    }

    /** 阶段一没有额外 Prefab，运行时创建一个最小状态文本。 */
    private createDefaultLabel(): Label {
        const statusNode = new Node('LaunchStatus');
        statusNode.layer = this.node.layer;
        statusNode.parent = this.node;

        const transform = statusNode.addComponent(UITransform);
        transform.setContentSize(1000, 80);

        const label = statusNode.addComponent(Label);
        label.fontSize = 28;
        label.lineHeight = 36;
        label.string = '正在启动 CocosKit…';
        return label;
    }
}
