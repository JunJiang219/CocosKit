import { AssetManager, SceneAsset, assetManager, director } from 'cc';
import { ILogger } from '../contracts/CoreContracts';

/** 统一处理主包场景和 Bundle 场景切换。 */
export class SceneService {
    public constructor(private readonly logger: ILogger) {}

    /** 加载 Bundle 内场景并运行。场景路径不带扩展名。 */
    public async enterBundleScene(bundleName: string, scenePath: string): Promise<void> {
        const bundle = assetManager.getBundle(bundleName);
        if (!bundle) {
            throw new Error(`场景所在 Bundle 尚未加载：${bundleName}`);
        }

        this.logger.info(`进入 Bundle 场景：${bundleName}/${scenePath}`);
        const scene = await this.loadBundleScene(bundle, scenePath);
        await this.runScene(scene);
    }

    /** 使用主包场景名返回启动流程。 */
    public enterMainScene(sceneName: string): Promise<void> {
        this.logger.info(`进入主包场景：${sceneName}`);
        return new Promise((resolve, reject) => {
            const accepted = director.loadScene(sceneName, (error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            });

            if (!accepted) {
                reject(new Error(`场景切换请求被拒绝：${sceneName}`));
            }
        });
    }

    private loadBundleScene(
        bundle: AssetManager.Bundle,
        scenePath: string,
    ): Promise<SceneAsset> {
        return new Promise((resolve, reject) => {
            bundle.loadScene(scenePath, (error, scene) => {
                if (error) {
                    reject(new Error(`场景加载失败：${scenePath}，${error.message}`));
                    return;
                }
                resolve(scene);
            });
        });
    }

    private runScene(scene: SceneAsset): Promise<void> {
        return new Promise((resolve, reject) => {
            director.runScene(scene, undefined, (error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            });
        });
    }
}
