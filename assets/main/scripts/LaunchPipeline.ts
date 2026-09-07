/** 单个启动任务的最小描述。 */
export interface LaunchTask {
    readonly name: string;
    readonly run: () => void | Promise<void>;
    readonly retryCount?: number;
    readonly timeoutMs?: number;
}

/** 启动进度，completed 从 1 开始。 */
export interface LaunchProgress {
    readonly taskName: string;
    readonly completed: number;
    readonly total: number;
}

export type LaunchProgressListener = (progress: LaunchProgress) => void;

/**
 * 简单的串行启动流水线，提供超时、重试和进度通知。
 */
export class LaunchPipeline {
    public constructor(private readonly tasks: readonly LaunchTask[]) {}

    /** 按声明顺序执行任务，任何任务最终失败都会中止启动。 */
    public async run(onProgress?: LaunchProgressListener): Promise<void> {
        for (let index = 0; index < this.tasks.length; index += 1) {
            const task = this.tasks[index];
            await this.runTask(task);
            onProgress?.({
                taskName: task.name,
                completed: index + 1,
                total: this.tasks.length,
            });
        }
    }

    private async runTask(task: LaunchTask): Promise<void> {
        const attempts = (task.retryCount ?? 0) + 1;
        let lastError: unknown;

        for (let attempt = 0; attempt < attempts; attempt += 1) {
            try {
                await this.runWithTimeout(task);
                return;
            } catch (error) {
                lastError = error;
            }
        }

        throw lastError;
    }

    private async runWithTimeout(task: LaunchTask): Promise<void> {
        if (!task.timeoutMs || task.timeoutMs <= 0) {
            await task.run();
            return;
        }

        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(
                () => reject(new Error(`启动任务超时：${task.name}`)),
                task.timeoutMs,
            );
        });

        try {
            await Promise.race([Promise.resolve(task.run()), timeout]);
        } finally {
            if (timer !== undefined) {
                clearTimeout(timer);
            }
        }
    }
}
