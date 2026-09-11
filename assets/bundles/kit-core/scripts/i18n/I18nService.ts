import type { Unsubscribe } from '../contracts/CoreContracts';

export const DEFAULT_LOCALE = 'en';

export type TranslationParameter = string | number;
export type TranslationParameters = Readonly<Record<string, TranslationParameter>>;
export type LocaleMessages = Readonly<Record<string, unknown>>;

export interface LoadedLocaleMessages {
    readonly messages: LocaleMessages;
    release(): void;
}

export type LocaleMessagesLoader = (
    locale: string,
    bundleName: string,
    path: string,
) => Promise<LoadedLocaleMessages>;

export interface I18nServiceOptions {
    readonly initialLocale?: string;
    readonly fallbackLocale?: string;
    readonly loader?: LocaleMessagesLoader;
    readonly onMissingKey?: (locale: string, key: string) => void;
}

export interface LocaleChange {
    readonly previous: string;
    readonly current: string;
}

interface LocaleCatalog {
    readonly messages: ReadonlyMap<string, string>;
    readonly release?: () => void;
}

type LocaleListener = (change: LocaleChange) => void;

/** 文本本地化服务：语言包、回退、参数插值及基础复数形式。 */
export class I18nService {
    private currentLocale: string;
    private currentFallbackLocale: string | undefined;
    private readonly catalogs = new Map<string, LocaleCatalog>();
    private readonly loadingLocales = new Set<string>();
    private readonly localeListeners = new Set<LocaleListener>();
    private readonly reportedMissingKeys = new Set<string>();

    public constructor(private readonly options: I18nServiceOptions = {}) {
        this.currentLocale = normalizeLocale(options.initialLocale ?? DEFAULT_LOCALE);
        this.currentFallbackLocale = this.normalizeOptionalLocale(options.fallbackLocale);
    }

    public get locale(): string {
        return this.currentLocale;
    }

    public get fallbackLocale(): string | undefined {
        return this.currentFallbackLocale;
    }

    public get availableLocales(): readonly string[] {
        return [...this.catalogs.keys()];
    }

    /** 从 Asset Bundle 加载一个 JSON 语言包。 */
    public async loadLocale(locale: string, bundleName: string, path: string): Promise<void> {
        const normalized = normalizeLocale(locale);
        this.ensureLocaleMissing(normalized);
        if (!this.options.loader) {
            throw new Error('当前 i18n 服务未配置语言包加载器');
        }

        this.loadingLocales.add(normalized);
        let loaded: LoadedLocaleMessages | null = null;
        try {
            loaded = await this.options.loader(normalized, bundleName, path);
            const messages = flattenMessages(loaded.messages);
            const loadedMessages = loaded;
            this.catalogs.set(normalized, {
                messages,
                release: () => loadedMessages.release(),
            });
        } catch (error) {
            loaded?.release();
            throw error;
        } finally {
            this.loadingLocales.delete(normalized);
        }
    }

    /** 注册内存语言包，适用于测试或服务器下发文本。 */
    public registerLocale(locale: string, messages: LocaleMessages): void {
        const normalized = normalizeLocale(locale);
        this.ensureLocaleMissing(normalized);
        this.catalogs.set(normalized, { messages: flattenMessages(messages) });
    }

    /** 切换当前语言；允许先切换、后按需加载对应语言包。 */
    public setLocale(locale: string): void {
        const normalized = normalizeLocale(locale);
        if (normalized === this.currentLocale) {
            return;
        }
        const change: LocaleChange = {
            previous: this.currentLocale,
            current: normalized,
        };
        this.currentLocale = normalized;
        this.emitLocaleChange(change);
    }

    public setFallbackLocale(locale?: string): void {
        this.currentFallbackLocale = this.normalizeOptionalLocale(locale);
    }

    public onLocaleChange(listener: LocaleListener): Unsubscribe {
        this.localeListeners.add(listener);
        return () => this.localeListeners.delete(listener);
    }

    public has(key: string, locale = this.currentLocale): boolean {
        return this.findMessage(key, locale) !== undefined;
    }

    /** 找不到文案时返回 key，页面仍可继续显示和运行。 */
    public t(key: string, parameters: TranslationParameters = {}): string {
        const message = this.findMessage(key, this.currentLocale);
        if (message === undefined) {
            this.reportMissingKey(key);
            return key;
        }
        return interpolate(message, parameters);
    }

    /** 按 Intl 复数类别读取 `key.one`、`key.other` 等条目。 */
    public plural(key: string, count: number, parameters: TranslationParameters = {}): string {
        const category = selectPluralCategory(this.currentLocale, count);
        const categoryKey = `${key}.${category}`;
        const fallbackKey = `${key}.other`;
        const message = this.findMessage(categoryKey, this.currentLocale)
            ?? this.findMessage(fallbackKey, this.currentLocale)
            ?? this.findMessage(key, this.currentLocale);

        if (message === undefined) {
            this.reportMissingKey(key);
            return key;
        }
        return interpolate(message, { ...parameters, count });
    }

    public unloadLocale(locale: string): void {
        const normalized = normalizeLocale(locale);
        const catalog = this.catalogs.get(normalized);
        if (!catalog) {
            return;
        }
        catalog.release?.();
        this.catalogs.delete(normalized);
    }

    public clear(): void {
        [...this.catalogs.keys()].forEach((locale) => this.unloadLocale(locale));
        this.localeListeners.clear();
        this.reportedMissingKeys.clear();
        this.loadingLocales.clear();
    }

    private ensureLocaleMissing(locale: string): void {
        if (this.catalogs.has(locale)) {
            throw new Error(`语言包已经存在：${locale}`);
        }
        if (this.loadingLocales.has(locale)) {
            throw new Error(`语言包正在加载：${locale}`);
        }
    }

    private findMessage(key: string, locale: string): string | undefined {
        for (const candidate of this.getLocaleChain(locale)) {
            const message = this.catalogs.get(candidate)?.messages.get(key);
            if (message !== undefined) {
                return message;
            }
        }
        return undefined;
    }

    private getLocaleChain(locale: string): readonly string[] {
        const result: string[] = [];
        this.appendLocaleAndBase(result, normalizeLocale(locale));
        if (this.currentFallbackLocale) {
            this.appendLocaleAndBase(result, this.currentFallbackLocale);
        }
        return result;
    }

    private appendLocaleAndBase(result: string[], locale: string): void {
        if (result.indexOf(locale) < 0) {
            result.push(locale);
        }
        const baseLocale = locale.split('-')[0];
        if (result.indexOf(baseLocale) < 0) {
            result.push(baseLocale);
        }
    }

    private reportMissingKey(key: string): void {
        const identity = `${this.currentLocale}:${key}`;
        if (this.reportedMissingKeys.has(identity)) {
            return;
        }
        this.reportedMissingKeys.add(identity);
        this.options.onMissingKey?.(this.currentLocale, key);
    }

    private emitLocaleChange(change: LocaleChange): void {
        [...this.localeListeners].forEach((listener) => listener(change));
    }

    private normalizeOptionalLocale(locale?: string): string | undefined {
        return locale === undefined ? undefined : normalizeLocale(locale);
    }
}

/** 统一 `_`、语言大小写、脚本和地区大小写，保证语言键稳定。 */
export function normalizeLocale(locale: string): string {
    const parts = locale.trim().replace(/_/g, '-').split('-').filter(Boolean);
    if (parts.length === 0) {
        throw new Error('语言代码不能为空');
    }
    return parts.map((part, index) => {
        if (index === 0) {
            return part.toLowerCase();
        }
        if (part.length === 4) {
            return `${part[0].toUpperCase()}${part.slice(1).toLowerCase()}`;
        }
        return part.toUpperCase();
    }).join('-');
}

function flattenMessages(source: LocaleMessages): ReadonlyMap<string, string> {
    const result = new Map<string, string>();

    const visit = (value: unknown, path: string): void => {
        if (typeof value === 'string') {
            result.set(path, value);
            return;
        }
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new Error(`本地化文案必须是字符串：${path || '<root>'}`);
        }
        Object.keys(value).forEach((key) => {
            const child = (value as Record<string, unknown>)[key];
            visit(child, path ? `${path}.${key}` : key);
        });
    };

    visit(source, '');
    return result;
}

function interpolate(template: string, parameters: TranslationParameters): string {
    return template.replace(/\{([\w.-]+)\}/g, (source, key: string) => {
        const value = parameters[key];
        return value === undefined ? source : String(value);
    });
}

function selectPluralCategory(locale: string, count: number): string {
    const intl = globalThis.Intl as typeof Intl & {
        PluralRules?: new (locale: string) => { select(value: number): string };
    };
    return intl.PluralRules
        ? new intl.PluralRules(locale).select(count)
        : count === 1 ? 'one' : 'other';
}
