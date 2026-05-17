"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Minimize2, Maximize2, X, UploadCloud, Play, Pause, Music, Sliders } from "lucide-react";
import { useParams } from "next/navigation";

interface MusicState {
  playing: boolean;
  track: number;
  mode: "lofi" | "youtube" | "mp3";
  youtubeUrl?: string;   // actually the video ID
  mp3Name?: string | null;
  duration?: number;
  seekTime?: number;
  serverTime?: number;
}

const LOFI_TRACKS = [
  { name: "Café Rainy Day", emoji: "☕", url: "https://stream.zeno.fm/f3wvbbqmdg8uv" },
  { name: "Study Session",  emoji: "📚", url: "https://stream.zeno.fm/0r0xa792kwzuv" },
  { name: "Late Night Beats", emoji: "🌙", url: "https://stream.zeno.fm/yhby3t1yfpquv" },
];

function extractYouTubeId(input: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = input.match(regExp);
  if (match && match[2].length === 11) {
    return match[2];
  }
  if (input.trim().length === 11 && !input.trim().includes("/")) {
    return input.trim();
  }
  return null;
}

// Declare YT global type
declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

interface MusicBarProps {
  myRole?: "owner" | "guest" | null;
}

export default function MusicBar({ myRole }: MusicBarProps) {
  const params = useParams();
  const roomId = params?.roomId as string || "lobby";

  const [state, setState] = useState<MusicState>({ playing: false, track: 0, mode: "lofi" });
  const [volume, setVolumeState] = useState(50);
  const [showVolume, setShowVolume] = useState(false);
  const [showYtInput, setShowYtInput] = useState(false);
  const [ytInput, setYtInput] = useState("");
  const [ytError, setYtError] = useState("");
  const [ytReady, setYtReady] = useState(false);
  const [ytMinimized, setYtMinimized] = useState(false);
  const [guestNeedsClick, setGuestNeedsClick] = useState(false);
  const [pendingYtId, setPendingYtId] = useState<string | null>(null);
  
  // Local MP3 upload state
  const [isUploading, setIsUploading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mp3AudioRef = useRef<HTMLAudioElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const ytDivRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isOwner = myRole === "owner";

  // ── Load YouTube IFrame API once ────────────────────────────────────────
  useEffect(() => {
    if (window.YT?.Player) { setYtReady(true); return; }
    if (!document.getElementById("yt-api-script")) {
      const script = document.createElement("script");
      script.id  = "yt-api-script";
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    }
    window.onYouTubeIframeAPIReady = () => setYtReady(true);
  }, []);

  // ── Create / update YT player when video ID changes ─────────────────────
  const loadYouTubePlayer = useCallback((videoId: string, seekSec: number) => {
    if (!ytReady || !ytDivRef.current) return;

    if (ytPlayerRef.current) {
      ytPlayerRef.current.loadVideoById({ videoId, startSeconds: seekSec });
      return;
    }

    ytPlayerRef.current = new window.YT.Player(ytDivRef.current, {
      videoId,
      playerVars: {
        autoplay: 1,
        start: Math.floor(seekSec),
        controls: isOwner ? 1 : 0,
        rel: 0,
        modestbranding: 1,
      },
      events: {
        onReady: (e: any) => {
          e.target.setVolume(volume);
          e.target.playVideo();
        },
        onStateChange: (e: any) => {
          if (!isOwner) return;
          if (e.data === window.YT.PlayerState.PLAYING) {
            window.dispatchEvent(new CustomEvent("musicControl", {
              detail: { action: "yt_state", ytState: "playing", seek: e.target.getCurrentTime() },
            }));
          } else if (e.data === window.YT.PlayerState.PAUSED) {
            window.dispatchEvent(new CustomEvent("musicControl", {
              detail: { action: "yt_state", ytState: "paused", seek: e.target.getCurrentTime() },
            }));
          }
        },
      },
    });
  }, [ytReady, isOwner, volume]);

  // ── Sync track position & time tracking loop ───────────────────────────
  useEffect(() => {
    let active = true;
    const updateProgress = () => {
      if (!active) return;
      if (!isDragging) {
        if (state?.mode === "mp3" && mp3AudioRef.current) {
          setCurrentTime(mp3AudioRef.current.currentTime || 0);
        } else if (state?.mode === "youtube" && ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === "function") {
          setCurrentTime(ytPlayerRef.current.getCurrentTime() || 0);
        }
      }
      requestAnimationFrame(updateProgress);
    };
    requestAnimationFrame(updateProgress);
    return () => { active = false; };
  }, [state?.mode, isDragging]);

  // ── Receive music state from server ─────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const s = (e as CustomEvent).detail as MusicState;
      if (!s) return;
      setState(s);

      // Setup MP3 Audio element if not present
      if (!mp3AudioRef.current && typeof window !== "undefined") {
        mp3AudioRef.current = new Audio();
      }

      if (s.mode === "lofi") {
        // Stop YT & MP3
        ytPlayerRef.current?.stopVideo();
        ytPlayerRef.current?.destroy();
        ytPlayerRef.current = null;
        mp3AudioRef.current?.pause();

        // Play lofi stream
        if (s.playing) {
          if (!audioRef.current) audioRef.current = new Audio();
          const url = LOFI_TRACKS[s.track]?.url || LOFI_TRACKS[0].url;
          if (audioRef.current.src !== url) audioRef.current.src = url;
          audioRef.current.volume = volume / 100;
          audioRef.current.play().catch(() => {});
        } else {
          audioRef.current?.pause();
        }
      } else if (s.mode === "youtube" && s.youtubeUrl) {
        // Stop lofi & MP3
        audioRef.current?.pause();
        mp3AudioRef.current?.pause();

        const videoId = s.youtubeUrl;
        const elapsed = s.serverTime ? (Date.now() - s.serverTime) / 1000 : 0;
        const seekSec = (s.seekTime || 0) + elapsed;

        if (isOwner) {
          loadYouTubePlayer(videoId, seekSec);
        } else {
          setPendingYtId(videoId);
          setGuestNeedsClick(true);
        }
      } else if (s.mode === "mp3" && s.mp3Name) {
        // Stop lofi & YT
        audioRef.current?.pause();
        ytPlayerRef.current?.stopVideo();
        ytPlayerRef.current?.destroy();
        ytPlayerRef.current = null;

        const BACKEND_URL = process.env.NEXT_PUBLIC_WS_URL || "";
        const streamUrl = `${BACKEND_URL}/api/rooms/${roomId}/stream-mp3?t=${Date.now()}`;
        if (mp3AudioRef.current) {
          const absoluteStreamUrl = streamUrl.startsWith("http") ? streamUrl : window.location.origin + streamUrl;
          if (mp3AudioRef.current.src !== absoluteStreamUrl) {
            mp3AudioRef.current.src = streamUrl;
          }
          mp3AudioRef.current.volume = volume / 100;

          const elapsed = s.serverTime ? (Date.now() - s.serverTime) / 1000 : 0;
          const seekSec = Math.max(0, Math.min(s.duration || 0, (s.seekTime || 0) + (s.playing ? elapsed : 0)));

          if (s.playing) {
            mp3AudioRef.current.play().catch(() => {});
            if (Math.abs(mp3AudioRef.current.currentTime - seekSec) > 1.8) {
              mp3AudioRef.current.currentTime = seekSec;
            }
          } else {
            mp3AudioRef.current.pause();
            mp3AudioRef.current.currentTime = seekSec;
          }
        }
      }
    };
    window.addEventListener("musicStateChanged", handler);
    return () => window.removeEventListener("musicStateChanged", handler);
  }, [isOwner, loadYouTubePlayer, volume, roomId]);

  // ── Volume changes ───────────────────────────────────────────────────────
  useEffect(() => {
    ytPlayerRef.current?.setVolume(volume);
    if (audioRef.current) audioRef.current.volume = volume / 100;
    if (mp3AudioRef.current) mp3AudioRef.current.volume = volume / 100;
  }, [volume]);

  const dispatch = useCallback((action: string, extra?: object) => {
    window.dispatchEvent(new CustomEvent("musicControl", { detail: { action, ...extra } }));
  }, []);

  const handleYouTubeSubmit = () => {
    const id = extractYouTubeId(ytInput.trim());
    if (!id) { setYtError("Invalid YouTube URL or video ID"); return; }
    setYtError("");
    setShowYtInput(false);
    setYtInput("");
    dispatch("youtube", { youtubeId: id });
  };

  // ── Handle local MP3 upload (owner only) ──────────────────────────────
  const handleMp3Upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);

    try {
      const tempAudioObj = new Audio();
      tempAudioObj.src = URL.createObjectURL(file);
      await new Promise<void>((resolve) => {
        tempAudioObj.onloadedmetadata = () => {
          resolve();
        };
      });
      const duration = tempAudioObj.duration;

      const BACKEND_URL = process.env.NEXT_PUBLIC_WS_URL || "";
      const response = await fetch(`${BACKEND_URL}/api/rooms/${roomId}/upload-mp3`, {
        method: "POST",
        body: file,
      });

      if (!response.ok) throw new Error("Upload failed");

      dispatch("mp3", { mp3Name: file.name, duration });

    } catch (err) {
      console.error("Local MP3 upload error:", err);
      alert("Failed to upload MP3 file to café server.");
    } finally {
      setIsUploading(false);
    }
  };

  // ── Seek Slider change (owner only) ───────────────────────────────────
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isOwner) return;
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    setIsDragging(true);
  };

  const handleSeekEnd = (e: React.MouseEvent | React.TouchEvent | React.KeyboardEvent) => {
    if (!isOwner) return;
    setIsDragging(false);
    const target = e.target as HTMLInputElement;
    const val = parseFloat(target.value);
    
    if (state?.mode === "mp3" && mp3AudioRef.current) {
      mp3AudioRef.current.currentTime = val;
    } else if (state?.mode === "youtube" && ytPlayerRef.current) {
      ytPlayerRef.current.seekTo(val, true);
    }
    
    dispatch("seek", { seekTime: val });
  };

  // Format seconds to mm:ss
  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds === Infinity) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins < 10 ? "0" : ""}${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  // Guest clicks to join YouTube audio
  const guestJoinYt = useCallback(() => {
    setGuestNeedsClick(false);
    if (!pendingYtId || !ytReady) return;

    const elapsed = state?.serverTime ? (Date.now() - state.serverTime) / 1000 : 0;
    const seekSec = (state?.seekTime || 0) + elapsed;
    loadYouTubePlayer(pendingYtId, seekSec);
  }, [pendingYtId, ytReady, state, loadYouTubePlayer]);

  const track = LOFI_TRACKS[state?.track ?? 0] || LOFI_TRACKS[0];
  const maxDuration = state?.duration || 180;

  return (
    <>
      {/* ── YouTube player window ────────────────────────────────────────── */}
      {state?.mode === "youtube" && (
        <div style={{
          position: "fixed",
          bottom: ytMinimized ? 64 : 80,
          right: 16,
          zIndex: 210,
          background: "rgba(10,15,25,0.97)",
          border: "1px solid rgba(100,180,255,0.3)",
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
          width: ytMinimized ? 0 : 280,
          height: ytMinimized ? 0 : "auto",
          transition: "all 0.25s ease",
        }}>
          {/* Player header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px",
            background: "rgba(255,50,50,0.15)",
            borderBottom: "1px solid rgba(100,180,255,0.1)",
          }}>
            <span style={{ fontSize: 12, color: "rgba(200,220,255,0.9)", fontFamily: "Inter", fontWeight: 600 }}>
              📺 YouTube {isOwner ? "(owner)" : "(synced)"}
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => setYtMinimized(v => !v)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(200,220,255,0.7)", padding: 2 }}
              >
                {ytMinimized ? <Maximize2 size={13}/> : <Minimize2 size={13}/>}
              </button>
              <button
                onClick={() => {
                  ytPlayerRef.current?.stopVideo();
                  ytPlayerRef.current?.destroy();
                  ytPlayerRef.current = null;
                  if (isOwner) dispatch("toggle");
                }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,100,100,0.8)", padding: 2 }}
              >
                <X size={13}/>
              </button>
            </div>
          </div>

          {/* YouTube iframe container */}
          {!ytMinimized && (
            <div ref={ytDivRef} style={{ width: 280, height: 157 }} />
          )}
        </div>
      )}

      {/* ── Guest "click to listen" prompt ──────────────────────────────── */}
      {guestNeedsClick && !isOwner && (
        <div style={{
          position: "fixed",
          bottom: 130,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 205,
          background: "rgba(10,15,25,0.97)",
          border: "1px solid rgba(255,100,100,0.35)",
          borderRadius: 16,
          padding: "14px 20px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
          backdropFilter: "blur(16px)",
          maxWidth: "90vw",
        }}>
          <span style={{ fontSize: 24 }}>📺</span>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: "rgba(200,230,255,0.95)", fontFamily: "Inter", margin: "0 0 2px" }}>
              Owner is playing a YouTube video
            </p>
            <p style={{ fontSize: 11, color: "rgba(150,180,220,0.6)", fontFamily: "Inter", margin: 0 }}>
              Click to sync and listen along
            </p>
          </div>
          <button
            onClick={guestJoinYt}
            style={{
              padding: "8px 16px",
              background: "rgba(255,50,50,0.2)",
              border: "1px solid rgba(255,100,100,0.4)",
              borderRadius: 10, cursor: "pointer",
              color: "#f87171", fontSize: 13, fontWeight: 600, fontFamily: "Inter",
              whiteSpace: "nowrap",
            }}
          >
            ▶ Listen
          </button>
          <button
            onClick={() => setGuestNeedsClick(false)}
            style={{ background: "none", border: "none", color: "rgba(150,180,200,0.4)", cursor: "pointer", fontSize: 18 }}
          >✕</button>
        </div>
      )}

      {/* ── YouTube URL input modal (owner only) ──────────────────────── */}
      {showYtInput && isOwner && (
        <div style={{
          position: "fixed", bottom: 70, left: "50%",
          transform: "translateX(-50%)", zIndex: 201,
          background: "rgba(10,15,25,0.98)",
          border: "1px solid rgba(100,180,255,0.25)",
          borderRadius: 16, padding: "16px 18px",
          width: 320, maxWidth: "calc(100vw - 32px)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
          backdropFilter: "blur(20px)",
        }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: "rgba(200,230,255,0.95)", fontFamily: "Inter", margin: "0 0 4px" }}>
            📺 Play YouTube for the whole café
          </p>
          <p style={{ fontSize: 11, color: "rgba(150,190,230,0.5)", fontFamily: "Inter", margin: "0 0 12px" }}>
            Everyone will see a sync prompt and can listen in
          </p>
          <input
            type="text"
            value={ytInput}
            onChange={e => { setYtInput(e.target.value); setYtError(""); }}
            onKeyDown={e => e.key === "Enter" && handleYouTubeSubmit()}
            placeholder="https://youtube.com/watch?v=... or video ID"
            style={{
              width: "100%", background: "rgba(255,255,255,0.06)",
              border: `1.5px solid ${ytError ? "rgba(255,80,80,0.5)" : "rgba(100,180,255,0.2)"}`,
              borderRadius: 10, padding: "10px 12px",
              color: "rgba(200,230,255,0.9)", fontSize: 13,
              fontFamily: "Inter", outline: "none",
              boxSizing: "border-box", marginBottom: 8,
            }}
            autoFocus
          />
          {ytError && <p style={{ fontSize: 11, color: "#f87171", fontFamily: "Inter", margin: "0 0 8px" }}>{ytError}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleYouTubeSubmit} style={{
              flex: 1, padding: "10px 0",
              background: "rgba(255,60,60,0.2)",
              border: "1px solid rgba(255,80,80,0.4)",
              borderRadius: 10, cursor: "pointer",
              color: "#f87171", fontSize: 13, fontWeight: 600, fontFamily: "Inter",
            }}>
              ▶ Play for everyone
            </button>
            <button onClick={() => { setShowYtInput(false); setYtError(""); }} style={{
              padding: "10px 14px", background: "transparent",
              border: "1px solid rgba(100,180,255,0.15)",
              borderRadius: 10, cursor: "pointer",
              color: "rgba(150,200,255,0.5)", fontSize: 14, fontFamily: "Inter",
            }}>✕</button>
          </div>
        </div>
      )}

      {/* ── Main music bar ─────────────────────────────────────────────── */}
      <div style={{
        position: "fixed", bottom: 14, left: "50%",
        transform: "translateX(-50%)", zIndex: 200,
        display: "flex", flexDirection: "column", gap: 6,
        background: "rgba(10,18,30,0.95)",
        backdropFilter: "blur(18px)",
        borderRadius: 24, padding: "10px 18px",
        border: "1px solid rgba(100,180,255,0.25)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.65)",
        userSelect: "none", width: "380px", maxWidth: "calc(100vw - 32px)",
        boxSizing: "border-box",
      }}>
        
        {/* Top half: main controls & info */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          
          {/* Track metadata / Vinyl & info */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden", flex: 1 }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              background: "radial-gradient(circle, #1a2a3a 30%, #0a1520 70%)",
              border: "2px solid rgba(100,180,255,0.35)",
              display: "flex", alignItems: "center", justifyContent: "center",
              animation: state?.playing ? "vinylSpin 3s linear infinite" : "none",
              flexShrink: 0,
            }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(120,200,255,0.9)" }} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <span style={{
                fontSize: 12, fontWeight: 600, color: "rgba(180,220,255,0.95)", fontFamily: "Inter",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {state?.mode === "youtube" ? "📺 YouTube Live Sync" : state?.mode === "mp3" ? `📁 ${state?.mp3Name}` : `${track.emoji} ${track.name}`}
              </span>
              <span style={{ fontSize: 9, color: "rgba(100,180,255,0.55)", fontFamily: "Inter" }}>
                {(state?.mode || "lofi").toUpperCase()} MODE
              </span>
            </div>
          </div>

          {/* Controls section */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {/* Lofi Next / Prev controls */}
            {isOwner && state?.mode === "lofi" && (
              <>
                <MBtn onClick={() => dispatch("prev")}>⏮</MBtn>
                <MBtn onClick={() => dispatch("toggle")} active={state?.playing} big>
                  {state?.playing ? <Pause size={14}/> : <Play size={14}/>}
                </MBtn>
                <MBtn onClick={() => dispatch("next")}>⏭</MBtn>
              </>
            )}

            {/* MP3 Play/Pause toggle (owner only) */}
            {isOwner && state?.mode === "mp3" && (
              <MBtn onClick={() => dispatch("toggle")} active={state?.playing} big>
                {state?.playing ? <Pause size={14}/> : <Play size={14}/>}
              </MBtn>
            )}

            {/* EQ visualizer */}
            {state?.playing && (
              <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 14, marginRight: 4 }}>
                {[1, 2, 3].map(i => (
                  <div key={i} style={{
                    width: 3, background: "rgba(100,200,255,0.75)", borderRadius: 2,
                    animation: `musicBar${i} 0.8s ease-in-out infinite`,
                    animationDelay: `${i * 0.15}s`,
                  }} />
                ))}
              </div>
            )}

            {/* Volume Icon Slider */}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <MBtn onClick={() => setShowVolume(v => !v)}>
                {volume === 0 ? "🔇" : volume < 50 ? "🔉" : "🔊"}
              </MBtn>
              {showVolume && (
                <input type="range" min={0} max={100} step={5} value={volume}
                  onChange={e => setVolumeState(parseInt(e.target.value))}
                  style={{ width: 50, accentColor: "rgba(100,200,255,0.9)", cursor: "pointer" }}
                />
              )}
            </div>

            {/* Owner Playback Options Button panel */}
            {isOwner && (
              <div style={{ display: "flex", gap: 4, borderLeft: "1px solid rgba(100,180,255,0.2)", paddingLeft: 6 }}>
                {/* YouTube */}
                <button
                  onClick={() => { setShowYtInput(v => !v); }}
                  title="Play YouTube video"
                  style={{
                    background: "rgba(255,50,50,0.15)",
                    border: "1px solid rgba(255,80,80,0.35)",
                    borderRadius: 8, padding: "4px 8px",
                    cursor: "pointer", color: "#f87171",
                    fontSize: 10, fontWeight: 700, fontFamily: "Inter",
                  }}
                >
                  YT ▶
                </button>

                {/* Local MP3 Select */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload & stream local MP3"
                  disabled={isUploading}
                  style={{
                    background: "rgba(100,180,255,0.15)",
                    border: "1px solid rgba(100,180,255,0.35)",
                    borderRadius: 8, padding: "4px 8px",
                    cursor: "pointer", color: "rgba(150,210,255,0.9)",
                    fontSize: 10, fontWeight: 700, fontFamily: "Inter",
                    display: "flex", alignItems: "center", gap: 3
                  }}
                >
                  <UploadCloud size={10} />
                  {isUploading ? "..." : "MP3"}
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="audio/mp3,audio/*"
                  onChange={handleMp3Upload}
                  style={{ display: "none" }}
                />
              </div>
            )}

          </div>

        </div>

        {/* Bottom half: Progress seeking bar slider (only for MP3 and YouTube sync) */}
        {(state?.mode === "mp3" || state?.mode === "youtube") && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            borderTop: "1px solid rgba(100,180,255,0.1)", paddingTop: 6,
            marginTop: 2
          }}>
            <span style={{ fontSize: 9, color: "rgba(100,180,255,0.6)", fontFamily: "monospace", minWidth: 28 }}>
              {formatTime(currentTime)}
            </span>
            
            <input
              type="range"
              min={0}
              max={maxDuration}
              value={currentTime}
              onChange={handleSeek}
              onMouseUp={handleSeekEnd}
              onTouchEnd={handleSeekEnd}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                outline: "none",
                accentColor: "rgba(100,200,255,0.9)",
                background: "rgba(255,255,255,0.1)",
                cursor: isOwner ? "pointer" : "default",
                pointerEvents: isOwner ? "auto" : "none", // Guests can only view progress
              }}
            />

            <span style={{ fontSize: 9, color: "rgba(100,180,255,0.6)", fontFamily: "monospace", minWidth: 28 }}>
              {formatTime(maxDuration)}
            </span>
          </div>
        )}

        <style>{`
          @keyframes vinylSpin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
          @keyframes musicBar1 { 0%,100%{height:4px} 50%{height:12px} }
          @keyframes musicBar2 { 0%,100%{height:8px} 50%{height:4px} }
          @keyframes musicBar3 { 0%,100%{height:4px} 50%{height:10px} }
        `}</style>
      </div>
    </>
  );
}

function MBtn({ onClick, children, active, big }: {
  onClick: () => void; children: React.ReactNode; active?: boolean; big?: boolean;
}) {
  return (
    <button onClick={onClick} style={{
      background: active ? "rgba(100,200,255,0.2)" : "transparent",
      border: "none", color: "rgba(150,210,255,0.85)",
      cursor: "pointer", fontSize: big ? 14 : 15, lineHeight: 1,
      display: "flex", alignItems: "center", justifyContent: "center",
      width: big ? 30 : 24, height: big ? 30 : 24,
      borderRadius: big ? "50%" : 4, transition: "all 0.15s",
    }}>
      {children}
    </button>
  );
}
