/**
 * 阶段一启动参数集中放在这里，避免流程代码里散落 Bundle 名称和场景路径。
 */
export interface LaunchConfig {
    readonly coreBundle: string;
    readonly gameBundle: string;
    readonly launchScene: string;
    readonly demoScenePath: string;
    readonly autoReturnDelayMs: number;
}

/** Bundle 名称只在这里声明，清单和启动流程共同复用。 */
export const BUNDLE_NAMES = Object.freeze({
    core: 'kit-core',
    game: 'game-core',
});

/** 启动任务超时集中配置，后续可以按平台环境覆盖。 */
export const LAUNCH_TIMEOUTS = Object.freeze({
    loadCoreMs: 10000,
    bootCoreMs: 10000,
    launchGameMs: 15000,
});

/** 默认使用本地 Bundle，后续可按环境替换为远程地址和版本。 */
export const LAUNCH_CONFIG: LaunchConfig = Object.freeze({
    coreBundle: BUNDLE_NAMES.core,
    gameBundle: BUNDLE_NAMES.game,
    launchScene: 'launch',
    demoScenePath: 'content/demo/scenes/demo',
    autoReturnDelayMs: 2000,
});
