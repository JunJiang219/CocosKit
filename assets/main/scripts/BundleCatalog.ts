import { BUNDLE_NAMES } from './Environment';

/** Bundle 在当前项目中的加载方式。 */
export type BundleLoadStrategy = 'startup' | 'before-scene' | 'on-demand';

/** 启动层只保存加载 Bundle 所需的最小信息。 */
export interface BundleDefinition {
    readonly name: string;
    readonly dependencies: readonly string[];
    readonly strategy: BundleLoadStrategy;
    readonly resident: boolean;
}

/**
 * Bundle 清单负责查询与依赖排序，不负责真正加载资源。
 */
export class BundleCatalog {
    private readonly definitions = new Map<string, BundleDefinition>();

    public constructor(definitions: readonly BundleDefinition[]) {
        for (const definition of definitions) {
            if (this.definitions.has(definition.name)) {
                throw new Error(`Bundle 重复定义：${definition.name}`);
            }
            this.definitions.set(definition.name, definition);
        }
    }

    /** 获取指定 Bundle，不允许静默忽略配置错误。 */
    public get(name: string): BundleDefinition {
        const definition = this.definitions.get(name);
        if (!definition) {
            throw new Error(`Bundle 未在清单中声明：${name}`);
        }
        return definition;
    }

    /** 返回依赖优先的加载顺序，并同时检查缺失依赖与循环依赖。 */
    public getLoadOrder(name: string): readonly BundleDefinition[] {
        const ordered: BundleDefinition[] = [];
        const visited = new Set<string>();
        const visiting = new Set<string>();

        const visit = (currentName: string): void => {
            if (visited.has(currentName)) {
                return;
            }
            if (visiting.has(currentName)) {
                throw new Error(`Bundle 存在循环依赖：${currentName}`);
            }

            visiting.add(currentName);
            const definition = this.get(currentName);
            definition.dependencies.forEach(visit);
            visiting.delete(currentName);
            visited.add(currentName);
            ordered.push(definition);
        };

        visit(name);
        return ordered;
    }
}

/** 阶段一只启用通用内核和统一项目包。 */
export const DEFAULT_BUNDLE_CATALOG = new BundleCatalog([
    {
        name: BUNDLE_NAMES.core,
        dependencies: [],
        strategy: 'startup',
        resident: true,
    },
    {
        name: BUNDLE_NAMES.game,
        dependencies: [BUNDLE_NAMES.core],
        strategy: 'before-scene',
        resident: false,
    },
]);
