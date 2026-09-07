/** main 启动层唯一可见的 kit-core 门面。 */
export interface KitCoreFacade {
    readonly scenes: {
        enterBundleScene(bundleName: string, scenePath: string): Promise<void>;
        enterMainScene(sceneName: string): Promise<void>;
    };
    boot(): Promise<void>;
    shutdown(): Promise<void>;
}

declare global {
    /** kit-core 的脚本随 Bundle 加载后会把门面注册到这里。 */
    var cocosKitCore: KitCoreFacade | undefined;
}
