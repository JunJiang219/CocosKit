import type { KitCoreFacade } from '../../bundles/kit-core/scripts/KitCoreFacade';

/**
 * 获取 kit-core 在加载时注册的门面。
 * main 只依赖这一个小接口，不直接引用内核内部模块。
 */
export function requireKitCore(): KitCoreFacade {
    const facade = globalThis.cocosKitCore;
    if (!facade) {
        throw new Error('kit-core 已加载，但没有注册运行时入口');
    }
    return facade;
}
