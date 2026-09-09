export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface HttpRequest<TBody = unknown> {
    readonly path: string;
    readonly method?: HttpMethod;
    readonly body?: TBody;
    readonly headers?: Readonly<Record<string, string>>;
    readonly timeoutMs?: number;
    readonly retries?: number;
    readonly signal?: AbortSignal;
}

export interface HttpResponse<T> {
    readonly status: number;
    readonly data: T;
}

export interface HttpTransport {
    send<TResponse, TBody>(
        url: string,
        request: HttpRequest<TBody>,
        signal: AbortSignal,
    ): Promise<HttpResponse<TResponse>>;
}

export class HttpStatusError extends Error {
    public constructor(public readonly status: number, message: string) {
        super(message);
    }
}

/** 基于浏览器 fetch 的 JSON 传输实现。 */
export class FetchHttpTransport implements HttpTransport {
    public async send<TResponse, TBody>(
        url: string,
        request: HttpRequest<TBody>,
        signal: AbortSignal,
    ): Promise<HttpResponse<TResponse>> {
        const headers = { ...request.headers };
        if (request.body !== undefined && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }

        const response = await fetch(url, {
            method: request.method ?? 'GET',
            headers,
            body: request.body === undefined ? undefined : JSON.stringify(request.body),
            signal,
        });
        const text = await response.text();
        const data = text ? this.parseBody(text) : undefined;
        if (!response.ok) {
            throw new HttpStatusError(response.status, `HTTP 请求失败：${response.status}`);
        }
        return { status: response.status, data: data as TResponse };
    }

    private parseBody(text: string): unknown {
        try {
            return JSON.parse(text);
        } catch {
            return text;
        }
    }
}

export type SocketState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
export type SocketStateListener = (state: SocketState) => void;
export type SocketMessageListener = (data: unknown) => void;

export interface SocketOptions {
    readonly reconnectAttempts?: number;
    readonly reconnectDelayMs?: number;
}

/** 可替换的 WebSocket 最小接口，便于测试和接入小游戏实现。 */
export interface WebSocketLike {
    readonly readyState: number;
    onopen: ((event: Event) => unknown) | null;
    onmessage: ((event: MessageEvent<unknown>) => unknown) | null;
    onclose: ((event: CloseEvent) => unknown) | null;
    onerror: ((event: Event) => unknown) | null;
    send(data: string): void;
    close(): void;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

/** 管理单条连接，并在意外断开后按配置重连。 */
export class ReconnectingSocket {
    private readonly stateListeners = new Set<SocketStateListener>();
    private readonly messageListeners = new Set<SocketMessageListener>();
    private socket: WebSocketLike | null = null;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private reconnectCount = 0;
    private manuallyClosed = false;
    private currentState: SocketState = 'disconnected';

    public constructor(
        private readonly url: string,
        private readonly factory: WebSocketFactory,
        private readonly options: SocketOptions = {},
    ) {}

    public get state(): SocketState {
        return this.currentState;
    }

    public connect(): void {
        if (this.socket || this.reconnectTimer) {
            return;
        }
        this.manuallyClosed = false;
        this.open(false);
    }

    public disconnect(): void {
        this.manuallyClosed = true;
        this.clearReconnectTimer();
        const socket = this.socket;
        this.socket = null;
        socket?.close();
        this.changeState('disconnected');
    }

    public send(message: unknown): void {
        if (!this.socket || this.currentState !== 'connected') {
            throw new Error('WebSocket 尚未连接');
        }
        this.socket.send(typeof message === 'string' ? message : JSON.stringify(message));
    }

    public onStateChange(listener: SocketStateListener): () => void {
        this.stateListeners.add(listener);
        listener(this.currentState);
        return () => this.stateListeners.delete(listener);
    }

    public onMessage(listener: SocketMessageListener): () => void {
        this.messageListeners.add(listener);
        return () => this.messageListeners.delete(listener);
    }

    private open(reconnecting: boolean): void {
        this.changeState(reconnecting ? 'reconnecting' : 'connecting');
        const socket = this.factory(this.url);
        this.socket = socket;
        socket.onopen = () => {
            this.reconnectCount = 0;
            this.changeState('connected');
        };
        socket.onmessage = (event) => {
            this.messageListeners.forEach((listener) => listener(event.data));
        };
        socket.onerror = () => undefined;
        socket.onclose = () => {
            if (this.socket === socket) {
                this.socket = null;
            }
            if (this.manuallyClosed) {
                this.changeState('disconnected');
                return;
            }
            this.scheduleReconnect();
        };
    }

    private scheduleReconnect(): void {
        const maxAttempts = Math.max(0, this.options.reconnectAttempts ?? 3);
        if (this.reconnectCount >= maxAttempts) {
            this.changeState('disconnected');
            return;
        }

        this.reconnectCount += 1;
        this.changeState('reconnecting');
        const delayMs = Math.max(0, this.options.reconnectDelayMs ?? 1000);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.open(true);
        }, delayMs);
    }

    private changeState(state: SocketState): void {
        if (this.currentState === state) {
            return;
        }
        this.currentState = state;
        this.stateListeners.forEach((listener) => listener(state));
    }

    private clearReconnectTimer(): void {
        if (this.reconnectTimer === null) {
            return;
        }
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
    }
}

/** HTTP 和长连接的统一入口。 */
export class NetworkService {
    private readonly sockets = new Set<ReconnectingSocket>();
    private authTokenProvider: (() => string | undefined) | null = null;
    private baseUrl: string;

    public constructor(
        private readonly transport: HttpTransport = new FetchHttpTransport(),
        baseUrl = '',
        private readonly socketFactory: WebSocketFactory = (url) => new WebSocket(url),
    ) {
        this.baseUrl = this.normalizeBaseUrl(baseUrl);
    }

    public configure(baseUrl: string, authTokenProvider?: () => string | undefined): void {
        this.baseUrl = this.normalizeBaseUrl(baseUrl);
        this.authTokenProvider = authTokenProvider ?? null;
    }

    public async request<TResponse, TBody = unknown>(
        request: HttpRequest<TBody>,
    ): Promise<TResponse> {
        const retries = Math.max(0, request.retries ?? 0);
        let attempt = 0;
        while (true) {
            try {
                const response = await this.sendOnce<TResponse, TBody>(request);
                return response.data;
            } catch (error) {
                if (attempt >= retries || request.signal?.aborted || !this.isRetryable(error)) {
                    throw error;
                }
                attempt += 1;
            }
        }
    }

    public openSocket(url: string, options: SocketOptions = {}): ReconnectingSocket {
        const socket = new ReconnectingSocket(url, this.socketFactory, options);
        this.sockets.add(socket);
        socket.connect();
        return socket;
    }

    public closeSocket(socket: ReconnectingSocket): void {
        socket.disconnect();
        this.sockets.delete(socket);
    }

    public dispose(): void {
        this.sockets.forEach((socket) => socket.disconnect());
        this.sockets.clear();
    }

    private async sendOnce<TResponse, TBody>(
        request: HttpRequest<TBody>,
    ): Promise<HttpResponse<TResponse>> {
        const controller = new AbortController();
        const abort = (): void => controller.abort();
        request.signal?.addEventListener('abort', abort, { once: true });
        if (request.signal?.aborted) {
            controller.abort();
        }
        const timeoutMs = Math.max(0, request.timeoutMs ?? 10000);
        const timer = timeoutMs > 0 ? setTimeout(abort, timeoutMs) : null;

        try {
            const token = this.authTokenProvider?.();
            const headers = token
                ? { Authorization: `Bearer ${token}`, ...request.headers }
                : request.headers;
            return await this.transport.send<TResponse, TBody>(
                this.resolveUrl(request.path),
                { ...request, headers },
                controller.signal,
            );
        } finally {
            if (timer !== null) {
                clearTimeout(timer);
            }
            request.signal?.removeEventListener('abort', abort);
        }
    }

    private resolveUrl(path: string): string {
        if (/^https?:\/\//i.test(path)) {
            return path;
        }
        return `${this.baseUrl}/${path.replace(/^\//, '')}`;
    }

    private normalizeBaseUrl(baseUrl: string): string {
        return baseUrl.replace(/\/+$/, '');
    }

    private isRetryable(error: unknown): boolean {
        if (!(error instanceof HttpStatusError)) {
            return true;
        }
        return error.status === 408 || error.status === 429 || error.status >= 500;
    }
}
