import type { KitCoreFacade } from '../../bundles/kit-core/scripts/KitCoreFacade';
import { BundleCatalog } from './BundleCatalog';
import { BundleLoader } from './BundleLoader';
import { LaunchConfig } from './Environment';

/** 负责进入和退出当前具体游戏，不在启动组件中堆叠场景细节。 */
export class GameLauncher {
    public constructor(
        private readonly config: LaunchConfig,
        private readonly catalog: BundleCatalog,
        private readonly bundleLoader: BundleLoader,
    ) {}

    /** 加载统一项目包并进入示例场景。 */
    public async launch(core: KitCoreFacade): Promise<void> {
        await this.bundleLoader.loadWithDependencies(this.catalog, this.config.gameBundle);
        await core.scenes.enterBundleScene(
            this.config.gameBundle,
            this.config.demoScenePath,
        );
    }

    /** 先返回主包场景，再按依赖的反方向释放项目包和内核。 */
    public async shutdown(core: KitCoreFacade): Promise<void> {
        await core.scenes.enterMainScene(this.config.launchScene);
        this.bundleLoader.unload(this.config.gameBundle);
        await core.shutdown();
        this.bundleLoader.unload(this.config.coreBundle);
    }
}
