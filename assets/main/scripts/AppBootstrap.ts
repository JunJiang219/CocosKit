import { _decorator, Component, isValid } from 'cc';
import type { KitCoreFacade } from '../../bundles/kit-core/scripts/KitCoreFacade';
import { DEFAULT_BUNDLE_CATALOG } from './BundleCatalog';
import { BundleLoader } from './BundleLoader';
import { LAUNCH_CONFIG, LAUNCH_TIMEOUTS } from './Environment';
import { GameLauncher } from './GameLauncher';
import { requireKitCore } from './KitCoreBridge';
import { LaunchPipeline } from './LaunchPipeline';
import { LaunchView } from './LaunchView';

const { ccclass } = _decorator;

/** 项目唯一启动入口，阶段一会自动执行一次完整加载与释放闭环。 */
@ccclass('AppBootstrap')
export class AppBootstrap extends Component {
    private static demoCompleted = false;

    protected onLoad(): void {
        if (AppBootstrap.demoCompleted) {
            this.getView().showStatus('阶段一闭环验证完成');
            return;
        }
        void this.runLaunchFlow();
    }

    private async runLaunchFlow(): Promise<void> {
        const view = this.getView();
        // 进入新场景后 Component 会被销毁，因此跨场景对象必须由局部变量持有。
        const bundleLoader = new BundleLoader();
        const gameLauncher = new GameLauncher(
            LAUNCH_CONFIG,
            DEFAULT_BUNDLE_CATALOG,
            bundleLoader,
        );
        let core: KitCoreFacade | undefined;

        const showStatus = (message: string): void => {
            if (isValid(view)) {
                view.showStatus(message);
            } else {
                console.info(`[Launch] ${message}`);
            }
        };

        const showError = (error: unknown): void => {
            if (isValid(view)) {
                view.showError(error);
            } else {
                console.error('[Launch] 启动失败', error);
            }
        };

        try {
            const pipeline = new LaunchPipeline([
                {
                    name: '加载 kit-core',
                    timeoutMs: LAUNCH_TIMEOUTS.loadCoreMs,
                    retryCount: 1,
                    run: () => bundleLoader.load(LAUNCH_CONFIG.coreBundle).then(() => undefined),
                },
                {
                    name: '初始化通用模块',
                    timeoutMs: LAUNCH_TIMEOUTS.bootCoreMs,
                    run: async () => {
                        core = requireKitCore();
                        await core.boot();
                    },
                },
                {
                    name: '加载项目并进入示例场景',
                    timeoutMs: LAUNCH_TIMEOUTS.launchGameMs,
                    run: async () => {
                        if (!core) {
                            throw new Error('kit-core 尚未初始化');
                        }
                        await gameLauncher.launch(core);
                    },
                },
            ]);

            await pipeline.run((progress) => {
                showStatus(`${progress.taskName}（${progress.completed}/${progress.total}）`);
            });

            if (!core) {
                throw new Error('kit-core 尚未初始化');
            }

            await delay(LAUNCH_CONFIG.autoReturnDelayMs);
            AppBootstrap.demoCompleted = true;
            await gameLauncher.shutdown(core);
        } catch (error) {
            showError(error);
        }
    }

    private getView(): LaunchView {
        return this.getComponent(LaunchView) ?? this.node.addComponent(LaunchView);
    }
}

/** 不绑定 Component 生命周期的延时，允许启动流程跨场景继续执行。 */
function delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
