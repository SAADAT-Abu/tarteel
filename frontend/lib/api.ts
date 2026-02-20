import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
  withCredentials: true, // Send httpOnly cookie with every request
});

// Types
export interface User {
  id: string;
  email: string;
  name: string | null;
  city: string | null;
  country: string | null;
  timezone: string | null;
  calc_method: number;
  rakats: number;
  juz_per_night: number;
  preferred_reciter: string;
  phone: string | null;
  notify_whatsapp: boolean;
  notify_email: boolean;
  notify_minutes_before: number;
  is_active: boolean;
  current_streak: number;
  longest_streak: number;
  last_attended_night: number | null;
}

export interface RoomSlot {
  id: string;
  isha_bucket_utc: string;
  ramadan_night: number;
  rakats: number;
  juz_per_night: number;
  juz_number: number;
  juz_half: number | null;
  reciter: string;
  status: "scheduled" | "building" | "live" | "completed";
  stream_path: string | null;
  participant_count: number;
  started_at: string | null;
  ended_at: string | null;
  is_private: boolean;
  creator_id: string | null;
  invite_code: string | null;
}

export interface Friend {
  id: string;
  name: string | null;
  email: string;
  status: string;
  created_at: string;
}

export interface FriendsResponse {
  friends: Friend[];
  pending_incoming: Friend[];
  pending_outgoing: Friend[];
}

export interface PrivateRoom {
  id: string;
  status: string;
  rakats: number;
  juz_number: number;
  juz_per_night: number;
  invite_code: string | null;
  participant_count: number;
  started_at: string | null;
  role: "creator" | "invitee";
}

export interface TonightRooms {
  ramadan_night: number;
  isha_utc: string;
  isha_bucket_utc: string;
  rooms: RoomSlot[];
  registered_users?: Record<string, number>; // e.g. {"8_1.0": 12, "8_0.5": 5}
}

// Auth
export const authApi = {
  register: (data: Record<string, unknown>) =>
    api.post<{ access_token: string; user: User }>("/auth/register", data),
  login: (email: string, password: string) =>
    api.post<{ access_token: string; user: User }>("/auth/login", { email, password }),
};

// Rooms
export const roomsApi = {
  getTonight: () => api.get<TonightRooms>("/rooms/tonight"),
  getRoom: (id: string) => api.get<RoomSlot>(`/rooms/${id}`),
  joinRoom: (id: string) => api.post(`/rooms/${id}/join`),
};

// Users
export const usersApi = {
  getMe: () => api.get<User>("/users/me"),
  updateMe: (data: Partial<User>) => api.put<User>("/users/me", data),
};

// Friends
export const friendsApi = {
  search: (q: string) => api.get<{ id: string; name: string | null; email: string }[]>(`/users/search?q=${encodeURIComponent(q)}`),
  getAll: () => api.get<FriendsResponse>("/friends"),
  send: (userId: string) => api.post(`/friends/${userId}`),
  accept: (userId: string) => api.patch(`/friends/${userId}/accept`),
  remove: (userId: string) => api.delete(`/friends/${userId}`),
};

// Private rooms
export const privateRoomsApi = {
  create: (data: { rakats: number; juz_number: number; juz_per_night: number }) =>
    api.post<{ id: string; invite_code: string; status: string; room_url: string }>("/private-rooms", data),
  list: () => api.get<{ created: PrivateRoom[]; invited: PrivateRoom[] }>("/private-rooms"),
  invite: (roomId: string, friendId: string) => api.post(`/private-rooms/${roomId}/invite/${friendId}`),
  start: (roomId: string) => api.post<{ status: string; stream_url?: string | null }>(`/private-rooms/${roomId}/start`),
  delete: (roomId: string) => api.delete(`/private-rooms/${roomId}`),
};

// Utility
export const RECITER_NAMES: Record<string, string> = {
  Alafasy_128kbps: "Mishary Rashid Alafasy",
  "Abdurrahmaan_As-Sudais_192kbps": "Abdurrahman As-Sudais",
  Abdul_Basit_Murattal_192kbps: "Abdul Basit",
  Maher_AlMuaiqly_128kbps: "Maher Al-Muaiqly",
  Yasser_Ad_Dussary_128kbps: "Yasser Ad-Dussary",
  "Abu_Bakr_Ash-Shaatree_128kbps": "Abu Bakr Ash-Shaatree",
};

export const ROOM_DURATION: Record<string, number> = {
  "8_1.0": 45,
  "8_0.5": 25,
  "20_1.0": 90,
  "20_0.5": 50,
};
