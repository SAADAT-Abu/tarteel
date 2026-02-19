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
}

export interface TonightRooms {
  ramadan_night: number;
  isha_utc: string;
  isha_bucket_utc: string;
  rooms: RoomSlot[];
  registered_users: Record<string, number>; // e.g. {"8_1.0": 12, "8_0.5": 5}
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
