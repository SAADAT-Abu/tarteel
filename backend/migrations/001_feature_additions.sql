-- Migration: Feature additions
-- Run this against your PostgreSQL database to apply schema changes.
-- New tables will be created automatically by SQLAlchemy on startup.
-- This script handles columns added to existing tables.

-- ── Streaks (add to users table) ─────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS longest_streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_attended_night SMALLINT;

-- ── Private rooms (add to room_slots table) ───────────────────────────────────
ALTER TABLE room_slots ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE room_slots ADD COLUMN IF NOT EXISTS creator_id UUID REFERENCES users(id);
ALTER TABLE room_slots ADD COLUMN IF NOT EXISTS invite_code VARCHAR(12) UNIQUE;

-- ── New tables ────────────────────────────────────────────────────────────────
-- (Created automatically by SQLAlchemy Base.metadata.create_all on startup)
-- friendships: requester_id, addressee_id, status, created_at
-- private_room_invites: room_slot_id, user_id, status, invited_at
