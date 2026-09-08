/** 由释放策略创建的待执行任务。 */
export interface AssetReleaseTask {
    /** 提前执行尚未发生的释放。 */
    flush(): void;
}

/**
 * 资源释放策略。
 * 新策略只需决定何时调用 release，无需了解资源和作用域的内部结构。
 */
export interface AssetReleaseStrategy {
    schedule(release: () => void): AssetReleaseTask | null;
}

/** 默认策略：当前调用栈内立即释放。 */
export class ImmediateAssetReleaseStrategy implements AssetReleaseStrategy {
    public schedule(release: () => void): null {
        release();
        return null;
    }
}

/** 延时策略：在指定毫秒数后释放。 */
export class DelayedAssetReleaseStrategy implements AssetReleaseStrategy {
    public constructor(private readonly delayMs: number) {}

    public schedule(release: () => void): AssetReleaseTask | null {
        if (!Number.isFinite(this.delayMs) || this.delayMs <= 0) {
            release();
            return null;
        }
        return new DelayedAssetReleaseTask(this.delayMs, release);
    }
}

/** 全局复用默认策略，避免每次释放都创建对象。 */
export const IMMEDIATE_ASSET_RELEASE = new ImmediateAssetReleaseStrategy();

class DelayedAssetReleaseTask implements AssetReleaseTask {
    private timer: ReturnType<typeof setTimeout> | null;
    private completed = false;

    public constructor(delayMs: number, private readonly release: () => void) {
        this.timer = setTimeout(() => this.run(), delayMs);
    }

    public flush(): void {
        this.run();
    }

    private run(): void {
        if (this.completed) {
            return;
        }
        this.completed = true;
        this.clearTimer();
        this.release();
    }

    private clearTimer(): void {
        if (this.timer === null) {
            return;
        }
        clearTimeout(this.timer);
        this.timer = null;
    }
}
