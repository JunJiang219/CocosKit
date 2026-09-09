import type { KitCoreFacade } from '../../kit-core/scripts/KitCoreFacade';
import { SampleGameFlow } from './sample/SampleGameFlow';

/** 阶段一项目包入口，后续项目模块从这里统一组装。 */
export const GAME_CORE_VERSION = '0.2.0';

/** 创建阶段二样板业务流程，具体项目可替换为自己的模块入口。 */
export function createSampleGameFlow(core: KitCoreFacade): SampleGameFlow {
    return new SampleGameFlow(core);
}

console.info(`[game-core] 项目 Bundle 已加载，版本 ${GAME_CORE_VERSION}`);
