/** 加载进度的计量单位：Bundle 使用资源项，远程下载优先使用字节。 */
export type AssetLoadProgressUnit = 'items' | 'bytes';

/** 与 Creator 内部 RequestItem 解耦的统一加载进度。 */
export interface AssetLoadProgress {
    readonly completed: number;
    readonly total: number;
    readonly ratio: number;
    readonly unit: AssetLoadProgressUnit;
}

export type AssetLoadProgressCallback = (progress: AssetLoadProgress) => void;

/** Bundle 资源加载的公共选项。 */
export interface AssetLoadOptions {
    readonly scope?: string;
    readonly onProgress?: AssetLoadProgressCallback;
}

/** 远程资源选项，requestOptions 用于透传请求头等 Creator 参数。 */
export interface RemoteAssetLoadOptions extends AssetLoadOptions {
    readonly ext?: string;
    readonly reloadAsset?: boolean;
    readonly requestOptions?: Readonly<Record<string, unknown>>;
}

/** 将底层数量转换为稳定的 0～1 进度。 */
export function createAssetLoadProgress(
    completed: number,
    total: number,
    unit: AssetLoadProgressUnit,
): AssetLoadProgress {
    const safeCompleted = Math.max(0, completed);
    const safeTotal = Math.max(0, total);
    const rawRatio = safeTotal > 0 ? safeCompleted / safeTotal : 0;

    return {
        completed: safeCompleted,
        total: safeTotal,
        ratio: Math.min(1, Math.max(0, rawRatio)),
        unit,
    };
}
