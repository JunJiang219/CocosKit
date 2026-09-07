import { ILogger } from '../contracts/CoreContracts';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LOG_LEVEL_WEIGHT: Readonly<Record<LogLevel, number>> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
    silent: Number.POSITIVE_INFINITY,
};

/** 带标签和等级过滤的控制台日志实现。 */
export class Logger implements ILogger {
    public constructor(
        private readonly tag: string,
        private level: LogLevel = 'debug',
    ) {}

    /** 运行时调整日志等级。 */
    public setLevel(level: LogLevel): void {
        this.level = level;
    }

    public debug(message: string, ...args: unknown[]): void {
        this.write('debug', message, args);
    }

    public info(message: string, ...args: unknown[]): void {
        this.write('info', message, args);
    }

    public warn(message: string, ...args: unknown[]): void {
        this.write('warn', message, args);
    }

    public error(message: string, ...args: unknown[]): void {
        this.write('error', message, args);
    }

    private write(level: Exclude<LogLevel, 'silent'>, message: string, args: unknown[]): void {
        if (LOG_LEVEL_WEIGHT[level] < LOG_LEVEL_WEIGHT[this.level]) {
            return;
        }

        const formatted = `[${this.tag}] ${message}`;
        if (level === 'debug') {
            console.debug(formatted, ...args);
        } else if (level === 'info') {
            console.info(formatted, ...args);
        } else if (level === 'warn') {
            console.warn(formatted, ...args);
        } else {
            console.error(formatted, ...args);
        }
    }
}
