import { KitCoreRuntime } from './KitCoreRuntime';

/**
 * Bundle 脚本载入时注册唯一门面。
 * Cocos 加载 kit-core 后，main 再通过该门面启动模块。
 */
if (!globalThis.cocosKitCore) {
    globalThis.cocosKitCore = new KitCoreRuntime();
}
