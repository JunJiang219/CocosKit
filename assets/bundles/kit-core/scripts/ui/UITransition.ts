import { Animation, Node, Tween, UIOpacity, Vec3, tween } from 'cc';
import type { AnimationState, TweenEasing } from 'cc';

/** UI 开关动画只负责表现，不处理节点挂载和资源释放。 */
export interface UITransition {
    playOpen(node: Node): Promise<void>;
    playClose(node: Node): Promise<void>;
    cancel?(node: Node): void;
}

/** 无动画策略，适用于不需要过渡的界面。 */
export class NoopUITransition implements UITransition {
    public async playOpen(_node: Node): Promise<void> {}
    public async playClose(_node: Node): Promise<void> {}
}

/** 使用 Prefab 根节点上的 Creator Animation 组件播放开关动画。 */
export class AnimationUITransition implements UITransition {
    private readonly activeAnimations = new WeakMap<Node, {
        readonly state: AnimationState;
        readonly finish: () => void;
    }>();

    public constructor(
        private readonly openClipName: string,
        private readonly closeClipName: string,
    ) {}

    public playOpen(node: Node): Promise<void> {
        return this.play(node, this.openClipName);
    }

    public playClose(node: Node): Promise<void> {
        return this.play(node, this.closeClipName);
    }

    public cancel(node: Node): void {
        const active = this.activeAnimations.get(node);
        if (!active) {
            return;
        }
        active.finish();
        active.state.stop();
    }

    private play(node: Node, clipName: string): Promise<void> {
        if (!clipName) {
            return Promise.resolve();
        }

        const animation = node.getComponent(Animation);
        if (!animation) {
            return Promise.reject(new Error(`UI 节点缺少 Animation 组件：${node.name}`));
        }
        const expectedState = animation.getState(clipName);
        if (!expectedState) {
            return Promise.reject(new Error(`UI 动画不存在：${node.name}/${clipName}`));
        }

        this.cancel(node);
        return new Promise<void>((resolve, reject) => {
            let completed = false;
            const cleanup = (): void => {
                animation.off(Animation.EventType.FINISHED, onEnded);
                animation.off(Animation.EventType.STOP, onEnded);
            };
            const finish = (): void => {
                if (completed) {
                    return;
                }
                completed = true;
                cleanup();
                this.activeAnimations.delete(node);
                resolve();
            };
            const onEnded = (finishedState: AnimationState): void => {
                if (finishedState !== expectedState) {
                    return;
                }
                finish();
            };

            animation.on(Animation.EventType.FINISHED, onEnded);
            animation.on(Animation.EventType.STOP, onEnded);
            this.activeAnimations.set(node, { state: expectedState, finish });
            try {
                animation.play(clipName);
            } catch (error) {
                cleanup();
                this.activeAnimations.delete(node);
                reject(error);
            }
        });
    }
}

export interface TweenUITransitionOptions {
    /** 单位为秒。 */
    readonly openDuration?: number;
    readonly closeDuration?: number;
    /** 相对于 Prefab 原始缩放的倍率。 */
    readonly openStartScale?: number;
    readonly closeEndScale?: number;
    /** 透明度范围为 0～255。 */
    readonly openStartOpacity?: number;
    readonly closeEndOpacity?: number;
    readonly openEasing?: TweenEasing;
    readonly closeEasing?: TweenEasing;
}

interface TweenVisualState {
    readonly scale: Vec3;
    readonly opacity: number;
}

interface ActiveTweenTransition {
    readonly tween: Tween<{ progress: number }>;
    readonly finish: (snapToEnd: boolean) => void;
}

const DEFAULT_TWEEN_OPTIONS: Required<TweenUITransitionOptions> = {
    openDuration: 0.2,
    closeDuration: 0.15,
    openStartScale: 0.9,
    closeEndScale: 0.9,
    openStartOpacity: 0,
    closeEndOpacity: 0,
    openEasing: 'backOut',
    closeEasing: 'cubicIn',
};

/** 使用 tween 同时改变节点缩放和透明度。 */
export class TweenUITransition implements UITransition {
    private readonly naturalStates = new WeakMap<Node, TweenVisualState>();
    private readonly activeTransitions = new WeakMap<Node, ActiveTweenTransition>();
    private readonly options: Required<TweenUITransitionOptions>;

    public constructor(options: TweenUITransitionOptions = {}) {
        this.options = {
            ...DEFAULT_TWEEN_OPTIONS,
            ...options,
        };
    }

    public playOpen(node: Node): Promise<void> {
        const opacity = this.getOpacity(node);
        const natural = this.getNaturalState(node, opacity);
        const startScale = this.scaleBy(natural.scale, this.options.openStartScale);
        const startOpacity = this.clampOpacity(this.options.openStartOpacity);
        node.setScale(startScale);
        opacity.opacity = startOpacity;
        return this.play(
            node,
            opacity,
            natural.scale,
            natural.opacity,
            this.options.openDuration,
            this.options.openEasing,
        );
    }

    public playClose(node: Node): Promise<void> {
        const opacity = this.getOpacity(node);
        const natural = this.getNaturalState(node, opacity);
        return this.play(
            node,
            opacity,
            this.scaleBy(natural.scale, this.options.closeEndScale),
            this.clampOpacity(this.options.closeEndOpacity),
            this.options.closeDuration,
            this.options.closeEasing,
        );
    }

    public cancel(node: Node): void {
        const active = this.activeTransitions.get(node);
        if (!active) {
            return;
        }
        active.tween.stop();
        active.finish(false);
    }

    private play(
        node: Node,
        opacity: UIOpacity,
        endScale: Vec3,
        endOpacity: number,
        duration: number,
        easing: TweenEasing,
    ): Promise<void> {
        this.cancel(node);
        const startScale = node.scale.clone();
        const startOpacity = opacity.opacity;
        const normalizedDuration = this.normalizeDuration(duration);
        if (normalizedDuration === 0) {
            this.applyVisual(node, opacity, startScale, endScale, startOpacity, endOpacity, 1);
            return Promise.resolve();
        }

        return new Promise<void>((resolve) => {
            let completed = false;
            const progress = { progress: 0 };
            let transition: ActiveTweenTransition;
            const finish = (snapToEnd: boolean): void => {
                if (completed) {
                    return;
                }
                completed = true;
                if (snapToEnd) {
                    this.applyVisual(node, opacity, startScale, endScale, startOpacity, endOpacity, 1);
                }
                if (this.activeTransitions.get(node) === transition) {
                    this.activeTransitions.delete(node);
                }
                resolve();
            };
            const runner = tween(progress)
                .to(normalizedDuration, { progress: 1 }, {
                    easing,
                    onUpdate: (value) => {
                        this.applyVisual(
                            node,
                            opacity,
                            startScale,
                            endScale,
                            startOpacity,
                            endOpacity,
                            value?.progress ?? 0,
                        );
                    },
                })
                .call(() => finish(true));
            transition = { tween: runner, finish };
            this.activeTransitions.set(node, transition);
            runner.start();
        });
    }

    private getOpacity(node: Node): UIOpacity {
        return node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
    }

    private getNaturalState(node: Node, opacity: UIOpacity): TweenVisualState {
        const existing = this.naturalStates.get(node);
        if (existing) {
            return existing;
        }
        const created = {
            scale: node.scale.clone(),
            opacity: opacity.opacity,
        };
        this.naturalStates.set(node, created);
        return created;
    }

    private applyVisual(
        node: Node,
        opacity: UIOpacity,
        startScale: Vec3,
        endScale: Vec3,
        startOpacity: number,
        endOpacity: number,
        ratio: number,
    ): void {
        node.setScale(
            startScale.x + (endScale.x - startScale.x) * ratio,
            startScale.y + (endScale.y - startScale.y) * ratio,
            startScale.z + (endScale.z - startScale.z) * ratio,
        );
        opacity.opacity = startOpacity + (endOpacity - startOpacity) * ratio;
    }

    private scaleBy(scale: Vec3, factor: number): Vec3 {
        const normalized = Number.isFinite(factor) ? Math.max(0, factor) : 1;
        return new Vec3(scale.x * normalized, scale.y * normalized, scale.z * normalized);
    }

    private clampOpacity(opacity: number): number {
        if (!Number.isFinite(opacity)) {
            return 255;
        }
        return Math.min(255, Math.max(0, opacity));
    }

    private normalizeDuration(duration: number): number {
        return Number.isFinite(duration) ? Math.max(0, duration) : 0;
    }
}

/** 可跨多个界面复用的通用动画预设。 */
export const UI_TRANSITION_PRESETS = Object.freeze({
    page: new TweenUITransition({
        openStartScale: 1,
        closeEndScale: 1,
        openEasing: 'quadOut',
        closeEasing: 'quadIn',
    }),
    popup: new TweenUITransition({
        openStartScale: 0.85,
        closeEndScale: 0.9,
        openEasing: 'backOut',
        closeEasing: 'cubicIn',
    }),
});
