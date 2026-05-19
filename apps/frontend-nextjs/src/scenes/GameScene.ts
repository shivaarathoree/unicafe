import * as Phaser from "phaser";
import { WebSocketManager, WebSocketMessage } from "../lib/WebSocketManager";
import { PlayerManager } from "../lib/PlayerManager";
import { ProximityManager } from "../lib/ProximityManager";
import { CallManager } from "../lib/CallManager";
import { AnimationManager } from "../lib/AnimationManager";
import { MovementManager } from "../lib/MovementManager";
import { MapManager } from "../lib/MapManager";
import { MessageHandler } from "../lib/MessageHandler";
import { VirtualJoystickManager } from "../lib/VirtualJoystickManager";
import { MusicManager } from "../lib/MusicManager";
import { tileToPixel } from "../lib/types";

class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private wsManager!: WebSocketManager;
  private playerManager!: PlayerManager;
  private proximityManager!: ProximityManager;
  private callManager!: CallManager;
  private animationManager!: AnimationManager;
  private movementManager!: MovementManager;
  private mapManager!: MapManager;
  private messageHandler!: MessageHandler;
  private musicManager!: MusicManager;
  private virtualJoystickManager?: VirtualJoystickManager;
  private playerId: string;
  private camera!: Phaser.Cameras.Scene2D.Camera;
  private sceneReady = false;
  private handleSendChatMessage?: EventListener;
  private handleInitiateCall?: EventListener;
  private handleStatusChange?: EventListener;
  private handleMusicControl?: EventListener;

  constructor(
    private name: string,
    private roomId: string,
    private character: string,
    userId?: string | null,
  ) {
    super({ key: "GameScene" });
    this.playerId = userId || Phaser.Utils.String.UUID();
  }

  preload() {
    this.mapManager = new MapManager(this);
    this.mapManager.preload(); // no-op for programmatic map

    this.animationManager = new AnimationManager(this);
    this.animationManager.preload();

    this.load.image("unidraw", "/tilesets/unidraw.png");
  }

  create() {
    this.camera = this.cameras.main;
    this.animationManager.create();

    // ── WebSocket (Socket.io) ────────────────────────────────────────────
    this.wsManager = new WebSocketManager(this.playerId, this.name, this.character);

    // ── Music ────────────────────────────────────────────────────────────
    this.musicManager = new MusicManager(this.wsManager);
    this.musicManager.setOnStateChange((state) => {
      window.dispatchEvent(new CustomEvent("musicStateChanged", { detail: state }));
    });

    // ── Player manager ───────────────────────────────────────────────────
    this.playerManager = new PlayerManager(this, this.animationManager, this.playerId);

    // ── Map ──────────────────────────────────────────────────────────────
    this.mapManager.create();
    const spawnTilePos = this.mapManager.getRandomSpawnPosition();
    const spawnPixel = tileToPixel(spawnTilePos.tileX, spawnTilePos.tileY);

    // ── Unidraw Collaboration Board ──────────────────────────────────────
    const unidrawBoard = this.add.image(142, 280, "unidraw");
    unidrawBoard.setScale(0.08);
    unidrawBoard.setInteractive({ useHandCursor: true });
    unidrawBoard.setDepth(100);

    this.tweens.add({
      targets: unidrawBoard,
      alpha: { from: 0.8, to: 1.0 },
      scale: { from: 0.075, to: 0.085 },
      yoyo: true,
      repeat: -1,
      duration: 1500,
      ease: "Sine.easeInOut"
    });

    unidrawBoard.on("pointerdown", () => {
      window.dispatchEvent(new CustomEvent("openWhiteboard"));
    });

    // ── Connect via Socket.io (same host) ──────────────────────────────────
    const wsUrl = `${window.location.origin}/ws/${this.roomId}`;
    this.wsManager.connect(wsUrl, spawnTilePos);

    // Expose wsManager to React components (MeetingPanel, PraiseSystem)
    window.dispatchEvent(new CustomEvent("wsManagerReady", { detail: this.wsManager }));

    // ── Local player ─────────────────────────────────────────────────────
    this.player = this.playerManager.createLocalPlayer(
      this.playerId, this.name,
      spawnPixel.x, spawnPixel.y,
      this.character,
    );

    const isMobile = !this.sys.game.device.os.desktop;

    // ── Movement ─────────────────────────────────────────────────────────
    this.movementManager = new MovementManager(
      this, this.player, this.animationManager,
      this.playerId, this.wsManager, isMobile,
    );

    this.sceneReady = true;

    // ── Managers ─────────────────────────────────────────────────────────
    this.callManager = new CallManager(this, this.wsManager, this.playerId);

    this.proximityManager = new ProximityManager(
      this, this.wsManager, this.playerManager,
      this.callManager, this.player, this.playerId,
    );

    this.mapManager.setupColliders(this.player);
    this.movementManager.setCollisionChecker((x, y) => this.mapManager.checkCollisionAt(x, y));

    // ── Message handler ──────────────────────────────────────────────────
    this.messageHandler = new MessageHandler(
      this, this.wsManager, this.playerManager,
      this.proximityManager, this.callManager,
      this.animationManager, this.playerId, this.player,
    );
    this.messageHandler.setSceneReady(true);
    this.wsManager.setOnMessage((msg: WebSocketMessage) => {
      this.messageHandler.handleMessage(msg);
      // Route music events to MusicManager
      if (msg.type === "music_state") {
        this.musicManager.handleMusicState(msg.data as any);
      }
      // Also send space-joined music state
      if (msg.type === "space-joined" && (msg.data as any).music) {
        this.musicManager.handleMusicState((msg.data as any).music);
      }
      // Forward webrtc_signal to MeetingPanel via window event
      if (msg.type === "webrtc_signal") {
        window.dispatchEvent(new CustomEvent("wsMessage_webrtc_signal", { detail: msg.data }));
      }
    });

    // ── Camera: fit whole cafe room on screen ────────────────────────────
    const mapW = this.mapManager.getMapWidth();
    const mapH = this.mapManager.getMapHeight();
    this.cameras.main.setBounds(0, 0, mapW, mapH);
    this.physics.world.setBounds(0, 0, mapW, mapH);

    // Zoom to show whole room — smaller on mobile
    const screenW = this.game.canvas.width;
    const screenH = this.game.canvas.height;
    const zoomX = screenW / mapW;
    const zoomY = screenH / mapH;
    const targetZoom = Math.min(zoomX, zoomY) * 0.92; // 92% to add breathing room
    const minZoom = 0.7;
    const maxZoom = 1.8;
    const zoom = Math.max(minZoom, Math.min(maxZoom, targetZoom));
    this.camera.setZoom(zoom);
    this.camera.startFollow(this.player);
    this.camera.setDeadzone(80, 60);

    // ── Mobile joystick ──────────────────────────────────────────────────
    if (isMobile) {
      this.virtualJoystickManager = new VirtualJoystickManager(this);
    }

    // ── Event listeners from React ────────────────────────────────────────
    this.handleSendChatMessage = ((e: CustomEvent) => {
      this.wsManager.send("chat", e.detail);
    }) as EventListener;
    window.addEventListener("sendChatMessage", this.handleSendChatMessage);

    this.handleInitiateCall = ((e: CustomEvent) => {
      const { playerId, type } = e.detail;
      this.proximityManager.initiateCall(playerId, type);
    }) as EventListener;
    window.addEventListener("initiateCall", this.handleInitiateCall);

    this.handleStatusChange = ((e: CustomEvent) => {
      const { status } = e.detail;
      this.wsManager.send("status_change", { status });
      this.playerManager.updatePlayerStatus(this.playerId, status);
    }) as EventListener;
    window.addEventListener("statusChange", this.handleStatusChange);

    this.handleMusicControl = ((e: CustomEvent) => {
      const { action } = e.detail;
      if (action === "toggle") this.musicManager.togglePlay();
      else if (action === "next") this.musicManager.nextTrack();
      else if (action === "prev") this.musicManager.prevTrack();
      else if (action === "volume") this.musicManager.setVolume(e.detail.volume);
      else if (action === "youtube") {
        this.wsManager.send("music_control", { action: "youtube", youtubeId: e.detail.youtubeId });
      }
      else if (action === "yt_state") {
        this.wsManager.send("music_control", { action: "yt_state", ytState: e.detail.ytState, seek: e.detail.seek });
      }
      else if (action === "mp3") {
        this.wsManager.send("music_control", { action: "mp3", mp3Name: e.detail.mp3Name, duration: e.detail.duration });
      }
      else if (action === "seek") {
        this.wsManager.send("music_control", { action: "seek", seekTime: e.detail.seekTime });
      }
    }) as EventListener;
    window.addEventListener("musicControl", this.handleMusicControl);
  }

  update(_time: number, delta: number) {
    if (!this.player) return;
    this.playerManager.updateLocalPlayerNameTag(this.player.x, this.player.y);

    if (this.virtualJoystickManager) {
      const vel = this.virtualJoystickManager.getVelocity();
      this.movementManager.setJoystickVelocity(vel.x, vel.y);
    } else {
      this.movementManager.setJoystickVelocity(0, 0);
    }

    this.movementManager.update(delta);
    this.proximityManager?.update();
    this.playerManager?.update();
  }

  public cleanup() {
    window.removeEventListener("sendChatMessage", this.handleSendChatMessage!);
    window.removeEventListener("initiateCall", this.handleInitiateCall!);
    window.removeEventListener("statusChange", this.handleStatusChange!);
    window.removeEventListener("musicControl", this.handleMusicControl!);
    this.musicManager?.destroy();
    this.wsManager?.disconnect();
    this.playerManager?.destroy();
    this.proximityManager?.destroy();
    this.callManager?.cleanup();
    this.virtualJoystickManager?.destroy();
  }
}

export default GameScene;
