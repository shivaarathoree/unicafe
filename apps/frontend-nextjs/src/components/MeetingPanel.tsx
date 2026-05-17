"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Users } from "lucide-react";

interface Participant {
  id: string;
  name: string;
  role: "owner" | "guest";
  stream?: MediaStream;
  micOn: boolean;
  camOn: boolean;
}

interface MeetingPanelProps {
  myId: string;
  myName: string;
  myRole: "owner" | "guest" | null;
  onSendSignal: (event: string, data: object) => void;
}

export default function MeetingPanel({ myId, myName, myRole, onSendSignal }: MeetingPanelProps) {
  const [isInMeeting, setIsInMeeting] = useState(false);
  const [showJoinPrompt, setShowJoinPrompt] = useState(false);
  const [meetingStartedBy, setMeetingStartedBy] = useState("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(false); // audio-first
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());

  const ICE_SERVERS = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];

  // ── Get local media ──────────────────────────────────────────────────────
  const getLocalStream = useCallback(async (withVideo: boolean) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: withVideo ? { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: "user" } : false,
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      return stream;
    } catch (e) {
      console.warn("Media access denied, audio-only:", e);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = stream;
        return stream;
      } catch {
        return null;
      }
    }
  }, []);

  // ── Create peer connection ────────────────────────────────────────────────
  const createPC = useCallback((peerId: string) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = e => {
      if (e.candidate) {
        onSendSignal("webrtc_signal", {
          from: myId, to: peerId,
          data: { type: "ice", candidate: e.candidate.toJSON(), meetingSignal: true },
        });
      }
    };

    pc.ontrack = e => {
      const stream = e.streams[0];
      if (!stream) return;
      setParticipants(prev => prev.map(p =>
        p.id === peerId ? { ...p, stream } : p
      ));
      // Attach to video element if already mounted
      const el = remoteVideoRefs.current.get(peerId);
      if (el) el.srcObject = stream;
    };

    pc.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
        peerConnectionsRef.current.delete(peerId);
      }
    };

    // Add local tracks
    localStreamRef.current?.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current!));
    peerConnectionsRef.current.set(peerId, pc);
    return pc;
  }, [myId, onSendSignal]);

  // ── Join the meeting ──────────────────────────────────────────────────────
  const joinMeeting = useCallback(async () => {
    setShowJoinPrompt(false);
    const stream = await getLocalStream(camOn);
    if (!stream) return;

    setIsInMeeting(true);
    onSendSignal("meeting_joined", {});

    // Create offers to all existing participants (except self)
    participants.forEach(async p => {
      if (p.id === myId) return;
      const pc = createPC(p.id);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      onSendSignal("webrtc_signal", {
        from: myId, to: p.id,
        data: { type: "offer", sdp: offer.sdp, meetingSignal: true },
      });
    });
  }, [camOn, createPC, getLocalStream, myId, onSendSignal, participants]);

  // ── Owner starts meeting ──────────────────────────────────────────────────
  const startMeeting = useCallback(async () => {
    const stream = await getLocalStream(camOn);
    if (!stream) return;
    setIsInMeeting(true);
    onSendSignal("start_meeting", {});
  }, [camOn, getLocalStream, onSendSignal]);

  // ── Leave meeting ─────────────────────────────────────────────────────────
  const leaveMeeting = useCallback(() => {
    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    setIsInMeeting(false);
    setParticipants([]);
    if (myRole === "owner") {
      onSendSignal("end_meeting", {});
    }
  }, [myRole, onSendSignal]);

  // ── WebRTC signaling via window events ───────────────────────────────────
  useEffect(() => {
    const handleSignal = async (e: Event) => {
      const msg = (e as CustomEvent).detail;
      if (!msg || msg.type !== "webrtc_signal") return;
      const { from, to, data: sig } = msg.data || msg;
      if (to !== myId) return;
      if (!sig?.meetingSignal || !isInMeeting) return;

      let pc = peerConnectionsRef.current.get(from);

      if (sig.type === "offer") {
        if (!pc) pc = createPC(from);
        await pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: sig.sdp }));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        onSendSignal("webrtc_signal", {
          from: myId, to: from,
          data: { type: "answer", sdp: answer.sdp, meetingSignal: true },
        });
      } else if (sig.type === "answer" && pc) {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: sig.sdp }));
      } else if (sig.type === "ice" && sig.candidate && pc) {
        await pc.addIceCandidate(new RTCIceCandidate(sig.candidate));
      }
    };

    const handleMeetingStarted = (e: Event) => {
      const { byName, participants: pList } = (e as CustomEvent).detail;
      setMeetingStartedBy(byName);
      const mapped = (pList as Array<{ id: string; name: string; role: string }>).map(p => ({
        id: p.id, name: p.name, role: p.role as "owner" | "guest",
        micOn: true, camOn: false,
      }));
      setParticipants(mapped);
      // Owner already in meeting; others see prompt
      if (myRole === "owner") {
        setIsInMeeting(true);
      } else {
        setShowJoinPrompt(true);
      }
    };

    const handleMeetingEnded = () => {
      peerConnectionsRef.current.forEach(pc => pc.close());
      peerConnectionsRef.current.clear();
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
      setIsInMeeting(false);
      setShowJoinPrompt(false);
      setParticipants([]);
    };

    const handleParticipantJoined = (e: Event) => {
      const p = (e as CustomEvent).detail as { id: string; name: string; role: string };
      setParticipants(prev => {
        if (prev.find(x => x.id === p.id)) return prev;
        return [...prev, { id: p.id, name: p.name, role: p.role as "owner" | "guest", micOn: true, camOn: false }];
      });
    };

    window.addEventListener("wsMessage_webrtc_signal", handleSignal as EventListener);
    window.addEventListener("meetingStarted", handleMeetingStarted as EventListener);
    window.addEventListener("meetingEnded", handleMeetingEnded as EventListener);
    window.addEventListener("participantJoinedMeeting", handleParticipantJoined as EventListener);

    return () => {
      window.removeEventListener("wsMessage_webrtc_signal", handleSignal as EventListener);
      window.removeEventListener("meetingStarted", handleMeetingStarted as EventListener);
      window.removeEventListener("meetingEnded", handleMeetingEnded as EventListener);
      window.removeEventListener("participantJoinedMeeting", handleParticipantJoined as EventListener);
    };
  }, [createPC, isInMeeting, myId, myRole, onSendSignal]);

  // ── Mic toggle ────────────────────────────────────────────────────────────
  const toggleMic = () => {
    const enabled = !micOn;
    setMicOn(enabled);
    localStreamRef.current?.getAudioTracks().forEach(t => (t.enabled = enabled));
  };

  const toggleCam = () => {
    const enabled = !camOn;
    setCamOn(enabled);
    localStreamRef.current?.getVideoTracks().forEach(t => (t.enabled = enabled));
  };

  // ── Ref callback for remote video elements ────────────────────────────────
  const setRemoteVideoRef = useCallback((peerId: string, el: HTMLVideoElement | null) => {
    if (el) {
      remoteVideoRefs.current.set(peerId, el);
      const p = participants.find(p => p.id === peerId);
      if (p?.stream) el.srcObject = p.stream;
    }
  }, [participants]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Join Prompt (for guests when owner starts meeting) ── */}
      {showJoinPrompt && !isInMeeting && (
        <div style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 500,
          background: "rgba(20,12,4,0.97)",
          border: "1.5px solid rgba(255,210,140,0.3)",
          borderRadius: 20,
          padding: "28px 32px",
          textAlign: "center",
          boxShadow: "0 20px 60px rgba(0,0,0,0.8)",
          backdropFilter: "blur(20px)",
          maxWidth: "90vw",
          width: 320,
          animation: "fadeInScale 0.3s ease",
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>☕</div>
          <p style={{ fontSize: 18, fontWeight: 700, color: "rgba(255,210,140,0.95)", fontFamily: "Inter, system-ui", margin: "0 0 6px" }}>
            Meeting Started!
          </p>
          <p style={{ fontSize: 13, color: "rgba(255,210,140,0.6)", fontFamily: "Inter", margin: "0 0 20px" }}>
            <strong style={{ color: "rgba(255,210,140,0.85)" }}>{meetingStartedBy}</strong> has started the cafe meeting
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={joinMeeting}
              style={{
                flex: 1, padding: "12px 0",
                background: "rgba(74,222,128,0.15)",
                border: "1.5px solid rgba(74,222,128,0.4)",
                borderRadius: 12, cursor: "pointer",
                color: "#4ade80", fontSize: 14, fontWeight: 600, fontFamily: "Inter",
              }}
            >
              🎙 Join
            </button>
            <button
              onClick={() => setShowJoinPrompt(false)}
              style={{
                flex: 1, padding: "12px 0",
                background: "rgba(239,68,68,0.1)",
                border: "1.5px solid rgba(239,68,68,0.3)",
                borderRadius: 12, cursor: "pointer",
                color: "rgba(239,68,68,0.8)", fontSize: 14, fontWeight: 600, fontFamily: "Inter",
              }}
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {/* ── Start Meeting button (owner only, not in meeting) ── */}
      {myRole === "owner" && !isInMeeting && (
        <button
          onClick={startMeeting}
          style={{
            position: "fixed",
            bottom: 130,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 20px",
            background: "rgba(99,102,241,0.2)",
            border: "1.5px solid rgba(99,102,241,0.5)",
            borderRadius: 30,
            color: "rgba(165,180,252,0.95)",
            fontSize: 14,
            fontWeight: 600,
            fontFamily: "Inter, system-ui",
            cursor: "pointer",
            backdropFilter: "blur(12px)",
            boxShadow: "0 4px 20px rgba(99,102,241,0.3)",
            transition: "all 0.2s",
            whiteSpace: "nowrap",
          }}
        >
          <Users size={16} />
          Start Cafe Meeting
        </button>
      )}

      {/* ── Meeting video grid ── */}
      {isInMeeting && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 300,
          display: "flex",
          flexDirection: "column",
          background: "rgba(10,6,2,0.96)",
          backdropFilter: "blur(16px)",
        }}>
          {/* Header */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px",
            borderBottom: "1px solid rgba(255,210,140,0.1)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%", background: "#4ade80",
                boxShadow: "0 0 8px #4ade80", animation: "pulse 1.5s infinite",
              }} />
              <span style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,210,140,0.9)", fontFamily: "Inter" }}>
                Cafe Meeting · {participants.length} people
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* Mic */}
              <MeetBtn onClick={toggleMic} active={micOn} icon={micOn ? <Mic size={16}/> : <MicOff size={16}/>} color={micOn ? "green" : "red"} />
              {/* Cam */}
              <MeetBtn onClick={toggleCam} active={camOn} icon={camOn ? <Video size={16}/> : <VideoOff size={16}/>} color={camOn ? "green" : "gray"} />
              {/* Leave */}
              <button
                onClick={leaveMeeting}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 16px",
                  background: "rgba(239,68,68,0.2)",
                  border: "1px solid rgba(239,68,68,0.4)",
                  borderRadius: 20, cursor: "pointer",
                  color: "#f87171", fontSize: 13, fontWeight: 600, fontFamily: "Inter",
                }}
              >
                <PhoneOff size={14} />
                {myRole === "owner" ? "End" : "Leave"}
              </button>
            </div>
          </div>

          {/* Video Grid */}
          <div style={{
            flex: 1,
            display: "grid",
            gridTemplateColumns: participants.length <= 1 ? "1fr" : participants.length <= 2 ? "repeat(2, 1fr)" : participants.length <= 4 ? "repeat(2, 1fr)" : "repeat(3, 1fr)",
            gap: 8,
            padding: 12,
            alignContent: "start",
            overflowY: "auto",
          }}>
            {/* Local video tile */}
            <VideoTile
              name={`${myName} (you)`}
              role={myRole || "guest"}
              isLocal
              micOn={micOn}
              camOn={camOn}
              videoRef={localVideoRef}
            />
            {/* Remote video tiles */}
            {participants.filter(p => p.id !== myId).map(p => (
              <VideoTile
                key={p.id}
                name={p.name}
                role={p.role}
                micOn={p.micOn}
                camOn={p.camOn}
                videoRef={(el) => setRemoteVideoRef(p.id, el)}
                stream={p.stream}
              />
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeInScale {
          from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
          to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </>
  );
}

// ── Video Tile ─────────────────────────────────────────────────────────────
function VideoTile({
  name, role, isLocal, micOn, camOn, videoRef, stream
}: {
  name: string; role: string; isLocal?: boolean;
  micOn: boolean; camOn: boolean;
  videoRef: React.Ref<HTMLVideoElement> | ((el: HTMLVideoElement | null) => void);
  stream?: MediaStream;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  // Auto-attach stream when it arrives
  useEffect(() => {
    if (stream && ref.current) ref.current.srcObject = stream;
  }, [stream]);

  return (
    <div style={{
      position: "relative",
      background: "rgba(30,18,8,0.9)",
      borderRadius: 16,
      overflow: "hidden",
      aspectRatio: "4/3",
      border: `1.5px solid ${role === "owner" ? "rgba(251,191,36,0.3)" : "rgba(255,210,140,0.1)"}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: 120,
    }}>
      {/* Video */}
      <video
        ref={isLocal ? videoRef as React.Ref<HTMLVideoElement> : ref}
        autoPlay
        playsInline
        muted={isLocal}
        style={{
          width: "100%", height: "100%",
          objectFit: "cover",
          display: camOn || (stream && stream.getVideoTracks().length > 0) ? "block" : "none",
        }}
      />

      {/* Avatar placeholder when no video */}
      {(!camOn && !stream?.getVideoTracks().length) && (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%",
            background: role === "owner" ? "rgba(251,191,36,0.2)" : "rgba(99,102,241,0.2)",
            border: `2px solid ${role === "owner" ? "rgba(251,191,36,0.4)" : "rgba(99,102,241,0.3)"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, fontWeight: 700,
            color: role === "owner" ? "#fbbf24" : "#818cf8",
            fontFamily: "Inter, system-ui",
          }}>
            {name.charAt(0).toUpperCase()}
          </div>
          <span style={{ fontSize: 11, color: "rgba(255,210,140,0.5)", fontFamily: "Inter" }}>No camera</span>
        </div>
      )}

      {/* Name + role badge */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        background: "linear-gradient(transparent, rgba(10,6,2,0.9))",
        padding: "20px 10px 8px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{
          fontSize: 12, fontWeight: 600,
          color: "rgba(255,210,140,0.9)", fontFamily: "Inter",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {role === "owner" ? "☕ " : ""}{name}
        </span>
        {!micOn && <span style={{ fontSize: 14 }}>🔇</span>}
      </div>
    </div>
  );
}

function MeetBtn({ onClick, icon, color }: { onClick: () => void; active: boolean; icon: React.ReactNode; color: string }) {
  const colors: Record<string, string> = { green: "rgba(74,222,128,0.2)", red: "rgba(239,68,68,0.2)", gray: "rgba(255,255,255,0.08)" };
  const borders: Record<string, string> = { green: "rgba(74,222,128,0.4)", red: "rgba(239,68,68,0.4)", gray: "rgba(255,255,255,0.1)" };
  const textColors: Record<string, string> = { green: "#4ade80", red: "#f87171", gray: "rgba(255,210,140,0.5)" };
  return (
    <button onClick={onClick} style={{
      width: 36, height: 36, borderRadius: "50%",
      background: colors[color] || colors.gray,
      border: `1px solid ${borders[color] || borders.gray}`,
      color: textColors[color] || textColors.gray,
      display: "flex", alignItems: "center", justifyContent: "center",
      cursor: "pointer", transition: "all 0.15s",
    }}>
      {icon}
    </button>
  );
}
