import * as Phaser from "phaser";
import { AnimationManager, Direction } from "./AnimationManager";
import { WebSocketManager } from "./WebSocketManager";
import { TILE_SIZE, pixelToTile, isValidTile } from "./types";

const MOVEMENT_SPEED = 120; // pixels per second
const POSITION_UPDATE_INTERVAL = 50; // ms – 20Hz update rate for smoother sync
const STOP_THRESHOLD = 0.5; // pixels – minimum movement to consider "moving"
const EASING_FACTOR = 0.82; // momentum easing when stopping (0=instant, 1=never stop)

export class MovementManager {
  private scene: Phaser.Scene;
  private player: Phaser.Physics.Arcade.Sprite;
  private wasdKeys!: Record<string, Phaser.Input.Keyboard.Key>;
  private arrowKeys!: Phaser.Types.Input.Keyboard.CursorKeys;
  private animationManager: AnimationManager;
  private currentDirection: Direction = "down";
  private playerId: string;
  private wsManager: WebSocketManager;
  private isMobile: boolean;
  private joystickVelocity = { x: 0, y: 0 };
  private isMoving = false;
  private wasMoving = false; // Track transition for stop-event
  private lastPositionUpdate = 0;
  private collisionChecker?: (x: number, y: number) => boolean;
  
  // Velocity with momentum
  private currentVelX = 0;
  private currentVelY = 0;

  // Last sent position – used to avoid sending duplicate updates
  private lastSentX = -9999;
  private lastSentY = -9999;

  constructor(
    scene: Phaser.Scene,
    player: Phaser.Physics.Arcade.Sprite,
    animationManager: AnimationManager,
    playerId: string,
    wsManager: WebSocketManager,
    isMobile: boolean = false,
  ) {
    this.scene = scene;
    this.player = player;
    this.animationManager = animationManager;
    this.playerId = playerId;
    this.wsManager = wsManager;
    this.isMobile = isMobile;

    this.setupInput();
  }

  private setupInput() {
    if (!this.isMobile) {
      this.wasdKeys = this.scene.input.keyboard!.addKeys({
        W: Phaser.Input.Keyboard.KeyCodes.W,
        S: Phaser.Input.Keyboard.KeyCodes.S,
        A: Phaser.Input.Keyboard.KeyCodes.A,
        D: Phaser.Input.Keyboard.KeyCodes.D,
      }) as Record<string, Phaser.Input.Keyboard.Key>;
      this.arrowKeys = this.scene.input.keyboard!.createCursorKeys();
    }
  }

  update(delta: number): { moved: boolean; direction: Direction } {
    const now = this.scene.time.now;
    let moved = false;
    let newDirection: Direction = this.currentDirection;

    // --- Get raw input vector ---
    let inputX = 0;
    let inputY = 0;

    if (this.isMobile) {
      inputX = this.joystickVelocity.x;
      inputY = this.joystickVelocity.y;
    } else {
      const mv = this.getKeyboardMovementVector();
      inputX = mv.x;
      inputY = mv.y;
    }

    const hasInput = Math.abs(inputX) > 0.05 || Math.abs(inputY) > 0.05;

    if (hasInput) {
      // Normalize and scale
      const len = Math.sqrt(inputX * inputX + inputY * inputY);
      const nx = inputX / len;
      const ny = inputY / len;
      const targetVX = nx * MOVEMENT_SPEED;
      const targetVY = ny * MOVEMENT_SPEED;

      // Instant acceleration, ease into full speed
      this.currentVelX = Phaser.Math.Linear(this.currentVelX, targetVX, 0.25);
      this.currentVelY = Phaser.Math.Linear(this.currentVelY, targetVY, 0.25);

      newDirection = this.getDirectionFromVector(inputX, inputY);
    } else {
      // Apply easing/momentum when stopping
      this.currentVelX *= EASING_FACTOR;
      this.currentVelY *= EASING_FACTOR;

      if (
        Math.abs(this.currentVelX) < STOP_THRESHOLD &&
        Math.abs(this.currentVelY) < STOP_THRESHOLD
      ) {
        this.currentVelX = 0;
        this.currentVelY = 0;
      }
    }

    const actualVelX = (this.currentVelX * delta) / 1000;
    const actualVelY = (this.currentVelY * delta) / 1000;

    if (Math.abs(actualVelX) > 0.01 || Math.abs(actualVelY) > 0.01) {
      const newX = this.player.x + actualVelX;
      const newY = this.player.y + actualVelY;

      if (this.isValidPosition(newX, newY)) {
        this.player.setPosition(newX, newY);
        moved = true;
        this.isMoving = true;
      } else {
        // Try sliding along axes
        if (this.isValidPosition(newX, this.player.y)) {
          this.player.x = newX;
          moved = true;
          this.isMoving = true;
          this.currentVelY = 0;
        } else if (this.isValidPosition(this.player.x, newY)) {
          this.player.y = newY;
          moved = true;
          this.isMoving = true;
          this.currentVelX = 0;
        } else {
          this.currentVelX = 0;
          this.currentVelY = 0;
          this.isMoving = false;
        }
      }
    } else {
      this.isMoving = false;
    }

    // Update animation
    this.updateAnimation(newDirection);

    // Send position update at throttled rate
    // Send on EVERY frame if moving (not just when tile changes!)
    const posChanged =
      Math.abs(this.player.x - this.lastSentX) > 1 ||
      Math.abs(this.player.y - this.lastSentY) > 1;

    if (
      posChanged &&
      now - this.lastPositionUpdate > POSITION_UPDATE_INTERVAL
    ) {
      this.sendCurrentPosition(newDirection);
      this.lastPositionUpdate = now;
    } else if (
      this.wasMoving &&
      !this.isMoving &&
      now - this.lastPositionUpdate > 30
    ) {
      // Send a final "stopped" position immediately when movement ends
      this.sendCurrentPosition(newDirection);
      this.lastPositionUpdate = now;
    }

    this.wasMoving = this.isMoving;
    this.currentDirection = newDirection;
    return { moved, direction: newDirection };
  }

  private getKeyboardMovementVector(): { x: number; y: number } {
    let x = 0;
    let y = 0;

    if (this.wasdKeys?.W?.isDown || this.arrowKeys?.up?.isDown) y -= 1;
    if (this.wasdKeys?.S?.isDown || this.arrowKeys?.down?.isDown) y += 1;
    if (this.wasdKeys?.A?.isDown || this.arrowKeys?.left?.isDown) x -= 1;
    if (this.wasdKeys?.D?.isDown || this.arrowKeys?.right?.isDown) x += 1;

    return { x, y };
  }

  private isValidPosition(pixelX: number, pixelY: number): boolean {
    const tile = pixelToTile(pixelX, pixelY);
    if (!isValidTile(tile.tileX, tile.tileY)) {
      return false;
    }

    if (this.collisionChecker) {
      return !this.collisionChecker(pixelX, pixelY);
    }

    return true;
  }

  private getDirectionFromVector(x: number, y: number): Direction {
    if (x > 0 && y < 0) return "up-right";
    if (x < 0 && y < 0) return "up-left";
    if (x > 0 && y > 0) return "down-right";
    if (x < 0 && y > 0) return "down-left";
    if (x > 0) return "right";
    if (x < 0) return "left";
    if (y < 0) return "up";
    if (y > 0) return "down";
    return this.currentDirection;
  }

  private updateAnimation(direction: Direction) {
    const spriteName = this.player.getData("spriteName") || "Adam";
    const state = this.isMoving ? "run" : "idle";
    const animKey = this.animationManager.getAnimationKey(
      spriteName,
      state,
      direction,
    );

    if (this.player.anims.currentAnim?.key !== animKey) {
      this.player.play(animKey, true);
    }

    // Subtle bounce effect when running
    if (this.isMoving && !this.wasMoving) {
      // Started moving
      this.scene.tweens.killTweensOf(this.player, "scaleY");
    }
    if (!this.isMoving && this.wasMoving) {
      // Just stopped – tiny squish
      this.scene.tweens.add({
        targets: this.player,
        scaleY: { from: 1.9, to: 2.0 },
        scaleX: { from: 2.1, to: 2.0 },
        duration: 80,
        ease: "Bounce.easeOut",
      });
    }
  }

  /**
   * Sends PIXEL coordinates instead of tile coordinates.
   * This avoids the quantisation desync (multiple pixels map to same tile).
   */
  private sendCurrentPosition(direction: Direction) {
    this.lastSentX = this.player.x;
    this.lastSentY = this.player.y;
    // Also send tile coords for server-side collision/spawn validation
    const tilePos = pixelToTile(this.player.x, this.player.y);
    this.wsManager.send("move", {
      x: Math.round(this.player.x),
      y: Math.round(this.player.y),
      tileX: tilePos.tileX,
      tileY: tilePos.tileY,
      direction,
    });
  }

  setCollisionChecker(checker: (x: number, y: number) => boolean) {
    this.collisionChecker = checker;
  }

  setJoystickVelocity(vx: number, vy: number) {
    this.joystickVelocity.x = vx;
    this.joystickVelocity.y = vy;
  }

  getCurrentTile(): { x: number; y: number } {
    const tilePos = pixelToTile(this.player.x, this.player.y);
    return { x: tilePos.tileX, y: tilePos.tileY };
  }
}
