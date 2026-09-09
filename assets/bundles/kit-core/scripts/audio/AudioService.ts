import { AudioClip, AudioSource, Node, director } from 'cc';
import type { AssetHandle } from '../assets/AssetHandle';
import { DelayedAssetReleaseStrategy } from '../assets/AssetReleaseStrategy';
import type { AssetService } from '../assets/AssetService';

/** BGM 与音效的统一播放、音量和静音控制。 */
export class AudioService {
    private root: Node | null = null;
    private musicSource: AudioSource | null = null;
    private effectSource: AudioSource | null = null;
    private musicHandle: AssetHandle<AudioClip> | null = null;
    private musicRequestId = 0;
    private musicVolume = 1;
    private effectVolume = 1;
    private muted = false;

    public constructor(private readonly assets: AssetService) {}

    public async playMusic(bundle: string, path: string, loop = true): Promise<void> {
        const requestId = ++this.musicRequestId;
        const handle = await this.assets.load(bundle, path, AudioClip, {
            scope: 'kit.audio.music',
        });
        if (requestId !== this.musicRequestId) {
            this.assets.release(handle);
            return;
        }

        try {
            this.ensureSources();
            this.stopMusic();
            this.musicHandle = handle;
            this.musicSource!.clip = handle.asset;
            this.musicSource!.loop = loop;
            this.updateVolumes();
            this.musicSource!.play();
        } catch (error) {
            if (this.musicHandle === handle) {
                this.musicSource?.stop();
                if (this.musicSource) {
                    this.musicSource.clip = null;
                }
                this.musicHandle = null;
            }
            this.assets.release(handle);
            throw error;
        }
    }

    public async playEffect(bundle: string, path: string): Promise<void> {
        const handle = await this.assets.load(bundle, path, AudioClip, {
            scope: 'kit.audio.effects',
        });
        try {
            this.ensureSources();
            this.effectSource!.playOneShot(handle.asset, this.muted ? 0 : this.effectVolume);

            // 播放结束后再释放引用，额外留一帧级余量。
            const delayMs = Math.ceil(handle.asset.getDuration() * 1000) + 100;
            this.assets.release(handle, new DelayedAssetReleaseStrategy(delayMs));
        } catch (error) {
            this.assets.release(handle);
            throw error;
        }
    }

    public stopMusic(): void {
        this.musicSource?.stop();
        if (this.musicSource) {
            this.musicSource.clip = null;
        }
        if (this.musicHandle) {
            this.assets.release(this.musicHandle);
            this.musicHandle = null;
        }
    }

    public setMusicVolume(volume: number): void {
        this.musicVolume = this.clampVolume(volume);
        this.updateVolumes();
    }

    public setEffectVolume(volume: number): void {
        this.effectVolume = this.clampVolume(volume);
        this.updateVolumes();
    }

    public setMuted(muted: boolean): void {
        this.muted = muted;
        this.updateVolumes();
    }

    public dispose(): void {
        this.musicRequestId += 1;
        this.stopMusic();
        if (this.root) {
            director.removePersistRootNode(this.root);
            this.root.destroy();
        }
        this.root = null;
        this.musicSource = null;
        this.effectSource = null;
    }

    private ensureSources(): void {
        if (this.root) {
            return;
        }
        const scene = director.getScene();
        if (!scene) {
            throw new Error('当前没有可承载音频节点的场景');
        }

        this.root = new Node('kit-audio');
        scene.addChild(this.root);
        director.addPersistRootNode(this.root);
        this.musicSource = this.createSource('music');
        this.effectSource = this.createSource('effects');
        this.updateVolumes();
    }

    private createSource(name: string): AudioSource {
        const node = new Node(`kit-audio-${name}`);
        this.root!.addChild(node);
        return node.addComponent(AudioSource);
    }

    private updateVolumes(): void {
        if (this.musicSource) {
            this.musicSource.volume = this.muted ? 0 : this.musicVolume;
        }
        if (this.effectSource) {
            this.effectSource.volume = this.muted ? 0 : this.effectVolume;
        }
    }

    private clampVolume(volume: number): number {
        return Math.min(1, Math.max(0, volume));
    }
}
