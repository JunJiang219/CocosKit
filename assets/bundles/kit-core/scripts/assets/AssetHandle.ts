import { Asset } from 'cc';

/** 单个资源引用句柄，释放操作幂等。 */
export class AssetHandle<T extends Asset> {
    private released = false;

    public constructor(
        public readonly asset: T,
        private readonly onRelease: () => void,
    ) {
        this.asset.addRef();
    }

    /** 释放当前调用方持有的资源引用。 */
    public release(): void {
        if (this.released) {
            return;
        }
        this.released = true;
        this.asset.decRef();
        this.onRelease();
    }
}
