import {
    HttpRequest,
    HttpResponse,
    HttpTransport,
    NetworkService,
    WebSocketLike,
} from '../../assets/bundles/kit-core/scripts/network/NetworkService';
import {
    PlatformAdapter,
    PlatformCapability,
    PlatformService,
} from '../../assets/bundles/kit-core/scripts/platform/PlatformService';
import {
    MemoryStorage,
    StorageService,
} from '../../assets/bundles/kit-core/scripts/storage/StorageService';

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(`断言失败：${message}`);
    }
}

async function testStoragePartitionAndMigration(): Promise<void> {
    const service = new StorageService(new MemoryStorage(), 'test');
    const playerA = service.partition('player-a');
    const playerB = service.partition('player-b');
    playerA.set('settings', { volume: 0.5 }, 1);

    const migrated = playerA.get('settings', {
        version: 2,
        defaultValue: { volume: 1, muted: false },
        migrate: (value) => ({
            volume: (value as { volume: number }).volume,
            muted: false,
        }),
    });
    const isolated = playerB.get('settings', {
        version: 2,
        defaultValue: { volume: 1, muted: false },
    });

    assert(migrated.volume === 0.5 && !migrated.muted, '旧存档应迁移到新版本');
    assert(isolated.volume === 1, '不同玩家分区不应读取到彼此的数据');
}

class RetryTransport implements HttpTransport {
    public attempts = 0;
    public lastUrl = '';

    public async send<TResponse, TBody>(
        url: string,
        _request: HttpRequest<TBody>,
        _signal: AbortSignal,
    ): Promise<HttpResponse<TResponse>> {
        this.attempts += 1;
        this.lastUrl = url;
        if (this.attempts === 1) {
            throw new Error('模拟临时断网');
        }
        return {
            status: 200,
            data: { ok: true } as TResponse,
        };
    }
}

async function testHttpRetryAndUrlResolution(): Promise<void> {
    const transport = new RetryTransport();
    const network = new NetworkService(transport, 'https://api.example.com/');
    const result = await network.request<{ ok: boolean }>({
        path: '/login',
        retries: 1,
        timeoutMs: 100,
    });

    assert(result.ok, '重试成功后应返回响应数据');
    assert(transport.attempts === 2, '临时失败后应按配置重试一次');
    assert(transport.lastUrl === 'https://api.example.com/login', '应正确拼接基础地址');
}

class FakeSocket implements WebSocketLike {
    public readyState = 0;
    public onopen: ((event: Event) => unknown) | null = null;
    public onmessage: ((event: MessageEvent<unknown>) => unknown) | null = null;
    public onclose: ((event: CloseEvent) => unknown) | null = null;
    public onerror: ((event: Event) => unknown) | null = null;

    public send(_data: string): void {}

    public close(): void {
        this.onclose?.({} as CloseEvent);
    }

    public open(): void {
        this.readyState = 1;
        this.onopen?.({} as Event);
    }

    public drop(): void {
        this.readyState = 3;
        this.onclose?.({} as CloseEvent);
    }
}

async function testSocketReconnect(): Promise<void> {
    const created: FakeSocket[] = [];
    const network = new NetworkService(
        new RetryTransport(),
        '',
        () => {
            const socket = new FakeSocket();
            created.push(socket);
            return socket;
        },
    );
    const connection = network.openSocket('wss://socket.example.com', {
        reconnectAttempts: 1,
        reconnectDelayMs: 1,
    });
    created[0].open();
    created[0].drop();

    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    assert(created.length === 2, '意外断开后应创建一次重连连接');
    created[1].open();
    assert(connection.state === 'connected', '重连成功后状态应恢复为 connected');
    network.dispose();
}

class FakePlatformAdapter implements PlatformAdapter {
    public readonly name = 'fake';
    public copiedText = '';

    public supports(_capability: PlatformCapability): boolean {
        return true;
    }

    public async copyText(text: string): Promise<void> {
        this.copiedText = text;
    }

    public async vibrate(_durationMs: number): Promise<void> {}
    public openUrl(_url: string): void {}
}

async function testPlatformAdapterReplacement(): Promise<void> {
    const adapter = new FakePlatformAdapter();
    const platform = new PlatformService(adapter);
    await platform.copyText('CocosKit');
    assert(platform.name === 'fake', '平台服务应暴露当前适配器名称');
    assert(adapter.copiedText === 'CocosKit', '平台调用应转发给当前适配器');
}

async function run(): Promise<void> {
    await testStoragePartitionAndMigration();
    await testHttpRetryAndUrlResolution();
    await testSocketReconnect();
    await testPlatformAdapterReplacement();
    console.info('phase-two integration tests passed');
}

void run();
