import * as Phaser from "phaser";
import { WebSocketManager, WebSocketMessage } from "./WebSocketManager";
import { PlayerManager } from "./PlayerManager";
import { ProximityManager } from "./ProximityManager";
import { CallManager } from "./CallManager";
import { AnimationManager, Direction } from "./AnimationManager";
import { tileToPixel, TILE_SIZE } from "./types";
import type { PlayerStatus } from "./types";

export class MessageHandler {
  private scene: Phaser.Scene;
  private wsManager: WebSocketManager;
  private playerManager: PlayerManager;
  private proximityManager: ProximityManager;
  private callManager: CallManager;
  private animationManager: AnimationManager;
  private playerId: string;
  private sceneReady: boolean = false;
  private player!: Phaser.Physics.Arcade.Sprite;

  constructor(
    scene: Phaser.Scene,
    wsManager: WebSocketManager,
    playerManager: PlayerManager,
    proximityManager: ProximityManager,
    callManager: CallManager,
    animationManager: AnimationManager,
    playerId: string,
    player: Phaser.Physics.Arcade.Sprite,
  ) {
    this.scene = scene;
    this.wsManager = wsManager;
    this.playerManager = playerManager;
    this.proximityManager = proximityManager;
    this.callManager = callManager;
    this.animationManager = animationManager;
    this.playerId = playerId;
    this.player = player;
  }

  setSceneReady(ready: boolean) {
    this.sceneReady = ready;
  }

  handleMessage(msg: WebSocketMessage) {
    if (!this.sceneReady) return;

    switch (msg.type) {
      case "space-joined":
        this.handleSpaceJoined(msg.data);
        break;
      case "movement-rejected":
        this.handleMovementRejected(msg.data);
        break;
      case "movement":
        this.handleMovement(msg.data);
        break;
      case "movements_batch":
        this.handleMovementsBatch(msg.data);
        break;
      case "user-left":
        this.handleUserLeft(msg.data);
        break;
      case "user-join":
        this.handleUserJoin(msg.data);
        break;
      case "incoming_call":
        this.callManager.handleIncomingCall(msg.data);
        break;
      case "call_response":
        this.callManager.handleCallResponse(msg.data);
        break;
      case "webrtc_signal":
        this.callManager.handleWebRTCSignal(msg.data);
        window.dispatchEvent(new CustomEvent("wsMessage_webrtc_signal", { detail: msg }));
        break;
      case "call_ended":
        this.callManager.handleCallEnded(msg.data);
        break;
      case "chat":
        this.handleChat(msg.data);
        break;
      case "status_changed":
        this.handleStatusChanged(msg.data);
        break;
      case "owner-changed":
        this.handleOwnerChanged(msg.data);
        break;
      case "meeting_started":
        window.dispatchEvent(new CustomEvent("meetingStarted", { detail: msg.data }));
        break;
      case "meeting_ended":
        window.dispatchEvent(new CustomEvent("meetingEnded", { detail: msg.data }));
        break;
      case "participant_joined_meeting":
        window.dispatchEvent(new CustomEvent("participantJoinedMeeting", { detail: msg.data }));
        break;
      case "player_praised":
        window.dispatchEvent(new CustomEvent("playerPraised", { detail: msg.data }));
        break;
      case "music_state":
        window.dispatchEvent(new CustomEvent("musicStateChanged", { detail: msg.data }));
        break;
    }
  }

  private handleChat(data: Record<string, unknown>) {
    window.dispatchEvent(new CustomEvent("chatMessage", { detail: data }));
  }

  private handleSpaceJoined(data: Record<string, unknown>) {
    if (!this.player) return;

    const spawnTileX = data.tileX as number;
    const spawnTileY = data.tileY as number;
    const sprite = data.sprite as string;
    const existingUsers = data.existingUsers as Array<{
      id: string;
      name: string;
      tileX: number;
      tileY: number;
      x?: number;
      y?: number;
      sprite: string;
      status?: PlayerStatus;
    }>;

    const spawnPos = tileToPixel(spawnTileX, spawnTileY);
    this.player.setPosition(spawnPos.x, spawnPos.y);

    if (sprite) {
      const validSprites = ["Adam", "Alex", "Amelia", "Bob"];
      const spriteName = validSprites.includes(sprite) ? sprite : "Adam";
      this.player.setData("spriteName", spriteName);
      this.player.play(
        this.animationManager.getAnimationKey(spriteName, "idle", "down"),
      );
    }

    // Dispatch role + player position to React UI
    window.dispatchEvent(new CustomEvent("localRoleAssigned", {
      detail: { role: data.role, ownerId: data.ownerId, playerId: this.playerId },
    }));

    // Dispatch initial music state if present
    if (data.music) {
      window.dispatchEvent(new CustomEvent("musicStateChanged", { detail: data.music }));
    }

    existingUsers.forEach((user) => {
      this.playerManager.addPlayer(
        user.id,
        user.name,
        user.tileX,
        user.tileY,
        user.sprite,
        user.status || "available",
        user.x,
        user.y,
      );
    });
    this.dispatchPlayerList();
  }

  private handleMovementRejected(data: Record<string, unknown>) {
    const tileX = data.tileX as number;
    const tileY = data.tileY as number;
    // Also handle pixel coords if provided
    const x = data.x as number | undefined;
    const y = data.y as number | undefined;

    if (this.player) {
      let targetX: number, targetY: number;
      if (x !== undefined && y !== undefined) {
        targetX = x;
        targetY = y;
      } else {
        const targetPos = tileToPixel(tileX, tileY);
        targetX = targetPos.x;
        targetY = targetPos.y;
      }
      // Snap back to authoritative position
      this.scene.tweens.add({
        targets: this.player,
        x: targetX,
        y: targetY,
        duration: 120,
        ease: "Power2",
      });
    }
  }

  private handleMovement(data: Record<string, unknown>) {
    const { id, tileX, tileY, direction, x, y } = data as {
      id: string;
      tileX: number;
      tileY: number;
      direction: string;
      x?: number;
      y?: number;
    };
    if (id !== this.playerId) {
      this.playerManager.updatePlayerPosition(
        id,
        tileX,
        tileY,
        direction as Direction,
        x,
        y,
      );
    }
  }

  private handleMovementsBatch(data: Record<string, unknown>) {
    const movements = data.movements as Array<{
      id: string;
      tileX: number;
      tileY: number;
      direction: string;
      x?: number;
      y?: number;
    }>;
    if (!movements) return;

    for (const movement of movements) {
      if (movement.id !== this.playerId) {
        this.playerManager.updatePlayerPosition(
          movement.id,
          movement.tileX,
          movement.tileY,
          movement.direction as Direction,
          movement.x,
          movement.y,
        );
      }
    }
  }

  private handleUserLeft(data: Record<string, unknown>) {
    const { id } = data as { id: string };
    this.playerManager.removePlayer(id);
    this.proximityManager.destroyProximityCard(id);
    this.callManager.endCall(id, "user_left");
    this.dispatchPlayerList();
  }

  private handleUserJoin(data: Record<string, unknown>) {
    const { id, name, tileX, tileY, sprite, status, x, y } = data as {
      id: string;
      name: string;
      tileX: number;
      tileY: number;
      sprite: string;
      status?: PlayerStatus;
      x?: number;
      y?: number;
    };
    this.playerManager.addPlayer(
      id,
      name,
      tileX,
      tileY,
      sprite,
      status || "available",
      x,
      y,
    );
    this.dispatchPlayerList();
  }

  private handleStatusChanged(data: Record<string, unknown>) {
    const { id, status } = data as { id: string; status: PlayerStatus };
    this.playerManager.updatePlayerStatus(id, status);

    window.dispatchEvent(
      new CustomEvent("playerStatusChanged", {
        detail: { id, status },
      }),
    );
  }

  private handleOwnerChanged(data: Record<string, unknown>) {
    const { newOwnerId, newOwnerName } = data as { newOwnerId: string; newOwnerName: string };
    window.dispatchEvent(new CustomEvent("ownerChanged", {
      detail: { newOwnerId, newOwnerName },
    }));
  }

  private dispatchPlayerList() {
    const players = this.playerManager.getPlayerList();
    window.dispatchEvent(
      new CustomEvent("playerListUpdated", { detail: players }),
    );
  }
}
