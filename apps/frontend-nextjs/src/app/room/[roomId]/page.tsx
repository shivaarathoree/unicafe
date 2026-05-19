"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { LogOut, Users, Link as LinkIcon, Check, MessageCircle } from "lucide-react";
import ChatPanel from "@/components/ChatPanel";
import ProximityOverlay from "@/components/ProximityOverlay";
import CallOverlay from "@/components/CallOverlay";
import MusicBar from "@/components/MusicBar";
import MeetingPanel from "@/components/MeetingPanel";
import PraiseSystem from "@/components/PraiseSystem";
import { WebSocketManager } from "@/lib/WebSocketManager";

const PhaserGame = dynamic(() => import("@/components/PhaserGame"), {
  ssr: false,
  loading: () => (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      width: "100dvw", height: "100dvh",
      background: "linear-gradient(135deg, #1a0e06 0%, #2c1a0a 100%)",
      flexDirection: "column", gap: 16,
    }}>
      <div style={{ fontSize: 52, animation: "spin 2s linear infinite" }}>☕</div>
      <p style={{ color: "rgba(255,210,140,0.7)", fontFamily: "Inter, system-ui", fontSize: 15 }}>
        Setting up your café...
      </p>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  ),
});

type Role = "owner" | "guest" | null;

export default function RoomPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const roomId   = params.roomId as string;
  const name     = searchParams.get("name") || "";
  const character = searchParams.get("character") || "Adam";
  const userId   = searchParams.get("userId") || "";

  const [mounted, setMounted] = useState(false);
  const [roomName, setRoomName] = useState("Café Room");
  const [copied, setCopied] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [participants, setParticipants] = useState<Array<{ id: string; name: string }>>([]);
  const [myRole, setMyRole] = useState<Role>(null);
  const [isWhiteboardOpen, setIsWhiteboardOpen] = useState(false);
  const wsManagerRef = useRef<WebSocketManager | null>(null);

  useEffect(() => {
    setMounted(true);
    if (!name || !character) { router.replace(`/join?roomId=${roomId}`); return; }
    const BACKEND_URL = process.env.NEXT_PUBLIC_WS_URL || "";
    fetch(`${BACKEND_URL}/api/rooms/${roomId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.name) setRoomName(d.name); })
      .catch(() => {});
  }, [name, character, roomId, router]);

  // Get the WS manager from the game (via window event)
  useEffect(() => {
    const onWsReady = (e: Event) => {
      wsManagerRef.current = (e as CustomEvent).detail as WebSocketManager;
    };
    window.addEventListener("wsManagerReady", onWsReady);
    return () => window.removeEventListener("wsManagerReady", onWsReady);
  }, []);

  // Game events
  useEffect(() => {
    const onOpenChat = () => setShowChat(true);
    const onPlayerList = (e: Event) => {
      const list = (e as CustomEvent).detail as Array<{ id: string; name: string }>;
      setParticipants(list);
    };
    const onRoleAssigned = (e: Event) => {
      setMyRole((e as CustomEvent).detail.role as Role);
    };
    const onOwnerChanged = (e: Event) => {
      const { newOwnerId } = (e as CustomEvent).detail;
      if (newOwnerId === userId) setMyRole("owner");
    };
    const onSendEmote = (e: Event) => {
      const { emoji } = (e as CustomEvent).detail;
      wsManagerRef.current?.send("chat", { message: emoji, isEmoji: true });
    };
    const onOpenWhiteboard = () => {
      setIsWhiteboardOpen(true);
    };
    window.addEventListener("openChat", onOpenChat);
    window.addEventListener("playerListUpdated", onPlayerList);
    window.addEventListener("localRoleAssigned", onRoleAssigned);
    window.addEventListener("ownerChanged", onOwnerChanged);
    window.addEventListener("sendEmote", onSendEmote);
    window.addEventListener("openWhiteboard", onOpenWhiteboard);
    return () => {
      window.removeEventListener("openChat", onOpenChat);
      window.removeEventListener("playerListUpdated", onPlayerList);
      window.removeEventListener("localRoleAssigned", onRoleAssigned);
      window.removeEventListener("ownerChanged", onOwnerChanged);
      window.removeEventListener("sendEmote", onSendEmote);
      window.removeEventListener("openWhiteboard", onOpenWhiteboard);
    };
  }, [userId]);

  // Invite copy
  const copyInvite = useCallback(async () => {
    const link = `${window.location.origin}/join?roomId=${roomId}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = link; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }, [roomId]);

  // Send signal via the game's WS manager
  const sendSignal = useCallback((event: string, data: object) => {
    wsManagerRef.current?.send(event, data as Record<string, unknown>);
  }, []);

  // Praise
  const handlePraise = useCallback((targetId: string, praiseType: string, message: string) => {
    sendSignal("praise_player", { targetId, praiseType, message });
  }, [sendSignal]);

  if (!mounted || !name) return null;

  const others = participants.filter(p => p.id !== userId);

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", background: "#1a0e06" }}>

      {/* ── Game canvas ── */}
      <PhaserGame name={name} roomId={roomId} character={character} userId={userId} />

      {/* ── Top-left: Room + role pill ── */}
      <div style={{
        position: "fixed", top: 12, left: 12, zIndex: 100,
        display: "flex", alignItems: "center", gap: 8,
        background: "rgba(20,12,4,0.88)", backdropFilter: "blur(14px)",
        borderRadius: 24, padding: "6px 14px 6px 10px",
        border: "1px solid rgba(255,210,140,0.15)",
        boxShadow: "0 2px 16px rgba(0,0,0,0.5)",
        maxWidth: "calc(55vw - 16px)",
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: "50%", background: "#4ade80",
          flexShrink: 0, boxShadow: "0 0 6px #4ade80",
          animation: "pulse 2s ease-in-out infinite",
        }} />
        <div style={{ overflow: "hidden" }}>
          <p style={{
            fontSize: 12, fontWeight: 600, color: "rgba(255,210,140,0.95)",
            fontFamily: "Inter, system-ui", margin: 0,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {roomName}
          </p>
          <p style={{ fontSize: 10, color: "rgba(255,210,140,0.5)", fontFamily: "Inter", margin: 0 }}>
            {name} {myRole === "owner" ? "☕" : "🪑"}
          </p>
        </div>
      </div>

      {/* ── Top-right: Action buttons ── */}
      <div style={{ position: "fixed", top: 12, right: 12, zIndex: 100, display: "flex", gap: 8 }}>
        {/* Participants */}
        <button onClick={() => setShowParticipants(v => !v)} style={topBtn(showParticipants)} title="Participants">
          <Users size={16} />
          {others.length > 0 && (
            <span style={{
              position: "absolute", top: -4, right: -4,
              background: "#fbbf24", color: "#000", borderRadius: "50%",
              width: 14, height: 14, fontSize: 9,
              display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700,
            }}>{others.length}</span>
          )}
        </button>

        {/* Chat */}
        <button onClick={() => setShowChat(v => !v)} style={topBtn(showChat)} title="Chat">
          <MessageCircle size={16} />
        </button>

        {/* Invite */}
        <button onClick={copyInvite} style={{
          ...topBtn(false),
          background: copied ? "rgba(74,222,128,0.2)" : "rgba(251,191,36,0.12)",
          borderColor: copied ? "rgba(74,222,128,0.4)" : "rgba(251,191,36,0.25)",
        }} title="Copy invite link">
          {copied ? <Check size={15} color="#4ade80" /> : <LinkIcon size={15} />}
        </button>

        {/* Leave */}
        <button onClick={() => router.replace("/rooms")} style={{
          ...topBtn(false),
          background: "rgba(239,68,68,0.12)", borderColor: "rgba(239,68,68,0.3)",
        }} title="Leave">
          <LogOut size={15} color="rgba(239,68,68,0.85)" />
        </button>
      </div>

      {/* ── Participants panel ── */}
      {showParticipants && (
        <div style={{
          position: "fixed", top: 56, right: 12, zIndex: 101,
          background: "rgba(20,12,4,0.97)", backdropFilter: "blur(16px)",
          border: "1px solid rgba(255,210,140,0.15)",
          borderRadius: 16, padding: "16px 16px 12px", width: 220,
          boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,210,140,0.5)", fontFamily: "Inter", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: 1 }}>
            In the café
          </p>
          {/* Self */}
          <ParticipantRow name={name} role={myRole || "guest"} isMe />
          {/* Others */}
          {others.map(p => (
            <ParticipantRow key={p.id} name={p.name} role="guest" />
          ))}
          {others.length === 0 && (
            <p style={{ fontSize: 11, color: "rgba(255,210,140,0.3)", fontFamily: "Inter", margin: "8px 0 0" }}>
              Share the invite link to bring people in ☕
            </p>
          )}

          {/* Invite CTA */}
          <button onClick={copyInvite} style={{
            width: "100%", marginTop: 12,
            padding: "9px 0",
            background: "rgba(251,191,36,0.1)",
            border: "1px solid rgba(251,191,36,0.2)",
            borderRadius: 10, cursor: "pointer",
            color: "rgba(251,191,36,0.8)", fontSize: 12, fontFamily: "Inter",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
            {copied ? <Check size={13} color="#4ade80" /> : <LinkIcon size={13} />}
            {copied ? "Copied!" : "Copy invite link"}
          </button>
        </div>
      )}

      {/* ── Music bar ── */}
      <MusicBar myRole={myRole} />

      {/* ── Meeting panel (handles start/join/video grid) ── */}
      <MeetingPanel
        myId={userId}
        myName={name}
        myRole={myRole}
        onSendSignal={sendSignal}
      />

      {/* ── Praise system ── */}
      <PraiseSystem
        myId={userId}
        myRole={myRole}
        participants={participants}
        onPraise={handlePraise}
      />

      {/* ── Overlays ── */}
      <ProximityOverlay />
      <CallOverlay />

      {/* ── Chat panel ── */}
      <ChatPanel
        isOpen={showChat}
        onClose={() => setShowChat(false)}
        playerId={userId}
        playerName={name}
      />

      {/* ── Guest hint banner (one-time) ── */}
      {myRole === "guest" && (
        <div style={{
          position: "fixed", bottom: 130, left: "50%",
          transform: "translateX(-50%)",
          zIndex: 150, pointerEvents: "none",
          background: "rgba(20,12,4,0.8)", backdropFilter: "blur(10px)",
          border: "1px solid rgba(255,210,140,0.12)",
          borderRadius: 20, padding: "8px 16px",
          display: "flex", alignItems: "center", gap: 8,
          whiteSpace: "nowrap",
        }}>
          <span style={{ fontSize: 14 }}>🪑</span>
          <span style={{ fontSize: 12, color: "rgba(255,210,140,0.6)", fontFamily: "Inter" }}>
            You're seated · waiting for the owner to start the meeting
          </span>
        </div>
      )}

      {/* ── UniDraw Collaboration Whiteboard Modal ── */}
      {isWhiteboardOpen && (
        <div style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.75)",
          backdropFilter: "blur(8px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 99999,
          padding: 24
        }}>
          <div style={{
            background: "rgba(20, 15, 10, 0.95)",
            border: "1.5px solid rgba(255, 210, 140, 0.2)",
            borderRadius: 20,
            width: "90vw",
            height: "85vh",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 24px 64px rgba(0,0,0,0.8)",
            overflow: "hidden"
          }}>
            {/* Header */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "16px 24px",
              borderBottom: "1px solid rgba(255, 210, 140, 0.1)",
              background: "rgba(30, 22, 15, 0.5)"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20 }}>🎨</span>
                <h3 style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: "#ffda8c",
                  fontFamily: "Inter, system-ui",
                  margin: 0
                }}>
                  UniDraw Whiteboard
                </h3>
                <span style={{
                  fontSize: 10,
                  color: "rgba(255, 210, 140, 0.5)",
                  background: "rgba(255, 210, 140, 0.08)",
                  padding: "2px 8px",
                  borderRadius: 12,
                  fontFamily: "Inter"
                }}>
                  Collaborative
                </span>
              </div>
              <button
                onClick={() => setIsWhiteboardOpen(false)}
                style={{
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  borderRadius: 10,
                  color: "#ef4444",
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "6px 14px",
                  cursor: "pointer",
                  fontFamily: "Inter",
                  transition: "all 0.15s"
                }}
              >
                Close Board
              </button>
            </div>
            {/* Iframe */}
            <div style={{ flex: 1, width: "100%", height: "100%", background: "#fff" }}>
              <iframe
                src="https://unidraw.unisoul.store/"
                style={{ width: "100%", height: "100%", border: "none" }}
                allow="clipboard-read; clipboard-write; display-capture"
              />
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </div>
  );
}

// ── Small helpers ──────────────────────────────────────────────────────────
function topBtn(active: boolean): React.CSSProperties {
  return {
    position: "relative",
    background: active ? "rgba(255,210,140,0.18)" : "rgba(20,12,4,0.88)",
    backdropFilter: "blur(12px)",
    border: `1px solid ${active ? "rgba(255,210,140,0.4)" : "rgba(255,210,140,0.15)"}`,
    borderRadius: 12, width: 36, height: 36,
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", color: "rgba(255,210,140,0.9)",
    boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
    transition: "all 0.15s",
  };
}

function ParticipantRow({ name, role, isMe }: { name: string; role: string; isMe?: boolean }) {
  const color = role === "owner" ? "#fbbf24" : "#818cf8";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "5px 0", borderBottom: "1px solid rgba(255,210,140,0.06)",
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: "50%",
        background: color + "22", border: `1.5px solid ${color}44`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, fontWeight: 700, color, fontFamily: "Inter", flexShrink: 0,
      }}>
        {name.charAt(0).toUpperCase()}
      </div>
      <div>
        <p style={{ fontSize: 12, color: "rgba(255,210,140,0.85)", fontFamily: "Inter", margin: 0 }}>
          {name}{isMe ? " (you)" : ""}
        </p>
        <p style={{ fontSize: 10, color: "rgba(255,210,140,0.35)", fontFamily: "Inter", margin: 0 }}>
          {role === "owner" ? "☕ owner" : "🪑 guest"}
        </p>
      </div>
    </div>
  );
}
