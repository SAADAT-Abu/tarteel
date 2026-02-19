import { io, Socket } from "socket.io-client";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "http://localhost:8000";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket || !socket.connected) {
    // The server reads the auth token from the httpOnly cookie directly via
    // the HTTP handshake — no need to pass the token in the auth object.
    // withCredentials ensures the cookie is sent with the Socket.IO handshake.
    socket = io(WS_URL, {
      withCredentials: true,
      transports: ["websocket", "polling"],
      autoConnect: true,
    });
  }
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export type RoomEvent =
  | { type: "room_joined"; payload: { room_id: string; participant_count: number; status: string } }
  | { type: "room_started"; payload: { stream_url: string } }
  | { type: "participant_update"; payload: { count: number } }
  | { type: "rakah_update"; payload: { current_rakah: number; total_rakats: number } }
  | { type: "room_ended"; payload: Record<string, never> };
