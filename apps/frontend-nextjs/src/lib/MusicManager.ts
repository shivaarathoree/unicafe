import { WebSocketManager } from "./WebSocketManager";

export interface MusicTrack {
  name: string;
  emoji: string;
  url: string;
}

// Lo-fi tracks — royalty-free streams from lofi.co CDN & web-accessible URLs
export const LOFI_TRACKS: MusicTrack[] = [
  {
    name: "Café Rainy Day",
    emoji: "☕",
    url: "https://stream.zeno.fm/f3wvbbqmdg8uv",   // Lofi Hip Hop radio
  },
  {
    name: "Study Session",
    emoji: "📚",
    url: "https://stream.zeno.fm/0r0xa792kwzuv",   // Chillhop radio
  },
  {
    name: "Late Night Beats",
    emoji: "🌙",
    url: "https://stream.zeno.fm/yhby3t1yfpquv",
  },
];

export class MusicManager {
  private wsManager: WebSocketManager;
  private audio: HTMLAudioElement | null = null;
  private currentTrackIdx = 0;
  private playing = false;
  private volume = 0.35;
  private mode: "lofi" | "youtube" | "mp3" = "lofi";
  private youtubeUrl?: string;
  private mp3Name?: string | null = null;
  private duration?: number = 180;
  private startedAt?: number | null = null;
  private controlledBy?: string | null = null;
  private onStateChange?: (state: MusicState) => void;

  constructor(wsManager: WebSocketManager) {
    this.wsManager = wsManager;
  }

  setOnStateChange(cb: (state: MusicState) => void) {
    this.onStateChange = cb;
  }

  /** Called by MessageHandler when a music_state event arrives */
  handleMusicState(data: MusicState) {
    this.currentTrackIdx = data.track ?? 0;
    this.mode = data.mode || "lofi";
    this.youtubeUrl = data.youtubeUrl;
    this.mp3Name = data.mp3Name;
    this.duration = data.duration;
    this.startedAt = data.startedAt;
    this.controlledBy = data.controlledBy;

    if (this.mode === "lofi") {
      if (data.playing && !this.playing) {
        this.startPlayback(this.currentTrackIdx, data.seekTime ?? 0, data.serverTime);
      } else if (!data.playing && this.playing) {
        this.stopPlayback();
      } else if (data.playing && this.audio) {
        // Track changed while playing
        const track = LOFI_TRACKS[data.track ?? 0];
        if (this.audio.src !== track.url) {
          this.startPlayback(this.currentTrackIdx, 0, data.serverTime);
        }
      }
    } else {
      // Pause local lofi if not in lofi mode
      this.stopPlayback();
    }

    this.playing = data.playing;
    this.emitState(data.seekTime ?? 0, data.serverTime);
  }

  /** Local play/pause toggle — broadcasts to all */
  togglePlay() {
    const newPlaying = !this.playing;
    this.wsManager.send("music_control", {
      action: newPlaying ? "play" : "pause",
      track: this.currentTrackIdx,
    });
  }

  /** Local track change — broadcasts to all */
  nextTrack() {
    this.currentTrackIdx = (this.currentTrackIdx + 1) % LOFI_TRACKS.length;
    this.wsManager.send("music_control", {
      action: "track_change",
      track: this.currentTrackIdx,
    });
  }

  prevTrack() {
    this.currentTrackIdx = (this.currentTrackIdx - 1 + LOFI_TRACKS.length) % LOFI_TRACKS.length;
    this.wsManager.send("music_control", {
      action: "track_change",
      track: this.currentTrackIdx,
    });
  }

  setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.audio) this.audio.volume = this.volume;
    this.emitState();
  }

  getVolume() { return this.volume; }
  isPlaying() { return this.playing; }
  getCurrentTrack() { return LOFI_TRACKS[this.currentTrackIdx]; }
  getCurrentTrackIdx() { return this.currentTrackIdx; }

  private startPlayback(trackIdx: number, seekTime: number, serverTime?: number) {
    this.stopPlayback();
    const track = LOFI_TRACKS[trackIdx];
    this.audio = new Audio(track.url);
    this.audio.volume = this.volume;
    this.audio.loop = true;

    // Adjust for server offset if streaming
    if (seekTime > 0) {
      this.audio.currentTime = seekTime;
    }

    this.audio.play().catch((e) => {
      console.warn("[Music] Autoplay blocked — click to play:", e.message);
    });

    this.playing = true;
  }

  private stopPlayback() {
    if (this.audio) {
      this.audio.pause();
      this.audio.src = "";
      this.audio = null;
    }
    this.playing = false;
  }

  private emitState(seekTime?: number, serverTime?: number) {
    if (this.onStateChange) {
      this.onStateChange({
        playing: this.playing,
        track: this.currentTrackIdx,
        mode: this.mode,
        youtubeUrl: this.youtubeUrl,
        mp3Name: this.mp3Name,
        duration: this.duration,
        seekTime: seekTime ?? (this.audio?.currentTime ?? 0),
        startedAt: this.startedAt,
        controlledBy: this.controlledBy,
        serverTime: serverTime ?? Date.now(),
      });
    }
  }

  destroy() {
    this.stopPlayback();
  }
}

export interface MusicState {
  playing: boolean;
  track: number;
  mode: "lofi" | "youtube" | "mp3";
  youtubeUrl?: string;
  mp3Name?: string | null;
  duration?: number;
  seekTime?: number;
  startedAt?: number | null;
  serverTime?: number;
  controlledBy?: string | null;
}
