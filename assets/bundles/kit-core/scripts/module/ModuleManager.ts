import {
    FrameworkModule,
    ModuleContext,
    ModuleState,
} from '../contracts/CoreContracts';

interface ModuleRecord {
    readonly module: FrameworkModule;
    state: ModuleState;
}

/** 负责模块依赖排序和成对生命周期调用。 */
export class ModuleManager {
    private readonly records = new Map<string, ModuleRecord>();
    private orderedRecords: readonly ModuleRecord[] = [];

    public constructor(private readonly context: ModuleContext) {}

    /** 添加待启动模块。启动后不允许再动态修改集合。 */
    public add(module: FrameworkModule): void {
        if (this.orderedRecords.length > 0) {
            throw new Error('模块启动后不能继续添加模块');
        }
        if (this.records.has(module.name)) {
            throw new Error(`模块重复添加：${module.name}`);
        }
        this.records.set(module.name, { module, state: 'discovered' });
    }

    /** 按依赖顺序完成注册、初始化和启动。 */
    public async boot(): Promise<void> {
        this.orderedRecords = this.resolveOrder();

        try {
            await this.runForward('registered', (module) => module.register(this.context));
            await this.runForward('initialized', (module) => module.initialize?.(this.context));
            await this.runForward('running', (module) => module.start?.(this.context));
        } catch (error) {
            await this.shutdown();
            throw error;
        }
    }

    /** 先停止运行模块，再按依赖反序销毁所有已注册模块。 */
    public async shutdown(): Promise<void> {
        const reversed = [...this.orderedRecords].reverse();

        for (const record of reversed) {
            if (record.state === 'running') {
                await record.module.stop?.(this.context);
                record.state = 'initialized';
            }
        }

        for (const record of reversed) {
            if (record.state === 'initialized' || record.state === 'registered') {
                await record.module.dispose?.(this.context);
                record.state = 'disposed';
            }
        }
    }

    /** 供诊断和测试查询模块当前状态。 */
    public getState(name: string): ModuleState {
        const record = this.records.get(name);
        if (!record) {
            throw new Error(`模块不存在：${name}`);
        }
        return record.state;
    }

    private async runForward(
        targetState: ModuleState,
        action: (module: FrameworkModule) => void | Promise<void> | undefined,
    ): Promise<void> {
        for (const record of this.orderedRecords) {
            await action(record.module);
            record.state = targetState;
        }
    }

    private resolveOrder(): readonly ModuleRecord[] {
        const result: ModuleRecord[] = [];
        const visited = new Set<string>();
        const visiting = new Set<string>();

        const visit = (name: string): void => {
            if (visited.has(name)) {
                return;
            }
            if (visiting.has(name)) {
                throw new Error(`模块存在循环依赖：${name}`);
            }

            const record = this.records.get(name);
            if (!record) {
                throw new Error(`模块依赖不存在：${name}`);
            }

            visiting.add(name);
            record.module.dependencies?.forEach(visit);
            visiting.delete(name);
            visited.add(name);
            result.push(record);
        };

        this.records.forEach((_, name) => visit(name));
        return result;
    }
}
