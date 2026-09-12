"use client";

// WebRTC 1:1 video calls for Y-COMPS chat. Signaling rides the existing
// conversation WebSocket (chatops consumer relays call_offer / call_answer /
// call_ice / call_end frames), so no extra infrastructure is needed — both
// peers must simply be connected to the same conversation's WS.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  X,
} from "lucide-react";

export type CallStatus = "idle" | "outgoing" | "ringing" | "in_call";

export interface IncomingCall {
  caller_user_id: string;
  caller_name: string;
}

interface UseVideoCallOptions {
  ws: WebSocket | null;
  /**
   * Always-current send path into the conversation socket (delegates to the
   * ReconnectingSocket wrapper, so it stays valid across reconnects). Call
   * signalling MUST go through this instead of the render-time `ws` snapshot.
   */
  sendFrame: ((frame: Record<string, unknown>) => boolean) | null;
  myId: string | null;
  myName: string;
  partnerName: string;
}

export function useVideoCall({
  ws,
  sendFrame,
  myId,
  myName,
  partnerName,
}: UseVideoCallOptions) {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioMuted, setAudioMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);

  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);

  const localStreamRef = useRef<MediaStream | null>(null);

  const wsRef = useRef<WebSocket | null>(ws);

  useEffect(() => {
    wsRef.current = ws;
  }, [ws]);

  // Live send path (survives reconnects, unlike the render-time ws snapshot).
  const sendFrameRef = useRef(sendFrame);

  useEffect(() => {
    sendFrameRef.current = sendFrame;
  }, [sendFrame]);

  // Mirror of `status` for timers/listeners that must not re-arm on every
  // status change.
  const statusRef = useRef<CallStatus>(status);

  statusRef.current = status;

  // No-answer / missed-call guard timers.
  const callTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const makePeer = () =>
    new RTCPeerConnection({
      iceServers: [
        {
          urls: "stun:stun.l.google.com:19302",
        },
        {
          urls: "stun:stun1.l.google.com:19302",
        },
      ],
    });

  // Reset the call fully.
  const cleanup = useCallback(() => {
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);

      callTimeoutRef.current = null;
    }

    pcRef.current?.close();

    pcRef.current = null;

    localStreamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });

    localStreamRef.current = null;

    if (localRef.current) {
      localRef.current.srcObject = null;
    }

    if (remoteRef.current) {
      remoteRef.current.srcObject = null;
    }

    setStatus("idle");
    setIncoming(null);
    setError(null);
    setAudioMuted(false);
    setVideoOff(false);
  }, []);

  /**
   * Send a call-signalling frame through the LIVE socket path.
   *
   * The old implementation checked a render-time WebSocket snapshot
   * (wsRef.current) and failed instantly with "Connection lost" whenever the
   * wrapper had swapped its underlying socket (backend restart, HMR remount,
   * brief network drop) — the leading cause of dead calls. This version
   * retries for up to ~4s, which rides out an in-flight reconnect, and only
   * then reports the connection as lost.
   */
  const sendSignal = useCallback(
    async (
      type: string,
      payload: Record<string, unknown> = {}
    ): Promise<boolean> => {
      const deadline = Date.now() + 4000;

      let delayMs = 100;

      // Try immediately, then back off briefly while the socket reconnects.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (sendFrameRef.current?.({ type, payload })) {
          return true;
        }

        if (Date.now() + delayMs >= deadline) {
          break;
        }

        await new Promise((resolve) =>
          setTimeout(resolve, delayMs)
        );

        delayMs = Math.min(delayMs * 2, 400);
      }

      // No side effects here — call sites own the user-facing error so the
      // ordering with cleanup() (which clears errors) stays correct.
      return false;
    },
    []
  );

  // Create the peer + local stream once.
  const prepareLocalMedia = useCallback(async () => {
    const stream =
      await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

    localStreamRef.current = stream;

    if (localRef.current) {
      localRef.current.srcObject = stream;
    }

    const pc = makePeer();

    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });

    pc.ontrack = (event) => {
      if (remoteRef.current && event.streams[0]) {
        remoteRef.current.srcObject =
          event.streams[0];
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        void sendSignal("call_ice", {
          candidate: event.candidate.toJSON(),
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") {
        // Terminal — the ICE stack gave up; there is no recovery path.
        // cleanup() clears errors, so the message is set after it.
        cleanup();

        setError("Call connection dropped.");
      } else if (pc.connectionState === "disconnected") {
        // Often transient (brief network blip); WebRTC usually recovers on
        // its own. Surface a soft warning without tearing the call down —
        // the previous behaviour killed good calls here.
        setError("Connection unstable — reconnecting media…");
      } else if (pc.connectionState === "connected") {
        // Recovered from a blip — clear any soft warning.
        if (statusRef.current !== "idle") {
          setError(null);
        }
      }
    };

    pcRef.current = pc;

    return pc;
  }, [cleanup, sendSignal]);

  // Place a call.
  const startCall = useCallback(async () => {
    setError(null);

    try {
      const pc = await prepareLocalMedia();

      const offer = await pc.createOffer();

      await pc.setLocalDescription(offer);

      setStatus("outgoing");

      // Serialize the SDP explicitly — some browsers do not include the
      // prototype-backed type/sdp attributes in JSON.stringify.
      const ok = await sendSignal("call_offer", {
        offer: {
          type: pc.localDescription!.type,
          sdp: pc.localDescription!.sdp,
        },
      });

      if (!ok) {
        cleanup();

        setError("Connection lost — could not start the call.");

        return;
      }

      // No-answer guard: if the callee never responds, end gracefully
      // instead of hanging on "Calling…" forever.
      if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current);
      }

      callTimeoutRef.current = setTimeout(() => {
        if (statusRef.current === "outgoing") {
          void sendSignal("call_end", {});

          cleanup();

          setError("No answer.");
        }
      }, 45000);
    } catch {
      // cleanup() clears errors, so the message is set after it.
      cleanup();

      setError("Couldn't access camera/microphone.");
    }
  }, [
    prepareLocalMedia,
    sendSignal,
    cleanup,
  ]);

  const pendingOfferRef =
    useRef<RTCSessionDescriptionInit | null>(
      null
    );

  const pendingCandidatesRef =
    useRef<RTCIceCandidateInit[]>([]);

  const flushCandidates = useCallback(
    async (pc: RTCPeerConnection) => {
      for (const candidate of
        pendingCandidatesRef.current) {
        try {
          await pc.addIceCandidate(
            new RTCIceCandidate(candidate)
          );
        } catch {
          // Tolerate invalid/out-of-order ICE candidates.
        }
      }

      pendingCandidatesRef.current = [];
    },
    []
  );

  const acceptCall = useCallback(async () => {
    const offer = pendingOfferRef.current;

    if (!offer) return;

    setIncoming(null);
    setError(null);

    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);

      callTimeoutRef.current = null;
    }

    try {
      const pc = await prepareLocalMedia();

      await pc.setRemoteDescription(
        new RTCSessionDescription(offer)
      );

      await flushCandidates(pc);

      const answer =
        await pc.createAnswer();

      await pc.setLocalDescription(answer);

      setStatus("in_call");

      // Serialize the SDP explicitly — some browsers do not include the
      // prototype-backed type/sdp attributes in JSON.stringify.
      const ok = await sendSignal("call_answer", {
        answer: {
          type: pc.localDescription!.type,
          sdp: pc.localDescription!.sdp,
        },
      });

      if (!ok) {
        cleanup();

        setError("Connection lost — could not answer the call.");
      }
    } catch {
      // cleanup() clears errors, so the message is set after it.
      cleanup();

      setError("Failed to join the call.");
    }
  }, [
    prepareLocalMedia,
    flushCandidates,
    sendSignal,
    cleanup,
  ]);

  const declineCall = useCallback(() => {
    void sendSignal("call_cancel", {});

    pendingOfferRef.current = null;

    cleanup();
  }, [sendSignal, cleanup]);

  const endCall = useCallback(() => {
    void sendSignal("call_end", {});

    cleanup();
  }, [sendSignal, cleanup]);

  const toggleAudio = () => {
    setAudioMuted((muted) => {
      const next = !muted;

      localStreamRef.current
        ?.getAudioTracks()
        .forEach((track) => {
          track.enabled = !next;
        });

      return next;
    });
  };

  const toggleVideo = () => {
    setVideoOff((off) => {
      const next = !off;

      localStreamRef.current
        ?.getVideoTracks()
        .forEach((track) => {
          track.enabled = !next;
        });

      return next;
    });
  };

  // Route incoming signaling frames.
  const handleFrame = useCallback(
    async (frame: {
      type: string;
      caller_user_id?: string;
      caller_name?: string;
      payload?: Record<string, unknown>;
    }) => {
      // The backend relays frames with the sender's id as a string; compare
      // against the string form of our own id so a numeric user id from the
      // auth context can never make us process our own signalling.
      if (
        !frame.caller_user_id ||
        frame.caller_user_id ===
          (myId == null ? null : String(myId))
      ) {
        return;
      }

      if (frame.type === "call_offer") {
        pendingOfferRef.current =
          (frame.payload
            ?.offer as RTCSessionDescriptionInit) ||
          null;

        pendingCandidatesRef.current = [];

        setIncoming({
          caller_user_id:
            frame.caller_user_id,
          caller_name:
            frame.caller_name ||
            "A team member",
        });

        setStatus("ringing");

        // Missed-call guard: stop ringing after 45s so a vanished caller
        // never leaves a stuck "Incoming call" overlay.
        if (callTimeoutRef.current) {
          clearTimeout(callTimeoutRef.current);
        }

        callTimeoutRef.current = setTimeout(() => {
          if (statusRef.current === "ringing") {
            pendingOfferRef.current = null;

            cleanup();

            setError("Missed call.");
          }
        }, 45000);

        return;
      }

      if (frame.type === "call_answer") {
        const pc = pcRef.current;

        const answer =
          frame.payload
            ?.answer as
            | RTCSessionDescriptionInit
            | undefined;

        if (pc && answer && pc.remoteDescription === null) {
          try {
            await pc.setRemoteDescription(answer);

            await flushCandidates(pc);

            setStatus("in_call");

            // The call is live — cancel the no-answer guard.
            if (callTimeoutRef.current) {
              clearTimeout(callTimeoutRef.current);

              callTimeoutRef.current = null;
            }
          } catch {
            // cleanup() clears errors, so the message is set after it.
            cleanup();

            setError("Call answer failed.");
          }
        } else if (!pc) {
          // An answer with no live peer connection means our call state was
          // reset (HMR remount, earlier error) — surface it instead of
          // silently hanging on "Calling…" forever.
          cleanup();

          setError("Call failed — please try again.");
        }

        return;
      }

      if (frame.type === "call_ice") {
        const candidate =
          frame.payload
            ?.candidate as
            | RTCIceCandidateInit
            | undefined;

        if (!candidate) return;

        const pc = pcRef.current;

        if (
          pc &&
          pc.remoteDescription
        ) {
          try {
            await pc.addIceCandidate(
              new RTCIceCandidate(candidate)
            );
          } catch {
            // Ignore out-of-order candidates.
          }
        } else {
          pendingCandidatesRef.current.push(
            candidate
          );
        }

        return;
      }

      if (
        frame.type === "call_end" ||
        frame.type === "call_cancel"
      ) {
        // statusRef avoids re-creating this handler (and re-attaching the
        // socket listener) on every status change.
        if (
          frame.type === "call_cancel" &&
          statusRef.current === "ringing"
        ) {
          cleanup();

          setError("The caller cancelled the call.");

          return;
        }

        if (
          frame.type === "call_cancel" &&
          statusRef.current === "outgoing"
        ) {
          cleanup();

          setError("Call declined.");

          return;
        }

        cleanup();

        return;
      }
    },
    [myId, cleanup, flushCandidates]
  );

  // ── Route incoming WebSocket frames to the call-signaling handler ──
  // The ReconnectingSocket's own onmessage (set up inside useChatStream)
  // handles chat frames (message, typing, badge_update). This listener
  // handles the call-signaling frames (call_offer, call_answer, call_ice,
  // call_end, call_cancel) that useChatStream silently ignores. Both
  // listeners coexist — addEventListener and the onmessage property are
  // independent in the browser's event model.
  useEffect(() => {
    if (!ws) return;

    const onMessage = (event: MessageEvent) => {
      try {
        const frame =
          typeof event.data === "string"
            ? JSON.parse(event.data)
            : event.data;
        if (frame && typeof frame === "object") {
          void handleFrame(frame as {
            type: string;
            caller_user_id?: string;
            caller_name?: string;
            payload?: Record<string, unknown>;
          });
        }
      } catch {
        // Ignore malformed frames — useChatStream's handler also swallows
        // parse errors, so there is nothing useful to surface here.
      }
    };

    ws.addEventListener("message", onMessage);
    return () => ws.removeEventListener("message", onMessage);
  }, [ws, handleFrame]);

  return {
    status,
    incoming,
    error,
    audioMuted,
    videoOff,

    localRef,
    remoteRef,

    startCall,
    acceptCall,
    declineCall,
    endCall,

    toggleAudio,
    toggleVideo,

    clearError: () => setError(null),

    handleFrame,
  };
}

// ---------------------------------------------------------------------------
// Call overlay UI
// ---------------------------------------------------------------------------

interface VideoCallOverlayProps {
  status: CallStatus;
  incoming: IncomingCall | null;
  error: string | null;
  name: string;
  audioMuted: boolean;
  videoOff: boolean;

  localRef: React.RefObject<HTMLVideoElement>;

  remoteRef: React.RefObject<HTMLVideoElement>;

  onAccept: () => void;
  onDecline: () => void;
  onEnd: () => void;

  onToggleAudio: () => void;
  onToggleVideo: () => void;

  onClearError: () => void;
}

export function VideoCallOverlay(
  props: VideoCallOverlayProps
) {
  const {
    status,
    incoming,
    error,
    name,
    audioMuted,
    videoOff,
    localRef,
    remoteRef,
    onAccept,
    onDecline,
    onEnd,
    onToggleAudio,
    onToggleVideo,
    onClearError,
  } = props;

  // When a call ends with an error we keep the overlay mounted (idle + error)
  // so the user actually sees what went wrong — the old code returned null on
  // "idle", instantly hiding every failure message.
  if (status === "idle" && !error) {
    return null;
  }

  // Post-call error banner (the call itself is already torn down).
  if (status === "idle") {
    return (
      <div className="fixed inset-x-0 top-4 z-[80] flex justify-center px-4">
        <button
          onClick={onClearError}
          className="rounded-full bg-red-600/95 px-5 py-2 text-sm font-semibold text-white shadow-pop"
        >
          {error}
        </button>
      </div>
    );
  }

  // Incoming call.
  if (
    status === "ringing" &&
    incoming
  ) {
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm animate-fade-in">
        <div className="relative w-full max-w-sm rounded-2xl border border-surface-line bg-white p-8 text-center shadow-pop animate-scale-in">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-violet-600 text-2xl font-extrabold text-white">
            {(
              incoming.caller_name || "?"
            )[0].toUpperCase()}
          </div>

          <h3 className="mt-4 text-lg font-bold text-ink">
            {incoming.caller_name}
          </h3>

          <p className="mt-1 flex items-center justify-center gap-2 text-sm text-slate-500">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            Incoming video call…
          </p>

          <div className="mt-6 flex items-center justify-center gap-4">
            <button
              onClick={onDecline}
              className="flex items-center gap-2 rounded-full bg-red-50 px-5 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-100"
            >
              <PhoneOff size={16} />
              Decline
            </button>

            <button
              onClick={onAccept}
              className="flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              <Phone size={16} />
              Accept
            </button>
          </div>
        </div>
      </div>
    );
  }

  const inCall =
    status === "in_call";

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-slate-950 animate-fade-in">
      
      {/* Remote video */}
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={remoteRef}
          autoPlay
          playsInline
          className="h-full w-full object-contain"
        />

        {!inCall && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-brand-600 to-violet-600 text-3xl font-extrabold text-white shadow-pop animate-pulse-soft">
              {name
                ? name[0].toUpperCase()
                : "?"}
            </div>

            <p className="text-sm font-semibold text-white">
              {status === "outgoing"
                ? "Calling…"
                : "Connecting…"}
            </p>
          </div>
        )}

        {error && (
          <div className="absolute inset-x-0 top-4 flex justify-center">
            <button
              onClick={onClearError}
              className="rounded-full bg-red-600/90 px-4 py-1.5 text-xs font-semibold text-white shadow-pop"
            >
              {error}
            </button>
          </div>
        )}

        {/* Local video PIP */}
        <div className="absolute right-3 top-3 h-40 w-28 overflow-hidden rounded-xl border-2 border-white/30 bg-slate-900 shadow-pop">
          <video
            ref={localRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
          />

          {videoOff && (
            <div className="absolute inset-0 flex items-center justify-center text-slate-400">
              <VideoOff size={22} />
            </div>
          )}
        </div>
      </div>

      {/* Call header */}
      <div className="flex items-center justify-between bg-slate-900 px-5 py-3">
        <p className="text-sm font-semibold text-white">
          Call with {name}
        </p>

        <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
          <span
            className={
              "h-2 w-2 rounded-full " +
              (inCall
                ? "bg-emerald-500 animate-pulse"
                : "bg-amber-500")
            }
          />

          {inCall
            ? "Live"
            : status === "outgoing"
              ? "Ringing"
              : "Incoming"}
        </span>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4 bg-slate-900 px-5 py-5">

        {/* Audio */}
        <button
          onClick={onToggleAudio}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          aria-label={
            audioMuted
              ? "Unmute"
              : "Mute"
          }
        >
          {audioMuted ? (
            <MicOff size={20} />
          ) : (
            <Mic size={20} />
          )}
        </button>

        {/* Video */}
        <button
          onClick={onToggleVideo}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          aria-label={
            videoOff
              ? "Turn camera on"
              : "Turn camera off"
          }
        >
          {videoOff ? (
            <VideoOff size={20} />
          ) : (
            <Video size={20} />
          )}
        </button>

        {/* End call */}
        <button
          onClick={onEnd}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700"
          aria-label="End call"
        >
          <PhoneOff size={20} />
        </button>

        {/* Close */}
        <button
          onClick={onClearError}
          className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-slate-300 hover:bg-white/20"
          aria-label="Close"
        >
          <X size={16} />
        </button>

      </div>
    </div>
  );
}