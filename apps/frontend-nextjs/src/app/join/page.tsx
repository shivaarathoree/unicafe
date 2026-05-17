"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Users, Coffee, ArrowRight } from "lucide-react";

interface RoomInfo {
  id: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
  ownerId: string | null;
}

const CHARACTERS = [
  { id: "Adam",   emoji: "🧑" },
  { id: "Alex",   emoji: "👩" },
  { id: "Amelia", emoji: "👱‍♀️" },
  { id: "Bob",    emoji: "👨‍🦰" },
];

function JoinContent() {
  const searchParams = useSearchParams();
  const roomId = searchParams.get("roomId") || searchParams.get("code") || "";
  const router = useRouter();

  const [name, setName] = useState("");
  const [character, setCharacter] = useState("Adam");
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  // Pre-fill from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("cafeGuestName");
    if (saved) setName(saved);
    const savedChar = localStorage.getItem("cafeGuestCharacter");
    if (savedChar) setCharacter(savedChar);
  }, []);

  // Fetch room info — server pre-creates room if needed so invite links always work
  useEffect(() => {
    if (!roomId) { setError("No room ID found in link"); setLoading(false); return; }

    const BACKEND_URL = process.env.NEXT_PUBLIC_WS_URL || "";
    fetch(`${BACKEND_URL}/api/rooms/${roomId}`)
      .then(r => r.json())
      .then(data => {
        setRoomInfo({
          id: data.id,
          name: data.name || "Cafe Room",
          playerCount: data.playerCount || 0,
          maxPlayers: data.maxPlayers || 30,
          ownerId: data.ownerId || null,
        });
      })
      .catch(() => setError("Couldn't reach the server. Is it running?"))
      .finally(() => setLoading(false));
  }, [roomId]);

  const handleJoin = () => {
    if (!name.trim() || !roomInfo) return;
    setJoining(true);

    // Save preferences
    localStorage.setItem("cafeGuestName", name.trim());
    localStorage.setItem("cafeGuestCharacter", character);

    const userId = "guest_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
    router.push(`/room/${roomInfo.id}?name=${encodeURIComponent(name.trim())}&character=${character}&userId=${userId}`);
  };

  // Loading
  if (loading) return (
    <Wrapper>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, animation: "spin 2s linear infinite", display: "inline-block" }}>☕</div>
        <p style={subtitleStyle}>Finding your table...</p>
      </div>
    </Wrapper>
  );

  // Error
  if (error) return (
    <Wrapper>
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: 32 }}>😕</p>
        <p style={{ color: "#f87171", marginBottom: 16, fontFamily: "Inter, system-ui" }}>{error}</p>
        <button onClick={() => router.push("/rooms")} style={btnStyle(false)}>
          ← Browse rooms
        </button>
      </div>
    </Wrapper>
  );

  const isOwnerSlotFree = !roomInfo?.ownerId;

  return (
    <Wrapper>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ fontSize: 52, marginBottom: 8 }}>☕</div>
        <h1 style={{
          fontSize: 24, fontWeight: 700, color: "rgba(255,210,140,0.95)",
          fontFamily: "Inter, system-ui", margin: "0 0 6px"
        }}>
          {roomInfo?.name || "Cafe Room"}
        </h1>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <span style={pillStyle}>
            <Users size={13} />
            {roomInfo?.playerCount || 0} in cafe
          </span>
          <span style={{ ...pillStyle, background: isOwnerSlotFree ? "rgba(74,222,128,0.15)" : "rgba(251,191,36,0.15)", borderColor: isOwnerSlotFree ? "rgba(74,222,128,0.3)" : "rgba(251,191,36,0.3)", color: isOwnerSlotFree ? "#4ade80" : "#fbbf24" }}>
            <Coffee size={13} />
            {isOwnerSlotFree ? "Owner seat free" : "Owner present"}
          </span>
        </div>
        {isOwnerSlotFree && (
          <p style={{ fontSize: 11, color: "rgba(255,200,100,0.6)", fontFamily: "Inter", marginTop: 8 }}>
            🎵 First to join becomes the cafe owner — controls music & moves freely
          </p>
        )}
        {!isOwnerSlotFree && (
          <p style={{ fontSize: 11, color: "rgba(255,200,100,0.6)", fontFamily: "Inter", marginTop: 8 }}>
            🪑 You'll be seated at a table — chat and listen to the cafe vibes
          </p>
        )}
      </div>

      {/* Name input */}
      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>Your name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleJoin()}
          placeholder="Enter your name..."
          maxLength={30}
          autoFocus
          style={{
            width: "100%",
            background: "rgba(255,255,255,0.06)",
            border: "1.5px solid rgba(255,210,140,0.2)",
            borderRadius: 12,
            padding: "12px 16px",
            color: "rgba(255,210,140,0.95)",
            fontSize: 16,
            fontFamily: "Inter, system-ui",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Character pick */}
      <div style={{ marginBottom: 24 }}>
        <label style={labelStyle}>Pick your avatar</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {CHARACTERS.map(c => (
            <button
              key={c.id}
              onClick={() => setCharacter(c.id)}
              style={{
                background: character === c.id ? "rgba(255,210,140,0.18)" : "rgba(255,255,255,0.04)",
                border: `1.5px solid ${character === c.id ? "rgba(255,210,140,0.5)" : "rgba(255,210,140,0.1)"}`,
                borderRadius: 12,
                padding: "12px 8px",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                transition: "all 0.15s",
              }}
            >
              <span style={{ fontSize: 28 }}>{c.emoji}</span>
              <span style={{ fontSize: 11, color: "rgba(255,210,140,0.7)", fontFamily: "Inter" }}>{c.id}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Join button */}
      <button
        onClick={handleJoin}
        disabled={!name.trim() || joining}
        style={btnStyle(!name.trim() || joining)}
      >
        {joining ? "Entering cafe..." : (
          <span style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
            Enter Cafe <ArrowRight size={18} />
          </span>
        )}
      </button>
    </Wrapper>
  );
}

// ── Wrapper ─────────────────────────────────────────────────────────────────
function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: "100dvh",
      width: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, #1a0e06 0%, #2c1a0a 60%, #1a0e06 100%)",
      padding: 16,
      boxSizing: "border-box",
    }}>
      <div style={{
        width: "100%",
        maxWidth: 400,
        background: "rgba(30, 18, 8, 0.9)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(255,210,140,0.15)",
        borderRadius: 24,
        padding: "32px 28px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
      }}>
        {children}
      </div>
      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "rgba(255,210,140,0.6)",
  fontFamily: "Inter, system-ui",
  textTransform: "uppercase",
  letterSpacing: 1,
  marginBottom: 8,
};

const subtitleStyle: React.CSSProperties = {
  color: "rgba(255,210,140,0.6)",
  fontFamily: "Inter, system-ui",
  fontSize: 15,
  marginTop: 12,
};

const pillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "4px 10px",
  borderRadius: 20,
  fontSize: 12,
  fontFamily: "Inter, system-ui",
  background: "rgba(255,210,140,0.1)",
  border: "1px solid rgba(255,210,140,0.2)",
  color: "rgba(255,210,140,0.8)",
};

function btnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: "100%",
    padding: "14px 0",
    background: disabled ? "rgba(255,210,140,0.08)" : "rgba(255,210,140,0.18)",
    border: "1.5px solid rgba(255,210,140,0.25)",
    borderRadius: 14,
    color: disabled ? "rgba(255,210,140,0.3)" : "rgba(255,210,140,0.95)",
    fontSize: 16,
    fontWeight: 600,
    fontFamily: "Inter, system-ui",
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "all 0.15s",
    letterSpacing: 0.5,
  };
}

export default function JoinPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#1a0e06" }}>
        <div style={{ fontSize: 48, animation: "spin 2s linear infinite" }}>☕</div>
        <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
      </div>
    }>
      <JoinContent />
    </Suspense>
  );
}
