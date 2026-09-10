import { sys } from 'cc';
import type { KeyValueStorage } from './StorageService';

/** 默认使用 Creator 统一封装的本地存储接口。 */
export function createDefaultStorage(): KeyValueStorage {
    return sys.localStorage;
}
