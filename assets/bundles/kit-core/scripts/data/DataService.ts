import { JsonAsset } from 'cc';
import type { AssetHandle } from '../assets/AssetHandle';
import type { AssetService } from '../assets/AssetService';

export type DataKey = string | number;
export type DataRow = Readonly<Record<string, unknown>>;

/** 带索引和覆盖层的只读配置表。 */
export class DataTable<T extends DataRow> {
    private readonly rows = new Map<DataKey, T>();
    private readonly overrides = new Map<DataKey, T>();

    public constructor(
        public readonly name: string,
        source: readonly T[],
        private readonly keyField: keyof T,
    ) {
        source.forEach((row) => this.addRow(row));
    }

    public get(key: DataKey): T {
        const row = this.tryGet(key);
        if (!row) {
            throw new Error(`配置不存在：${this.name}/${String(key)}`);
        }
        return row;
    }

    public tryGet(key: DataKey): T | undefined {
        return this.overrides.get(key) ?? this.rows.get(key);
    }

    public getAll(): readonly T[] {
        const merged = new Map(this.rows);
        this.overrides.forEach((row, key) => merged.set(key, row));
        return [...merged.values()];
    }

    /** 测试、活动或灰度配置可覆盖单行数据。 */
    public override(row: T): void {
        this.overrides.set(this.readKey(row), row);
    }

    public clearOverrides(): void {
        this.overrides.clear();
    }

    private addRow(row: T): void {
        const key = this.readKey(row);
        if (this.rows.has(key)) {
            throw new Error(`配置主键重复：${this.name}/${String(key)}`);
        }
        this.rows.set(key, row);
    }

    private readKey(row: T): DataKey {
        const key = row[this.keyField];
        if (typeof key !== 'string' && typeof key !== 'number') {
            throw new Error(`配置主键必须是字符串或数字：${this.name}.${String(this.keyField)}`);
        }
        return key;
    }
}

interface LoadedTable {
    readonly table: DataTable<DataRow>;
    readonly handle: AssetHandle<JsonAsset> | null;
}

/** 统一加载、索引和卸载 JSON 配置表。 */
export class DataService {
    private readonly tables = new Map<string, LoadedTable>();

    public constructor(private readonly assets: AssetService) {}

    public async loadTable<T extends DataRow>(
        name: string,
        bundleName: string,
        path: string,
        keyField: keyof T,
    ): Promise<DataTable<T>> {
        this.ensureMissing(name);
        const handle = await this.assets.load(bundleName, path, JsonAsset, {
            scope: `kit.data.${name}`,
        });

        try {
            const source = handle.asset.json;
            if (!Array.isArray(source)) {
                throw new Error(`配置表必须是数组：${name}`);
            }
            const table = new DataTable(name, source as T[], keyField);
            this.tables.set(name, {
                table: table as DataTable<DataRow>,
                handle,
            });
            return table;
        } catch (error) {
            this.assets.release(handle);
            throw error;
        }
    }

    /** 注册内存数据，适用于测试、服务器下发或运行时生成的数据。 */
    public registerTable<T extends DataRow>(
        name: string,
        rows: readonly T[],
        keyField: keyof T,
    ): DataTable<T> {
        this.ensureMissing(name);
        const table = new DataTable(name, rows, keyField);
        this.tables.set(name, {
            table: table as DataTable<DataRow>,
            handle: null,
        });
        return table;
    }

    public getTable<T extends DataRow>(name: string): DataTable<T> {
        const record = this.tables.get(name);
        if (!record) {
            throw new Error(`配置表尚未加载：${name}`);
        }
        return record.table as DataTable<T>;
    }

    public unload(name: string): void {
        const record = this.tables.get(name);
        if (!record) {
            return;
        }
        if (record.handle) {
            this.assets.release(record.handle);
        }
        this.tables.delete(name);
    }

    public clear(): void {
        [...this.tables.keys()].forEach((name) => this.unload(name));
    }

    private ensureMissing(name: string): void {
        if (!name.trim()) {
            throw new Error('配置表名称不能为空');
        }
        if (this.tables.has(name)) {
            throw new Error(`配置表已经存在：${name}`);
        }
    }
}
