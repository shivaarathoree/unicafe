import { io, Socket } from "socket.io-client";

export interface WebSocketMessage {
  type: string;
  data: Record<string, unknown>;
}

/**
 * Wraps socket.io-client with the same interface as the old WebSocketManager
 * so all other files work unchanged.
 */
export class WebSocketManager {
  private socket: Socket | null = null;
  private playerId: string;
  private name: string;
  private character: string;
  private onMessageCallback?: (msg: WebSocketMessage) => void;
  private roomId: string = "";
  private spawnTilePos?: { tileX: number; tileY: number };
  private connected = false;

  constructor(playerId: string, name: string, character: string) {
    this.playerId = playerId;
    this.name = name;
    this.character = character;
  }

  setOnMessage(callback: (msg: WebSocketMessage) => void) {
    this.onMessageCallback = callback;
  }

  connect(url: string, spawnTilePos?: { tileX: number; tileY: number }) {
    // url looks like ws://localhost:3000/ws/{roomId}
    // Extract roomId and use Socket.io instead
    const parts = url.split("/");
    this.roomId = parts[parts.length - 1];
    this.spawnTilePos = spawnTilePos;

    // Connect to same origin (server.js handles both Next.js and Socket.io)
    const serverOrigin =
      process.env.NEXT_PUBLIC_WS_URL ||
      (typeof window !== "undefined"
        ? window.location.origin
        : "http://localhost:3000");

    this.socket = io(serverOrigin, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.socket.on("connect", () => {
      this.connected = true;
      // Emit join event
      this.socket!.emit("join", {
        roomId: this.roomId,
        name: this.name,
        character: this.character,
        tileX: spawnTilePos?.tileX,
        tileY: spawnTilePos?.tileY,
        userId: this.playerId,
      });
    });

    this.socket.on("disconnect", () => {
      this.connected = false;
    });

    // Forward all server events to the message callback
    const events = [
      "space-joined", "user-join", "user-left",
      "movement", "movements_batch", "movement-rejected",
      "chat", "status_changed",
      "incoming_call", "call_response", "webrtc_signal", "call_ended",
      "music_state", "music_error",
      "meeting_started", "meeting_ended", "participant_joined_meeting",
      "player_praised",
      "owner-changed",
      "pong",
    ];

    events.forEach((event) => {
      this.socket!.on(event, (data: Record<string, unknown>) => {
        if (this.onMessageCallback) {
          // Map socket.io event name to old message format
          this.onMessageCallback({ type: event, data: data || {} });
        }
      });
    });
  }

  send(type: string, data: Record<string, unknown>) {
    if (!this.socket) return;

    // Map old-style types to socket.io events
    const eventMap: Record<string, string> = {
      join: "join",
      move: "move",
      chat: "chat",
      status_change: "status_change",
      request_call: "request_call",
      call_response: "call_response",
      webrtc_signal: "webrtc_signal",
      call_ended: "call_ended",
      music_control: "music_control",
      ping: "ping",
    };

    const event = eventMap[type] || type;
    this.socket.emit(event, data);
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected && this.socket?.connected === true;
  }
}
