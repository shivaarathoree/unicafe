"use client";

import { useEffect, useState, useCallback } from "react";

const PRAISE_TYPES = [
  { id: "brilliant", emoji: "🏆", label: "Brilliant!", color: "#fbbf24" },
  { id: "star",      emoji: "⭐", label: "Rising Star", color: "#a78bfa" },
  { id: "fire",      emoji: "🔥", label: "On Fire!",   color: "#f97316" },
  { id: "heart",     emoji: "❤️", label: "Amazing!",   color: "#f43f5e" },
  { id: "clap",      emoji: "👏", label: "Well Done!",  color: "#34d399" },
];

interface PraiseNotif {
  id: string;
  targetName: string;
  praiseType: string;
  message: string;
  byName: string;
  ts: number;
}

interface PraiseSystemProps {
  myId: string;
  myRole: "owner" | "guest" | null;
  participants: Array<{ id: string; name: string }>;
  onPraise: (targetId: string, praiseType: string, message: string) => void;
}

export default function PraiseSystem({ myId, myRole, participants, onPraise }: PraiseSystemProps) {
  const [notifications, setNotifications] = useState<PraiseNotif[]>([]);
  const [showPicker, setShowPicker] = useState<string | null>(null); // targetId
  const [customMsg, setCustomMsg] = useState("");
  const [selectedType, setSelectedType] = useState("star");

  // Listen for praise events
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail as {
        targetId: string; targetName: string;
        praiseType: string; message: string; byName: string;
      };
      const notif: PraiseNotif = { ...d, id: Math.random().toString(36).slice(2), ts: Date.now() };
      setNotifications(prev => [notif, ...prev.slice(0, 3)]);
      // Auto-remove after 5s
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== notif.id));
      }, 5000);
    };
    window.addEventListener("playerPraised", handler);
    return () => window.removeEventListener("playerPraised", handler);
  }, []);

  const sendPraise = useCallback(() => {
    if (!showPicker) return;
    onPraise(showPicker, selectedType, customMsg || PRAISE_TYPES.find(p => p.id === selectedType)?.label || "");
    setShowPicker(null);
    setCustomMsg("");
  }, [showPicker, selectedType, customMsg, onPraise]);

  const pt = PRAISE_TYPES.find(p => p.id === selectedType) || PRAISE_TYPES[0];

  return (
    <>
      {/* ── Praise picker modal (owner only) ── */}
      {myRole === "owner" && showPicker && (
        <div style={{
          position: "fixed",
          top: "50%", left: "50%",
          transform: "translate(-50%,-50%)",
          zIndex: 600,
          background: "rgba(20,12,4,0.98)",
          border: "1.5px solid rgba(255,210,140,0.25)",
          borderRadius: 20,
          padding: "24px 24px 20px",
          width: 280,
          maxWidth: "90vw",
          boxShadow: "0 20px 60px rgba(0,0,0,0.8)",
          backdropFilter: "blur(20px)",
          animation: "fadeInScale 0.25s ease",
        }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,210,140,0.95)", fontFamily: "Inter", margin: "0 0 4px" }}>
            ✨ Praise a student
          </p>
          <p style={{ fontSize: 12, color: "rgba(255,210,140,0.4)", fontFamily: "Inter", margin: "0 0 16px" }}>
            {participants.find(p => p.id === showPicker)?.name || "Guest"}
          </p>

          {/* Type selector */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {PRAISE_TYPES.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedType(p.id)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 20,
                  border: `1.5px solid ${selectedType === p.id ? p.color + "80" : "rgba(255,210,140,0.1)"}`,
                  background: selectedType === p.id ? p.color + "20" : "transparent",
                  cursor: "pointer",
                  fontSize: 13,
                  color: selectedType === p.id ? p.color : "rgba(255,210,140,0.5)",
                  fontFamily: "Inter",
                  transition: "all 0.15s",
                }}
              >
                {p.emoji} {p.label}
              </button>
            ))}
          </div>

          {/* Custom message */}
          <input
            type="text"
            placeholder={`Add a note... (optional)`}
            value={customMsg}
            onChange={e => setCustomMsg(e.target.value)}
            maxLength={80}
            style={{
              width: "100%",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,210,140,0.15)",
              borderRadius: 10,
              padding: "10px 12px",
              color: "rgba(255,210,140,0.85)",
              fontSize: 13,
              fontFamily: "Inter",
              outline: "none",
              boxSizing: "border-box",
              marginBottom: 14,
            }}
          />

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={sendPraise}
              style={{
                flex: 1,
                padding: "11px 0",
                background: pt.color + "25",
                border: `1.5px solid ${pt.color}50`,
                borderRadius: 12,
                cursor: "pointer",
                color: pt.color,
                fontSize: 14,
                fontWeight: 600,
                fontFamily: "Inter",
              }}
            >
              {pt.emoji} Send Praise
            </button>
            <button
              onClick={() => setShowPicker(null)}
              style={{
                padding: "11px 14px",
                background: "transparent",
                border: "1px solid rgba(255,210,140,0.15)",
                borderRadius: 12,
                cursor: "pointer",
                color: "rgba(255,210,140,0.4)",
                fontSize: 14,
                fontFamily: "Inter",
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ── Praise button next to each participant (owner only, in participants panel) ── */}
      {myRole === "owner" && participants.filter(p => p.id !== myId).length > 0 && (
        <div style={{
          position: "fixed",
          bottom: 130,
          right: 12,
          zIndex: 200,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          alignItems: "flex-end",
        }}>
          {participants.filter(p => p.id !== myId).slice(0, 5).map(p => (
            <button
              key={p.id}
              onClick={() => setShowPicker(p.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                background: "rgba(20,12,4,0.88)",
                border: "1px solid rgba(255,210,140,0.2)",
                borderRadius: 20,
                cursor: "pointer",
                color: "rgba(255,210,140,0.8)",
                fontSize: 12,
                fontFamily: "Inter",
                backdropFilter: "blur(10px)",
                boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
                transition: "all 0.15s",
                maxWidth: 140,
              }}
            >
              <span style={{ fontSize: 14 }}>✨</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                Praise {p.name}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── Praise notifications (everyone sees these) ── */}
      <div style={{
        position: "fixed",
        top: 70,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 400,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        alignItems: "center",
        pointerEvents: "none",
      }}>
        {notifications.map(n => {
          const praise = PRAISE_TYPES.find(p => p.id === n.praiseType) || PRAISE_TYPES[1];
          return (
            <div
              key={n.id}
              style={{
                background: "rgba(20,12,4,0.95)",
                border: `1.5px solid ${praise.color}50`,
                borderRadius: 20,
                padding: "10px 18px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                boxShadow: `0 4px 24px rgba(0,0,0,0.6), 0 0 20px ${praise.color}20`,
                animation: "praiseSlideIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
                backdropFilter: "blur(16px)",
                maxWidth: "80vw",
              }}
            >
              <span style={{ fontSize: 22 }}>{praise.emoji}</span>
              <div>
                <span style={{ fontSize: 13, fontWeight: 700, color: praise.color, fontFamily: "Inter" }}>
                  {n.targetName}
                </span>
                <span style={{ fontSize: 13, color: "rgba(255,210,140,0.7)", fontFamily: "Inter" }}>
                  {" "}was praised — {n.message || praise.label}
                </span>
                <span style={{ fontSize: 11, color: "rgba(255,210,140,0.4)", fontFamily: "Inter", marginLeft: 4 }}>
                  by {n.byName}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes fadeInScale {
          from { opacity:0; transform:translate(-50%,-50%) scale(0.88); }
          to   { opacity:1; transform:translate(-50%,-50%) scale(1); }
        }
        @keyframes praiseSlideIn {
          from { opacity:0; transform:translateY(-12px) scale(0.9); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
      `}</style>
    </>
  );
}
