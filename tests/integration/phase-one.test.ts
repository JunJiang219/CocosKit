import { BundleCatalog } from '../../assets/main/scripts/BundleCatalog';
import { LaunchPipeline } from '../../assets/main/scripts/LaunchPipeline';
import { createAssetLoadProgress } from '../../assets/bundles/kit-core/scripts/assets/AssetLoadOptions';
import { DelayedAssetReleaseStrategy } from '../../assets/bundles/kit-core/scripts/assets/AssetReleaseStrategy';
import {
    FrameworkModule,
    ModuleContext,
} from '../../assets/bundles/kit-core/scripts/contracts/CoreContracts';
import { EventBus } from '../../assets/bundles/kit-core/scripts/event/EventBus';
import { ModuleManager } from '../../assets/bundles/kit-core/scripts/module/ModuleManager';
import { ServiceContainer } from '../../assets/bundles/kit-core/scripts/service/ServiceContainer';

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(`断言失败：${message}`);
    }
}

function createContext(): ModuleContext {
    return {
        services: new ServiceContainer(),
        events: new EventBus(),
        logger: {
            debug: () => undefined,
            info: () => undefined,
            warn: () => undefined,
            error: () => undefined,
        },
    };
}

async function testBundleOrder(): Promise<void> {
    const catalog = new BundleCatalog([
        { name: 'core', dependencies: [], strategy: 'startup', resident: true },
        { name: 'game', dependencies: ['core'], strategy: 'before-scene', resident: false },
    ]);
    const order = catalog.getLoadOrder('game').map((item) => item.name).join(',');
    assert(order === 'core,game', 'Bundle 应按依赖优先排序');
}

async function testServiceAndEvent(): Promise<void> {
    const services = new ServiceContainer();
    services.register('answer', 42);
    assert(services.resolve<number>('answer') === 42, '服务应可以按键查询');

    const events = new EventBus();
    let received = 0;
    const unsubscribe = events.on<number>('changed', (value) => {
        received = value;
    });
    events.emit('changed', 7);
    unsubscribe();
    events.emit('changed', 9);
    assert(received === 7, '取消订阅后不应继续收到事件');
}

async function testModuleLifecycle(): Promise<void> {
    const calls: string[] = [];
    const createModule = (name: string, dependencies: readonly string[] = []): FrameworkModule => ({
        name,
        dependencies,
        register: () => { calls.push(`${name}:register`); },
        initialize: () => { calls.push(`${name}:initialize`); },
        start: () => { calls.push(`${name}:start`); },
        stop: () => { calls.push(`${name}:stop`); },
        dispose: () => { calls.push(`${name}:dispose`); },
    });

    const manager = new ModuleManager(createContext());
    manager.add(createModule('scene', ['assets']));
    manager.add(createModule('assets'));
    await manager.boot();
    await manager.shutdown();

    const expected = [
        'assets:register', 'scene:register',
        'assets:initialize', 'scene:initialize',
        'assets:start', 'scene:start',
        'scene:stop', 'assets:stop',
        'scene:dispose', 'assets:dispose',
    ].join(',');
    assert(calls.join(',') === expected, '模块应按依赖顺序启动并反序释放');
}

async function testLaunchPipelineRetry(): Promise<void> {
    let attempts = 0;
    const pipeline = new LaunchPipeline([
        {
            name: 'retry-once',
            retryCount: 1,
            run: () => {
                attempts += 1;
                if (attempts === 1) {
                    throw new Error('模拟首次失败');
                }
            },
        },
    ]);
    await pipeline.run();
    assert(attempts === 2, '启动任务失败后应按配置重试');
}

async function testFlowStateSurvivesSceneDisposal(): Promise<void> {
    const host: { launcher: { shutdown: () => void } | null } = {
        launcher: { shutdown: () => undefined },
    };
    // 启动流程先捕获普通对象，模拟 Creator 随后销毁场景组件并清空字段。
    const detachedLauncher = host.launcher;
    assert(detachedLauncher, '测试启动器应已创建');
    host.launcher = null;

    let shutdownCalled = false;
    detachedLauncher.shutdown = () => {
        shutdownCalled = true;
    };
    detachedLauncher.shutdown();
    assert(shutdownCalled, '跨场景流程不应再读取已销毁组件上的对象字段');
}

async function testAssetProgressNormalization(): Promise<void> {
    const itemProgress = createAssetLoadProgress(2, 4, 'items');
    assert(itemProgress.ratio === 0.5, '资源项进度应转换成 0～1 比例');

    const byteProgress = createAssetLoadProgress(2048, 1024, 'bytes');
    assert(byteProgress.ratio === 1, '超出总量的字节进度应限制为 1');
    assert(byteProgress.unit === 'bytes', '远程下载应保留字节单位');
}

async function testDelayedAssetRelease(): Promise<void> {
    const state = { released: false };
    const strategy = new DelayedAssetReleaseStrategy(20);
    strategy.schedule(() => {
        state.released = true;
    });

    assert(!state.released, '延迟时间到达前不应释放资源');

    await new Promise<void>((resolve) => setTimeout(resolve, 30));
    assert(state.released, '延迟时间到达后应释放资源');
}

async function testPendingReleaseCanCompleteImmediately(): Promise<void> {
    const state = { releaseCount: 0 };
    const strategy = new DelayedAssetReleaseStrategy(1000);
    const task = strategy.schedule(() => {
        state.releaseCount += 1;
    });

    assert(task, '延时策略应返回可管理的释放任务');
    task.flush();
    task.flush();
    assert(state.releaseCount === 1, '提前执行和重复执行都只能释放一次');
}

/** 不依赖测试框架的最小集成测试入口。 */
async function run(): Promise<void> {
    await testBundleOrder();
    await testServiceAndEvent();
    await testModuleLifecycle();
    await testLaunchPipelineRetry();
    await testFlowStateSurvivesSceneDisposal();
    await testAssetProgressNormalization();
    await testDelayedAssetRelease();
    await testPendingReleaseCanCompleteImmediately();
    console.info('phase-one integration tests passed');
}

void run();
