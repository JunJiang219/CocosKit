/** 可替换的最小键值存储接口。 */
export interface KeyValueStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

/** 带版本的数据定义；旧数据只有提供 migrate 时才会迁移。 */
export interface StorageSchema<T> {
    readonly version: number;
    readonly defaultValue: T;
    readonly migrate?: (value: unknown, storedVersion: number) => T;
}

interface StorageEnvelope {
    readonly version: number;
    readonly value: unknown;
}

/** 内存实现用于测试，以及浏览器存储不可用时的安全回退。 */
export class MemoryStorage implements KeyValueStorage {
    private readonly values = new Map<string, string>();

    public getItem(key: string): string | null {
        return this.values.get(key) ?? null;
    }

    public setItem(key: string, value: string): void {
        this.values.set(key, value);
    }

    public removeItem(key: string): void {
        this.values.delete(key);
    }
}

/** 一个环境、账号或角色对应一个分区，避免存档互相覆盖。 */
export class StoragePartition {
    public constructor(
        private readonly storage: KeyValueStorage,
        private readonly prefix: string,
    ) {}

    public get<T>(key: string, schema: StorageSchema<T>): T {
        const raw = this.storage.getItem(this.toStorageKey(key));
        if (raw === null) {
            return schema.defaultValue;
        }

        try {
            const envelope = JSON.parse(raw) as StorageEnvelope;
            if (envelope.version === schema.version) {
                return envelope.value as T;
            }
            if (schema.migrate) {
                const migrated = schema.migrate(envelope.value, envelope.version);
                this.set(key, migrated, schema.version);
                return migrated;
            }
        } catch {
            // 损坏数据按缺失处理，避免阻断启动流程。
        }
        return schema.defaultValue;
    }

    public set<T>(key: string, value: T, version = 1): void {
        const envelope: StorageEnvelope = { version, value };
        this.storage.setItem(this.toStorageKey(key), JSON.stringify(envelope));
    }

    public remove(key: string): void {
        this.storage.removeItem(this.toStorageKey(key));
    }

    private toStorageKey(key: string): string {
        if (!key.trim()) {
            throw new Error('存储键不能为空');
        }
        return `${this.prefix}:${key}`;
    }
}

/** 负责创建并复用隔离的存储分区。 */
export class StorageService {
    private readonly partitions = new Map<string, StoragePartition>();

    public constructor(
        private readonly storage: KeyValueStorage,
        private readonly rootPrefix = 'cocoskit',
    ) {}

    public partition(name: string): StoragePartition {
        const normalized = name.trim();
        if (!normalized) {
            throw new Error('存储分区名不能为空');
        }

        const existing = this.partitions.get(normalized);
        if (existing) {
            return existing;
        }

        const created = new StoragePartition(this.storage, `${this.rootPrefix}:${normalized}`);
        this.partitions.set(normalized, created);
        return created;
    }
}

/** Web Mobile 默认使用 localStorage，不可用时回退到内存。 */
export function createDefaultStorage(): KeyValueStorage {
    try {
        if (globalThis.localStorage) {
            return globalThis.localStorage;
        }
    } catch {
        // 隐私模式或宿主限制可能禁止访问 localStorage。
    }
    return new MemoryStorage();
}
