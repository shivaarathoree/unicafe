import * as Phaser from "phaser";
import { AnimationManager, Direction } from "./AnimationManager";
import { TILE_SIZE, tileToPixel } from "./types";
import type { PlayerStatus } from "./types";

interface RemotePlayerState {
  // Server-authoritative target position (pixel coords)
  targetX: number;
  targetY: number;
  // Tile position for proximity calculations
  tileX: number;
  tileY: number;
  direction: Direction;
  isMoving: boolean;
  lastUpdateTime: number;
  status: PlayerStatus;
  // Velocity estimate for dead-reckoning
  velX: number;
  velY: number;
  lastX: number;
  lastY: number;
}

interface NameTag {
  container: Phaser.GameObjects.Container;
  background: Phaser.GameObjects.Graphics;
  nameText: Phaser.GameObjects.Text;
  statusDot: Phaser.GameObjects.Graphics;
  width: number;
}

// Pixel distance threshold at which we SNAP instead of interpolating
const SNAP_THRESHOLD = TILE_SIZE * 8;
// If distance is below this, consider player "at target"
const ARRIVED_THRESHOLD = 1.5;
// Interpolation lerp factor per frame (higher = snappier, lower = smoother)
const LERP = 0.18;

export class PlayerManager {
  private scene: Phaser.Scene;
  private animationManager: AnimationManager;
  private players: Map<string, Phaser.GameObjects.Container> = new Map();
  private playerLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private nameTags: Map<string, NameTag> = new Map();
  private playerStates: Map<string, RemotePlayerState> = new Map();
  private remotePlayersGroup: Phaser.GameObjects.Group;
  private playerId: string;
  private localPlayer?: Phaser.Physics.Arcade.Sprite;

  private readonly COLORS = {
    background: 0x1f2937,
    backgroundAlpha: 0.85,
    text: 0xffffff,
    statusAvailable: 0x34d399,
    statusAway: 0xfbbf24,
    statusBusy: 0xf87171,
    statusInCall: 0xa78bfa,
    border: 0x374151,
  };

  private statusColorMap: Record<string, number> = {
    available: 0x34d399,
    away: 0xfbbf24,
    busy: 0xf87171,
    in_call: 0xa78bfa,
    offline: 0x9ca3af,
  };

  constructor(
    scene: Phaser.Scene,
    animationManager: AnimationManager,
    playerId: string,
  ) {
    this.scene = scene;
    this.animationManager = animationManager;
    this.playerId = playerId;
    this.remotePlayersGroup = this.scene.add.group();
  }

  createLocalPlayer(
    id: string,
    name: string,
    x: number,
    y: number,
    character: string,
  ): Phaser.Physics.Arcade.Sprite {
    const player = this.scene.physics.add.sprite(x, y, `${character}_idle`);
    player.setName("localPlayer");
    player.setScale(2.0);
    player.setOrigin(0.5, 1.0);

    const animKey = this.animationManager.getAnimationKey(
      character,
      "idle",
      "down",
    );
    player.play(animKey);
    player.setData("spriteName", character);

    // Soft shadow under local player
    this.addShadow(id, x, y, true);

    this.localPlayer = player;

    const nameTag = this.createNameTag(id, name, player.x, player.y - 55, true);
    this.nameTags.set(id, nameTag);
    this.playerLabels.set(id, nameTag.nameText);

    return player;
  }

  private addShadow(
    id: string,
    x: number,
    y: number,
    _isLocal: boolean,
  ): Phaser.GameObjects.Ellipse {
    const shadow = this.scene.add.ellipse(x, y, 20, 8, 0x000000, 0.18);
    shadow.setName(`shadow_${id}`);
    shadow.setDepth(9000);
    return shadow;
  }

  private createNameTag(
    id: string,
    name: string,
    x: number,
    y: number,
    isLocal: boolean = false,
  ): NameTag {
    const container = this.scene.add.container(x, y);
    container.setDepth(25000);

    const tempText = this.scene.add.text(0, 0, name, {
      fontSize: "13px",
      fontFamily: "VT323, monospace",
    });
    const textWidth = tempText.width;
    tempText.destroy();

    const padding = { x: 8, y: 4 };
    const dotRadius = 4;
    const bgWidth = textWidth + padding.x * 2 + dotRadius * 2 + 8;
    const bgHeight = 16;
    const cornerRadius = 8;

    const background = this.scene.add.graphics();
    background.fillStyle(this.COLORS.background, this.COLORS.backgroundAlpha);
    background.fillRoundedRect(
      -bgWidth / 2,
      -bgHeight / 2,
      bgWidth,
      bgHeight,
      cornerRadius,
    );
    background.lineStyle(1, this.COLORS.border, 0.5);
    background.strokeRoundedRect(
      -bgWidth / 2,
      -bgHeight / 2,
      bgWidth,
      bgHeight,
      cornerRadius,
    );
    container.add(background);

    const statusDot = this.scene.add.graphics();
    const dotX = -bgWidth / 2 + padding.x + dotRadius;
    statusDot.fillStyle(this.COLORS.statusAvailable, 1);
    statusDot.fillCircle(dotX, 0, dotRadius);
    container.add(statusDot);

    const nameText = this.scene.add.text(dotX + dotRadius + 6, 0, name, {
      fontSize: "13px",
      fontFamily: "VT323, monospace",
      color: "#ffffff",
      resolution: 2,
      strokeThickness: 0,
    });
    nameText.setOrigin(0, 0.5);
    container.add(nameText);

    if (isLocal) {
      this.scene.tweens.add({
        targets: container,
        y: y - 2,
        duration: 1500,
        ease: "Sine.easeInOut",
        yoyo: true,
        repeat: -1,
      });
    }

    return { container, background, nameText, statusDot, width: bgWidth };
  }

  addPlayer(
    id: string,
    name: string,
    tileX: number,
    tileY: number,
    spriteKey: string = "Adam",
    status: PlayerStatus = "available",
    // Optional: server can now send pixel coords directly
    pixelX?: number,
    pixelY?: number,
  ) {
    if (this.players.has(id)) return;

    let x: number, y: number;
    if (pixelX !== undefined && pixelY !== undefined) {
      x = pixelX;
      y = pixelY;
    } else {
      const pixelPos = tileToPixel(tileX, tileY);
      x = pixelPos.x;
      y = pixelPos.y;
    }

    const validSprites = ["Adam", "Alex", "Amelia", "Bob"];
    const safeSpriteKey = validSprites.includes(spriteKey) ? spriteKey : "Adam";

    const container = this.scene.add.container(x, y);
    const sprite = this.scene.add.sprite(0, 0, `${safeSpriteKey}_idle`);
    sprite.setOrigin(0.5, 1.0);
    sprite.setData("spriteName", safeSpriteKey);
    sprite.setScale(2.0);

    const animKey = this.animationManager.getAnimationKey(
      safeSpriteKey,
      "idle",
      "down",
    );
    sprite.play(animKey);

    // Shadow under remote player
    const shadow = this.scene.add.ellipse(0, 0, 20, 8, 0x000000, 0.15);
    shadow.setDepth(-1);
    container.add(shadow);
    container.add(sprite);
    this.players.set(id, container);

    const nameTag = this.createNameTag(id, name, 0, -55, false);
    container.add(nameTag.container);
    nameTag.container.setPosition(0, -55);
    this.nameTags.set(id, nameTag);
    this.playerLabels.set(id, nameTag.nameText);

    // Depth layering: use Y position for correct overlap
    container.setDepth(10000 + y);

    this.scene.physics.world.enable(container);
    const body = container.body as Phaser.Physics.Arcade.Body;
    body.setSize(24, 24);
    body.setOffset(-12, -24);
    body.setImmovable(true);

    this.remotePlayersGroup.add(container);

    this.playerStates.set(id, {
      targetX: x,
      targetY: y,
      tileX,
      tileY,
      direction: "down",
      isMoving: false,
      lastUpdateTime: this.scene.time.now,
      status,
      velX: 0,
      velY: 0,
      lastX: x,
      lastY: y,
    });

    this.updatePlayerStatus(id, status);
  }

  getRemotePlayersGroup(): Phaser.GameObjects.Group {
    return this.remotePlayersGroup;
  }

  updateLocalPlayerPosition(tileX: number, tileY: number) {
    if (!this.localPlayer) return;
    const pixelPos = tileToPixel(tileX, tileY);
    this.localPlayer.setPosition(pixelPos.x, pixelPos.y);
    this.updateLocalPlayerNameTag(pixelPos.x, pixelPos.y);
  }

  updateLocalPlayerNameTag(pixelX: number, pixelY: number) {
    const nameTag = this.nameTags.get(this.playerId);
    if (nameTag) {
      nameTag.container.setPosition(pixelX, pixelY - 55);
    }
  }

  updatePlayerStatus(id: string, status: PlayerStatus) {
    const nameTag = this.nameTags.get(id);
    if (!nameTag) return;

    const state = this.playerStates.get(id);
    if (state) state.status = status;

    const statusColor =
      this.statusColorMap[status] || this.statusColorMap["available"];
    const bgWidth = nameTag.width || 80;
    const padding = { x: 8 };
    const dotRadius = 4;
    const dotX = -bgWidth / 2 + padding.x + dotRadius;

    nameTag.statusDot.clear();
    nameTag.statusDot.fillStyle(statusColor, 1);
    nameTag.statusDot.fillCircle(dotX, 0, dotRadius);

    if (status === "in_call") {
      this.scene.tweens.add({
        targets: nameTag.statusDot,
        alpha: 0.5,
        duration: 500,
        ease: "Sine.easeInOut",
        yoyo: true,
        repeat: -1,
      });
    } else {
      this.scene.tweens.killTweensOf(nameTag.statusDot);
      nameTag.statusDot.setAlpha(1);
    }
  }

  /**
   * Authoritative update – accepts PIXEL coords directly from server.
   * Falls back to tile-based calculation if pixel coords not available.
   */
  updatePlayerPosition(
    id: string,
    tileX: number,
    tileY: number,
    direction: Direction,
    pixelX?: number,
    pixelY?: number,
  ) {
    const state = this.playerStates.get(id);
    if (!state) return;

    const container = this.players.get(id);
    if (!container) return;

    let targetX: number, targetY: number;
    if (pixelX !== undefined && pixelY !== undefined) {
      targetX = pixelX;
      targetY = pixelY;
    } else {
      const pixelPos = tileToPixel(tileX, tileY);
      targetX = pixelPos.x;
      targetY = pixelPos.y;
    }

    const prevTargetX = state.targetX;
    const prevTargetY = state.targetY;

    state.tileX = tileX;
    state.tileY = tileY;
    state.targetX = targetX;
    state.targetY = targetY;
    state.direction = direction;
    state.lastX = prevTargetX;
    state.lastY = prevTargetY;
    // Estimate velocity for dead-reckoning
    const dt = this.scene.time.now - state.lastUpdateTime;
    if (dt > 0) {
      state.velX = (targetX - prevTargetX) / dt;
      state.velY = (targetY - prevTargetY) / dt;
    }
    state.lastUpdateTime = this.scene.time.now;
    state.isMoving = true;
  }

  update() {
    const now = this.scene.time.now;

    this.playerStates.forEach((state, id) => {
      const container = this.players.get(id);
      if (!container) return;

      const sprite = container.list.find(
        (obj) => obj instanceof Phaser.GameObjects.Sprite,
      ) as Phaser.GameObjects.Sprite | undefined;
      if (!sprite) return;

      const spriteName = sprite.getData("spriteName") || "Adam";

      const dx = state.targetX - container.x;
      const dy = state.targetY - container.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > SNAP_THRESHOLD) {
        // Too far apart – snap immediately to avoid rubber-banding
        container.setPosition(state.targetX, state.targetY);
        state.isMoving = false;
      } else if (distance > ARRIVED_THRESHOLD) {
        // Smooth interpolation
        container.x += dx * LERP;
        container.y += dy * LERP;
        state.isMoving = true;
      } else {
        container.setPosition(state.targetX, state.targetY);
        state.isMoving = false;
      }

      // Update Y-based depth so players behind others appear correct
      container.setDepth(10000 + container.y);

      // Animate
      const animState = state.isMoving ? "run" : "idle";
      const animKey = this.animationManager.getAnimationKey(
        spriteName,
        animState,
        state.direction,
      );
      if (sprite.anims.currentAnim?.key !== animKey) {
        sprite.play(animKey, true);
      }
    });
  }

  showEmote(playerId: string, emoji: string) {
    let container: Phaser.GameObjects.Container | Phaser.Physics.Arcade.Sprite | undefined;
    if (playerId === this.playerId) {
      container = this.localPlayer;
    } else {
      container = this.players.get(playerId);
    }
    if (!container) return;

    const x = container.x;
    const y = container.y - 70; // Start above head

    const text = this.scene.add.text(x, y, emoji, {
      fontSize: "28px",
      fontFamily: "system-ui",
      resolution: 2,
    });
    text.setOrigin(0.5, 0.5);
    text.setDepth(30000);

    // Glowing premium feel: shadow effect
    text.setShadow(0, 0, 'rgba(255,255,255,0.8)', 15, false, true);

    // Float up and fade out animation
    this.scene.tweens.add({
      targets: text,
      y: y - 50, // Float up by 50px
      alpha: { from: 1, to: 0 },
      scale: { from: 0.5, to: 1.5 },
      duration: 2500,
      ease: "Cubic.easeOut",
      onComplete: () => text.destroy(),
    });
  }

  removePlayer(id: string) {
    const container = this.players.get(id);
    if (container) {
      this.remotePlayersGroup.remove(container);
      container.destroy();
      this.players.delete(id);
    }

    const nameTag = this.nameTags.get(id);
    if (nameTag) {
      this.scene.tweens.killTweensOf(nameTag.container);
      this.scene.tweens.killTweensOf(nameTag.statusDot);
      if (!this.players.has(id)) {
        nameTag.container.destroy();
      }
      this.nameTags.delete(id);
    }

    this.playerLabels.delete(id);
    this.playerStates.delete(id);
  }

  getPlayers(): Map<string, Phaser.GameObjects.Container> {
    return this.players;
  }

  getPlayerLabels(): Map<string, Phaser.GameObjects.Text> {
    return this.playerLabels;
  }

  getNameTag(id: string): NameTag | undefined {
    return this.nameTags.get(id);
  }

  getPlayerList(): Array<{ id: string; name: string }> {
    const list: Array<{ id: string; name: string }> = [];
    this.nameTags.forEach((tag, id) => {
      list.push({ id, name: tag.nameText.text });
    });
    return list;
  }

  getPlayerStatus(id: string): PlayerStatus | undefined {
    const state = this.playerStates.get(id);
    return state?.status;
  }

  destroy() {
    this.players.forEach((container) => container.destroy());
    this.players.clear();
    this.nameTags.forEach((tag) => {
      this.scene.tweens.killTweensOf(tag.container);
      this.scene.tweens.killTweensOf(tag.statusDot);
    });
    this.nameTags.clear();
    this.playerLabels.clear();
    this.playerStates.clear();
  }
}
