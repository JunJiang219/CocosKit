import type { KitCoreFacade } from '../../../kit-core/scripts/KitCoreFacade';
import type { ReconnectingSocket, SocketState } from '../../../kit-core/scripts/network/NetworkService';
import type { StoragePartition, StorageSchema } from '../../../kit-core/scripts/storage/StorageService';

export type SampleFlowState = 'login' | 'lobby' | 'settings' | 'offline';

export interface LoginRequest {
    readonly account: string;
    readonly password: string;
}

export interface LoginResponse {
    readonly token: string;
    readonly playerId: string;
}

export interface PlayerSettings {
    readonly musicVolume: number;
    readonly effectVolume: number;
    readonly muted: boolean;
}

const SETTINGS_SCHEMA: StorageSchema<PlayerSettings> = {
    version: 1,
    defaultValue: {
        musicVolume: 1,
        effectVolume: 1,
        muted: false,
    },
};

/**
 * 阶段二样板流程：登录、大厅、设置，以及长连接断线恢复。
 * UI 资源和真实接口地址由具体项目配置，不硬编码在通用框架中。
 */
export class SampleGameFlow {
    private readonly listeners = new Set<(state: SampleFlowState) => void>();
    private currentState: SampleFlowState = 'login';
    private playerStorage: StoragePartition | null = null;
    private socket: ReconnectingSocket | null = null;
    private unsubscribeSocket: (() => void) | null = null;

    public constructor(private readonly core: KitCoreFacade) {}

    public get state(): SampleFlowState {
        return this.currentState;
    }

    public onStateChange(listener: (state: SampleFlowState) => void): () => void {
        this.listeners.add(listener);
        listener(this.currentState);
        return () => this.listeners.delete(listener);
    }

    public async login(request: LoginRequest): Promise<LoginResponse> {
        const response = await this.core.network.request<LoginResponse, LoginRequest>({
            path: '/login',
            method: 'POST',
            body: request,
            timeoutMs: 10000,
            retries: 1,
        });
        this.playerStorage = this.core.storage.partition(`player.${response.playerId}`);
        this.applySettings(this.getSettings());
        this.changeState('lobby');
        return response;
    }

    public enterSettings(): PlayerSettings {
        this.ensureLoggedIn();
        this.changeState('settings');
        return this.getSettings();
    }

    public saveSettings(settings: PlayerSettings): void {
        this.ensureLoggedIn();
        this.playerStorage!.set('settings', settings, SETTINGS_SCHEMA.version);
        this.applySettings(settings);
        this.changeState('lobby');
    }

    public connectRealtime(url: string): void {
        this.closeRealtime();
        this.socket = this.core.network.openSocket(url, {
            reconnectAttempts: 5,
            reconnectDelayMs: 1000,
        });
        this.unsubscribeSocket = this.socket.onStateChange((state) => {
            this.handleSocketState(state);
        });
    }

    public logout(): void {
        this.closeRealtime();
        this.playerStorage = null;
        this.changeState('login');
    }

    private getSettings(): PlayerSettings {
        this.ensureLoggedIn();
        return this.playerStorage!.get('settings', SETTINGS_SCHEMA);
    }

    private applySettings(settings: PlayerSettings): void {
        this.core.audio.setMusicVolume(settings.musicVolume);
        this.core.audio.setEffectVolume(settings.effectVolume);
        this.core.audio.setMuted(settings.muted);
    }

    private handleSocketState(state: SocketState): void {
        if (state === 'connected' && this.currentState === 'offline') {
            this.changeState('lobby');
        } else if (state === 'reconnecting' || state === 'disconnected') {
            this.changeState('offline');
        }
    }

    private closeRealtime(): void {
        this.unsubscribeSocket?.();
        this.unsubscribeSocket = null;
        if (this.socket) {
            this.core.network.closeSocket(this.socket);
            this.socket = null;
        }
    }

    private ensureLoggedIn(): void {
        if (!this.playerStorage) {
            throw new Error('玩家尚未登录');
        }
    }

    private changeState(state: SampleFlowState): void {
        if (this.currentState === state) {
            return;
        }
        this.currentState = state;
        this.listeners.forEach((listener) => listener(state));
    }
}
