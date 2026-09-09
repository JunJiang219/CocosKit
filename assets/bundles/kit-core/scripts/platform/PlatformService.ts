export type PlatformCapability = 'clipboard' | 'vibration' | 'open-url';

/** 平台差异统一收敛到适配器，业务只做能力检测。 */
export interface PlatformAdapter {
    readonly name: string;
    supports(capability: PlatformCapability): boolean;
    copyText(text: string): Promise<void>;
    vibrate(durationMs: number): Promise<void>;
    openUrl(url: string): void;
}

/** Web Mobile 默认适配器。 */
export class WebPlatformAdapter implements PlatformAdapter {
    public readonly name = 'web-mobile';

    public supports(capability: PlatformCapability): boolean {
        if (capability === 'clipboard') {
            return typeof navigator !== 'undefined' && !!navigator.clipboard;
        }
        if (capability === 'vibration') {
            return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
        }
        return typeof window !== 'undefined' && typeof window.open === 'function';
    }

    public async copyText(text: string): Promise<void> {
        if (!this.supports('clipboard')) {
            throw new Error('当前平台不支持剪贴板');
        }
        await navigator.clipboard.writeText(text);
    }

    public async vibrate(durationMs: number): Promise<void> {
        if (!this.supports('vibration')) {
            throw new Error('当前平台不支持震动');
        }
        navigator.vibrate(Math.max(0, durationMs));
    }

    public openUrl(url: string): void {
        if (!this.supports('open-url')) {
            throw new Error('当前平台不支持打开外部链接');
        }
        window.open(url, '_blank', 'noopener,noreferrer');
    }
}

/** 可在启动阶段替换适配器，以接入原生或小游戏 SDK。 */
export class PlatformService {
    public constructor(private adapter: PlatformAdapter) {}

    public get name(): string {
        return this.adapter.name;
    }

    public use(adapter: PlatformAdapter): void {
        this.adapter = adapter;
    }

    public supports(capability: PlatformCapability): boolean {
        return this.adapter.supports(capability);
    }

    public copyText(text: string): Promise<void> {
        return this.adapter.copyText(text);
    }

    public vibrate(durationMs = 30): Promise<void> {
        return this.adapter.vibrate(durationMs);
    }

    public openUrl(url: string): void {
        this.adapter.openUrl(url);
    }
}
