import { JsonAsset, sys } from 'cc';
import type { AssetService } from '../assets/AssetService';
import type { FrameworkModule, ModuleContext } from '../contracts/CoreContracts';
import { KIT_SERVICE_KEYS } from '../service/KitServiceKeys';
import { DEFAULT_LOCALE, I18nService } from './I18nService';
import type { LocaleMessages, LocaleMessagesLoader } from './I18nService';

/** 注册本地化服务，默认采用 Creator 识别的系统语言。 */
export class I18nModule implements FrameworkModule {
    public readonly name = 'i18n';
    public readonly dependencies = ['assets'];
    private service: I18nService | null = null;

    public register(context: ModuleContext): void {
        const assets = context.services.resolve<AssetService>(KIT_SERVICE_KEYS.assets);
        this.service = new I18nService({
            initialLocale: sys.languageCode || DEFAULT_LOCALE,
            loader: this.createLocaleLoader(assets),
            onMissingKey: (locale, key) => context.logger.warn(`缺少本地化文案：${locale}/${key}`),
        });
        context.services.register(KIT_SERVICE_KEYS.i18n, this.service);
    }

    public dispose(context: ModuleContext): void {
        this.service?.clear();
        context.services.unregister(KIT_SERVICE_KEYS.i18n);
        this.service = null;
    }

    /** 使用资源服务加载 JSON 语言包，并把释放责任交给 i18n 服务。 */
    private createLocaleLoader(assets: AssetService): LocaleMessagesLoader {
        return async (_locale, bundleName, path) => {
            const handle = await assets.load(bundleName, path, JsonAsset, {
                scope: 'kit.i18n',
            });
            const source = handle.asset.json;
            if (!source || typeof source !== 'object' || Array.isArray(source)) {
                assets.release(handle);
                throw new Error(`语言包根节点必须是对象：${bundleName}/${path}`);
            }
            return {
                messages: source as LocaleMessages,
                release: () => assets.release(handle),
            };
        };
    }
}
