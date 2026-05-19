"use client";

import { useEffect, useState, useCallback, useRef, memo } from "react";
import { Video, Mic, MessageSquare, BadgeCheck, User } from "lucide-react";

interface NearbyPlayer {
  id: string;
  name: string;
  username?: string;
  isGuest?: boolean;
  x: number;
  y: number;
  status: string;
}

// Memoized player card component to prevent unnecessary re-renders
const PlayerCard = memo(function PlayerCard({
  player,
  x,
  y,
  isBelow,
  onSendEmote,
}: {
  player: NearbyPlayer;
  x: number;
  y: number;
  isBelow: boolean;
  onSendEmote: (emoji: string) => void;
}) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "available":
        return "bg-green-500";
      case "busy":
        return "bg-red-500";
      case "away":
        return "bg-yellow-500";
      case "in_call":
        return "bg-blue-500";
      default:
        return "bg-gray-500";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "available":
        return "Available";
      case "busy":
        return "Busy";
      case "away":
        return "Away";
      case "in_call":
        return "In Call";
      default:
        return "Unknown";
    }
  };

  return (
    <div
      className="absolute transform -translate-x-1/2 pointer-events-auto"
      style={{
        left: x,
        top: y,
        transform: `translate(-50%, ${isBelow ? "0%" : "-100%"})`,
        willChange: "left, top", // Hint for GPU acceleration
      }}
    >
      <div className="bg-white rounded-xl shadow-lg border-2 border-gray-800 p-3 w-48 relative">
        <div className="flex items-center gap-3 mb-2 relative z-10">
          <div className="w-8 h-8 rounded-full bg-indigo-100 border-2 border-indigo-500 flex items-center justify-center text-indigo-700 font-bold font-pixel">
            {player.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <div className="font-bold text-gray-800 text-sm leading-tight truncate">
                {player.name}
              </div>
              {!player.isGuest && (
                <BadgeCheck className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <div
                className={`w-2 h-2 rounded-full ${getStatusColor(player.status)}`}
              ></div>
              <span className="text-xs text-gray-600 font-medium">
                {getStatusText(player.status)}
              </span>
              {player.isGuest && (
                <span className="text-[9px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-bold">
                  GUEST
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 relative z-10 mt-1">
          <div className="flex justify-between gap-2">
            {["👋", "❤️", "🔥", "🎉"].map((emoji) => (
              <button
                key={emoji}
                onClick={() => onSendEmote(emoji)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 p-1.5 rounded-lg transition-colors flex items-center justify-center text-lg transform hover:scale-110 active:scale-95"
                title={`Send ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
          <button
            onClick={() => onSendEmote("Say Hiii! 👋")}
            className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-1.5 px-3 rounded-lg transition-colors text-xs flex items-center justify-center gap-2 shadow-sm"
          >
            <MessageSquare size={14} />
            Say Hiii!
          </button>
        </div>
      </div>
    </div>
  );
});

export default function ProximityOverlay() {
  const [nearbyPlayers, setNearbyPlayers] = useState<NearbyPlayer[]>([]);
  const windowSizeRef = useRef({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    const handleResize = () => {
      windowSizeRef.current = {
        width: window.innerWidth,
        height: window.innerHeight,
      };
    };

    const handleProximityUpdate = (event: CustomEvent<NearbyPlayer[]>) => {
      setNearbyPlayers(event.detail);
    };

    const handlePlayerStatusChanged = (
      event: CustomEvent<{ id: string; status: string }>,
    ) => {
      const { id, status } = event.detail;
      setNearbyPlayers((prev) =>
        prev.map((player) =>
          player.id === id ? { ...player, status } : player,
        ),
      );
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener(
      "proximityUpdate",
      handleProximityUpdate as EventListener,
    );
    window.addEventListener(
      "playerStatusChanged",
      handlePlayerStatusChanged as EventListener,
    );

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener(
        "proximityUpdate",
        handleProximityUpdate as EventListener,
      );
      window.removeEventListener(
        "playerStatusChanged",
        handlePlayerStatusChanged as EventListener,
      );
    };
  }, []);

  const handleSendEmote = useCallback(
    (emoji: string) => {
      window.dispatchEvent(
        new CustomEvent("sendEmote", { detail: { emoji } }),
      );
    },
    [],
  );

  // Helper to calculate safe position
  const getSafePosition = useCallback((x: number, y: number) => {
    const CARD_WIDTH = 192;
    const CARD_HEIGHT = 120;
    const PADDING = 16;
    const { width, height } = windowSizeRef.current;

    let safeX = x;
    let safeY = y - 70;

    if (safeX + CARD_WIDTH / 2 > width - PADDING) {
      safeX = width - CARD_WIDTH / 2 - PADDING;
    }
    if (safeX - CARD_WIDTH / 2 < PADDING) {
      safeX = CARD_WIDTH / 2 + PADDING;
    }
    if (safeY - CARD_HEIGHT < PADDING) {
      safeY = y + 40;
    }

    return { x: safeX, y: safeY };
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-40">
      {nearbyPlayers.map((player) => {
        const { x, y } = getSafePosition(player.x, player.y);
        const isBelow = y > player.y;

        return (
          <PlayerCard
            key={player.id}
            player={player}
            x={x}
            y={y}
            isBelow={isBelow}
            onSendEmote={handleSendEmote}
          />
        );
      })}
    </div>
  );
}
