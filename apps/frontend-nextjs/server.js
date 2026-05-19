/**
 * SpatialMeet Cafe — Combined Next.js + Socket.io server
 *
 * Architecture:
 *  - FIRST player in a room = OWNER (moves freely, controls music)
 *  - ALL OTHER players = GUESTS (sit at reserved seats, watch/listen)
 *  - Music is synced to everyone in real-time
 *  - REST API endpoints for room lookup (so invite links work)
 *
 * Run: node server.js
 * No database, no Java, no external services needed.
 */

const { createServer } = require("http");
const { Server } = require("socket.io");
const { parse } = require("url");
const next = require("next");

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// ─── In-memory state ───────────────────────────────────────────────────────
const rooms = new Map();   // roomId → Room
const sockets = new Map(); // socketId → { roomId, playerId }

class Room {
  constructor(id, name) {
    this.id = id;
    this.name = name || "Cafe Room";
    this.createdAt = new Date().toISOString();
    this.lastActivityAt = new Date().toISOString();
    this.ownerId = null;       // first joiner becomes owner
    this.players = new Map();  // playerId → Player
    this.music = {
      playing: false,
      track: 0,
      mode: "lofi",       // "lofi" | "youtube" | "mp3"
      youtubeId: null,
      mp3Name: null,
      duration: 0,
      seekTime: 0,
      startedAt: null,
      controlledBy: null,
    };
    this.mp3Data = null;
    this.maxPlayers = 30;
  }

  get playerCount() { return this.players.size; }

  addPlayer(player) {
    if (!this.ownerId) {
      // First player = owner
      this.ownerId = player.id;
      player.role = "owner";
    } else {
      player.role = "guest";
    }
    this.players.set(player.id, player);
    this.lastActivityAt = new Date().toISOString();
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
    // If owner left, assign next player as owner
    if (this.ownerId === playerId && this.players.size > 0) {
      const nextPlayer = this.players.values().next().value;
      nextPlayer.role = "owner";
      this.ownerId = nextPlayer.id;
      return nextPlayer; // return new owner so we can notify
    }
    if (this.players.size === 0) this.ownerId = null;
    return null;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      playerCount: this.playerCount,
      maxPlayers: this.maxPlayers,
      isPublic: true,
      hasPassword: false,
      status: "ACTIVE",
      createdAt: this.createdAt,
      lastActivityAt: this.lastActivityAt,
      ownerId: this.ownerId,
    };
  }
}

class Player {
  constructor(id, name, character) {
    this.id = id;
    this.name = name || "Guest";
    this.character = character || "Adam";
    this.role = "guest"; // "owner" | "guest"
    // Spawn position — guests get assigned a seat; owner starts near door
    this.tileX = 11;
    this.tileY = 15;
    this.x = 11 * 32 + 16;
    this.y = 15 * 32 + 16;
    this.direction = "up";
    this.status = "available";
    this.seatIndex = -1; // for guests: which seat they occupy
  }

  toPublic() {
    return {
      id: this.id,
      name: this.name,
      sprite: this.character,
      role: this.role,
      tileX: this.tileX,
      tileY: this.tileY,
      x: this.x,
      y: this.y,
      direction: this.direction,
      status: this.status,
      seatIndex: this.seatIndex,
    };
  }
}

// GUEST_SEATS removed because all users can move freely

function getOrCreateRoom(roomId, name) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Room(roomId, name || "Cafe Room"));
  }
  return rooms.get(roomId);
}

function assignSeat(room) {
  return -1; // seats no longer assigned, everyone moves freely
}

// ─── Start server ──────────────────────────────────────────────────────────
app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    const { pathname } = parsedUrl;

    // ── REST API endpoints (so invite links and room lookup work) ──────────
    if (pathname.startsWith("/api/")) {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

      if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

      // GET /api/rooms  — list all rooms
      if (pathname === "/api/rooms" && req.method === "GET") {
        const list = Array.from(rooms.values()).map(r => r.toJSON());
        // Always include a default lobby
        if (list.length === 0) {
          list.push({ id: "lobby", name: "Main Cafe", playerCount: 0, maxPlayers: 30, isPublic: true, hasPassword: false, status: "ACTIVE" });
        }
        res.writeHead(200);
        res.end(JSON.stringify(list));
        return;
      }

      // POST /api/rooms  — create room
      if (pathname === "/api/rooms" && req.method === "POST") {
        let body = "";
        req.on("data", c => body += c);
        req.on("end", () => {
          try {
            const data = JSON.parse(body || "{}");
            const roomId = "room_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
            const room = getOrCreateRoom(roomId, data.name || "Cafe Room");
            res.writeHead(200);
            res.end(JSON.stringify(room.toJSON()));
          } catch {
            res.writeHead(400);
            res.end(JSON.stringify({ message: "Bad request" }));
          }
        });
        return;
      }

      // GET /api/rooms/:roomId  — room details (critical for invite links)
      const roomMatch = pathname.match(/^\/api\/rooms\/([^/]+)$/);
      if (roomMatch && req.method === "GET") {
        const roomId = roomMatch[1];
        // For invite links: pre-create the room if it doesn't exist yet
        // (owner will join shortly and become the real creator)
        const room = getOrCreateRoom(roomId, "Cafe Room");
        res.writeHead(200);
        res.end(JSON.stringify(room.toJSON()));
        return;
      }

      // POST /api/rooms/:roomId/upload-mp3 — Upload local MP3 file to memory
      const uploadMp3Match = pathname.match(/^\/api\/rooms\/([^/]+)\/upload-mp3$/);
      if (uploadMp3Match && req.method === "POST") {
        const roomId = uploadMp3Match[1];
        const room = getOrCreateRoom(roomId, "Cafe Room");
        const chunks = [];
        req.on("data", chunk => chunks.push(chunk));
        req.on("end", () => {
          room.mp3Data = Buffer.concat(chunks);
          res.writeHead(200);
          res.end(JSON.stringify({ success: true }));
        });
        return;
      }

      // GET /api/rooms/:roomId/stream-mp3 — Stream the uploaded MP3 from memory (supports HTTP range requests)
      const streamMp3Match = pathname.match(/^\/api\/rooms\/([^/]+)\/stream-mp3$/);
      if (streamMp3Match && req.method === "GET") {
        const roomId = streamMp3Match[1];
        const room = rooms.get(roomId);
        if (!room || !room.mp3Data) {
          res.writeHead(404);
          res.end(JSON.stringify({ message: "MP3 not found" }));
          return;
        }

        const totalLength = room.mp3Data.length;
        const range = req.headers.range;

        if (range) {
          const parts = range.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : totalLength - 1;

          if (start >= totalLength || end >= totalLength) {
            res.writeHead(416, { "Content-Range": `bytes */${totalLength}` });
            res.end();
            return;
          }

          const chunk = room.mp3Data.slice(start, end + 1);
          res.writeHead(206, {
            "Content-Range": `bytes ${start}-${end}/${totalLength}`,
            "Accept-Ranges": "bytes",
            "Content-Length": chunk.length,
            "Content-Type": "audio/mpeg",
          });
          res.end(chunk);
        } else {
          res.writeHead(200, {
            "Accept-Ranges": "bytes",
            "Content-Length": totalLength,
            "Content-Type": "audio/mpeg",
          });
          res.end(room.mp3Data);
        }
        return;
      }

      // POST /api/rooms/:roomId/join  — join room (returns userId)
      const joinMatch = pathname.match(/^\/api\/rooms\/([^/]+)\/join$/);
      if (joinMatch && req.method === "POST") {
        let body = "";
        req.on("data", c => body += c);
        req.on("end", () => {
          const roomId = joinMatch[1];
          const room = getOrCreateRoom(roomId, "Cafe Room");
          const userId = "guest_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, roomId, userId }));
        });
        return;
      }

      // POST /api/rooms/:roomId/leave
      const leaveMatch = pathname.match(/^\/api\/rooms\/([^/]+)\/leave$/);
      if (leaveMatch && req.method === "POST") {
        res.writeHead(200); res.end(JSON.stringify({ success: true })); return;
      }

      // GET /api/rooms/share/:code
      const shareMatch = pathname.match(/^\/api\/rooms\/share\/([^/]+)$/);
      if (shareMatch && req.method === "GET") {
        // For share codes, just redirect to the room with the code as ID
        const code = shareMatch[1];
        const room = getOrCreateRoom(code, "Cafe Room");
        res.writeHead(200); res.end(JSON.stringify(room.toJSON())); return;
      }

      // Auth stubs — guests don't need real auth
      if (pathname === "/api/auth/guest" && req.method === "POST") {
        const { displayName = "Guest", character = "Adam" } = parsedUrl.query;
        const userId = "guest_" + Date.now();
        res.writeHead(200);
        res.end(JSON.stringify({
          token: "guest_token_" + userId,
          userId,
          username: displayName,
          displayName,
          isGuest: true,
          status: "available",
        }));
        return;
      }
      if (pathname === "/api/auth/session") {
        res.writeHead(200); res.end(JSON.stringify({ valid: false, user: null })); return;
      }
      if (pathname === "/api/auth/validate") {
        res.writeHead(200); res.end(JSON.stringify(false)); return;
      }

      // Catch-all for other /api/* calls
      res.writeHead(200); res.end(JSON.stringify({ ok: true })); return;
    }

    // All other requests → Next.js
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    transports: ["websocket", "polling"],
  });

  io.on("connection", (socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    // ── JOIN ──────────────────────────────────────────────────────────────
    socket.on("join", (data) => {
      const { roomId, name, character, userId } = data;
      const room = getOrCreateRoom(roomId, "Cafe Room");

      const playerId = userId || "p_" + socket.id;
      const player = new Player(playerId, name, character);

      // Everyone gets a random spawn near the door
      room.addPlayer(player);
      const spawnZones = [
        { tileX: 25, tileY: 15 },
        { tileX: 26, tileY: 15 },
        { tileX: 27, tileY: 15 },
        { tileX: 25, tileY: 16 },
        { tileX: 26, tileY: 16 },
      ];
      const spawn = spawnZones[Math.floor(Math.random() * spawnZones.length)];
      player.tileX = spawn.tileX;
      player.tileY = spawn.tileY;
      player.x = spawn.tileX * 32 + 16;
      player.y = spawn.tileY * 32 + 16;

      sockets.set(socket.id, { roomId, playerId });
      socket.join(roomId);

      // Send current state to joiner
      const existingUsers = [];
      room.players.forEach((p, pid) => {
        if (pid !== playerId) existingUsers.push(p.toPublic());
      });

      socket.emit("space-joined", {
        playerId,
        role: player.role,
        tileX: player.tileX, tileY: player.tileY,
        x: player.x, y: player.y,
        sprite: player.character,
        existingUsers,
        music: { ...room.music, serverTime: Date.now() },
        ownerId: room.ownerId,
      });

      // Notify others
      socket.to(roomId).emit("user-join", {
        ...player.toPublic(),
        ownerId: room.ownerId,
      });

      console.log(`[Room ${roomId}] ${name} joined as ${player.role}. Players: ${room.playerCount}`);
    });

    // ── MOVE (owner only — server enforces this) ──────────────────────────
    socket.on("move", (data) => {
      const ctx = sockets.get(socket.id);
      if (!ctx) return;
      const { roomId, playerId } = ctx;
      const room = rooms.get(roomId);
      if (!room) return;
      const player = room.players.get(playerId);
      if (!player) return;

      // Anyone can move freely

      const { tileX, tileY, x, y, direction } = data;
      // Validate bounds based on new map size (55x25)
      if (tileX < 1 || tileX > 54 || tileY < 1 || tileY > 24) {
        socket.emit("movement-rejected", { x: player.x, y: player.y, tileX: player.tileX, tileY: player.tileY });
        return;
      }

      player.tileX = tileX; player.tileY = tileY;
      player.x = x || tileX*32+16; player.y = y || tileY*32+16;
      player.direction = direction || "down";

      socket.to(roomId).emit("movement", {
        id: playerId, tileX: player.tileX, tileY: player.tileY,
        x: player.x, y: player.y, direction: player.direction,
      });
    });

    // ── MUSIC CONTROL (owner only) ────────────────────────────────────────
    socket.on("music_control", (data) => {
      const ctx = sockets.get(socket.id);
      if (!ctx) return;
      const { roomId, playerId } = ctx;
      const room = rooms.get(roomId);
      if (!room) return;
      const player = room.players.get(playerId);
      if (!player || player.role !== "owner") {
        // Non-owners can't control music
        socket.emit("music_error", { message: "Only the cafe owner can control music" });
        return;
      }

      const { action, track } = data;
      const ms = room.music;

      if (action === "play") {
        ms.playing = true;
        ms.mode = ms.mode || "lofi";
        ms.track = track ?? ms.track;
        ms.seekTime = data.seekTime ?? ms.seekTime ?? 0;
        ms.startedAt = Date.now();
        ms.controlledBy = playerId;
      } else if (action === "pause") {
        if (ms.startedAt) ms.seekTime = (Date.now() - ms.startedAt) / 1000;
        ms.playing = false; ms.startedAt = null;
      } else if (action === "track_change") {
        ms.track = track ?? 0; ms.mode = "lofi";
        ms.seekTime = 0;
        ms.startedAt = ms.playing ? Date.now() : null;
      } else if (action === "youtube") {
        ms.mode = "youtube";
        ms.youtubeId = data.youtubeId;
        ms.playing = true;
        ms.startedAt = Date.now();
        ms.seekTime = 0;
        ms.controlledBy = playerId;
      } else if (action === "yt_state") {
        // Owner YT player changed — sync seek/state to guests
        ms.playing = data.ytState === "playing";
        ms.seekTime = data.seek || 0;
        ms.startedAt = ms.playing ? Date.now() : null;
      } else if (action === "mp3") {
        ms.mode = "mp3";
        ms.mp3Name = data.mp3Name;
        ms.duration = data.duration;
        ms.playing = true;
        ms.startedAt = Date.now();
        ms.seekTime = 0;
        ms.controlledBy = playerId;
      } else if (action === "seek") {
        ms.seekTime = data.seekTime;
        ms.startedAt = ms.playing ? Date.now() : null;
      }
      ms.controlledBy = playerId;

      // Broadcast music_state with youtubeUrl field for client
      io.to(roomId).emit("music_state", {
        ...ms,
        youtubeUrl: ms.mode === "youtube" ? ms.youtubeId : undefined,
        serverTime: Date.now(),
      });
    });

    // ── GROUP MEETING (owner starts, everyone joins) ──────────────────────
    socket.on("start_meeting", () => {
      const ctx = sockets.get(socket.id);
      if (!ctx) return;
      const { roomId, playerId } = ctx;
      const room = rooms.get(roomId);
      if (!room) return;
      const player = room.players.get(playerId);
      if (!player || player.role !== "owner") return;

      // Broadcast to ALL in room — guests see "Join Meeting" prompt
      io.to(roomId).emit("meeting_started", {
        byId: playerId,
        byName: player.name,
        participants: Array.from(room.players.values()).map(p => ({
          id: p.id, name: p.name, role: p.role,
        })),
      });
      console.log(`[Room ${roomId}] Meeting started by ${player.name}`);
    });

    socket.on("end_meeting", () => {
      const ctx = sockets.get(socket.id);
      if (!ctx) return;
      const { roomId, playerId } = ctx;
      const room = rooms.get(roomId);
      if (!room) return;
      const player = room.players.get(playerId);
      if (!player || player.role !== "owner") return;
      io.to(roomId).emit("meeting_ended", { byId: playerId });
      console.log(`[Room ${roomId}] Meeting ended by ${player.name}`);
    });

    socket.on("meeting_joined", () => {
      const ctx = sockets.get(socket.id);
      if (!ctx) return;
      const { roomId, playerId } = ctx;
      const room = rooms.get(roomId);
      const player = room?.players.get(playerId);
      if (!player) return;
      // Notify others that this person joined the meeting
      socket.to(roomId).emit("participant_joined_meeting", {
        id: playerId, name: player.name, role: player.role,
      });
    });

    // ── PRAISE (owner praises a guest) ────────────────────────────────────
    socket.on("praise_player", (data) => {
      const ctx = sockets.get(socket.id);
      if (!ctx) return;
      const { roomId, playerId } = ctx;
      const room = rooms.get(roomId);
      if (!room) return;
      const sender = room.players.get(playerId);
      if (!sender || sender.role !== "owner") return;

      const { targetId, praiseType, message } = data;
      // Broadcast praise to everyone in room
      io.to(roomId).emit("player_praised", {
        targetId,
        targetName: room.players.get(targetId)?.name || "Someone",
        praiseType,   // "brilliant" | "star" | "fire" | "wave"
        message,
        byName: sender.name,
      });
    });

    // ── CHAT ──────────────────────────────────────────────────────────────
    socket.on("chat", (data) => {
      const ctx = sockets.get(socket.id);
      if (!ctx) return;
      const { roomId, playerId } = ctx;
      const room = rooms.get(roomId);
      const player = room?.players.get(playerId);
      io.to(roomId).emit("chat", {
        ...data,
        senderId: playerId,
        senderName: player?.name || data.senderName || "Guest",
        timestamp: Date.now(),
      });
    });

    // ── STATUS ────────────────────────────────────────────────────────────
    socket.on("status_change", (data) => {
      const ctx = sockets.get(socket.id);
      if (!ctx) return;
      const { roomId, playerId } = ctx;
      const room = rooms.get(roomId);
      const player = room?.players.get(playerId);
      if (player) player.status = data.status;
      io.to(roomId).emit("status_changed", { id: playerId, status: data.status });
    });

    // ── WEBRTC SIGNALING ──────────────────────────────────────────────────
    socket.on("request_call", (data) => {
      const ctx = sockets.get(socket.id);
      if (!ctx) return;
      const { roomId, playerId } = ctx;
      const room = rooms.get(roomId);
      const caller = room?.players.get(playerId);
      socket.to(roomId).emit("incoming_call", {
        from: playerId,
        fromName: caller?.name || "Someone",
        callType: data.callType,
        to: data.to,
      });
    });

    socket.on("call_response", (data) => {
      const ctx = sockets.get(socket.id);
      if (!ctx) return;
      io.to(ctx.roomId).emit("call_response", data);
    });

    socket.on("webrtc_signal", (data) => {
      const ctx = sockets.get(socket.id);
      if (!ctx) return;
      io.to(ctx.roomId).emit("webrtc_signal", data);
    });

    socket.on("call_ended", (data) => {
      const ctx = sockets.get(socket.id);
      if (!ctx) return;
      io.to(ctx.roomId).emit("call_ended", data);
    });

    // ── DISCONNECT ────────────────────────────────────────────────────────
    socket.on("disconnect", () => {
      const ctx = sockets.get(socket.id);
      if (!ctx) return;
      const { roomId, playerId } = ctx;
      sockets.delete(socket.id);

      const room = rooms.get(roomId);
      if (!room) return;

      const newOwner = room.removePlayer(playerId);
      io.to(roomId).emit("user-left", { id: playerId });

      // If owner changed, notify everyone
      if (newOwner) {
        io.to(roomId).emit("owner-changed", { newOwnerId: newOwner.id, newOwnerName: newOwner.name });
        console.log(`[Room ${roomId}] Owner changed to ${newOwner.name}`);
      }

      // Clean up empty rooms
      if (room.playerCount === 0) rooms.delete(roomId);

      console.log(`[Room ${roomId}] ${playerId} left. Players: ${room?.playerCount ?? 0}`);
    });

    socket.on("ping", () => socket.emit("pong"));
  });

  httpServer.listen(port, hostname, () => {
    console.log(`\n☕ SpatialMeet Cafe ready → http://localhost:${port}`);
    console.log(`   Mode: ${dev ? "development" : "production"}`);
    console.log(`   Architecture: Owner moves + plays music | Guests sit & listen\n`);
  });
});
