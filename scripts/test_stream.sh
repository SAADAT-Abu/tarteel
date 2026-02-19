#!/bin/bash
# Quick test: manually build and start a stream for a room
# Usage: ./scripts/test_stream.sh <room_id>

ROOM_ID=${1:-"test-room-$(date +%s)"}
BASE_URL="http://localhost:8000"

echo "Testing stream for room: $ROOM_ID"

# 1. Trigger playlist build
echo "→ Building playlist..."
curl -s -X POST "$BASE_URL/admin/rooms/$ROOM_ID/build-playlist" | python3 -m json.tool

# 2. Trigger stream start
echo "→ Starting stream..."
curl -s -X POST "$BASE_URL/admin/rooms/$ROOM_ID/start-stream" | python3 -m json.tool

echo "→ Stream should be at: $BASE_URL/hls/$ROOM_ID/stream.m3u8"
echo "→ Test in browser or: ffplay $BASE_URL/hls/$ROOM_ID/stream.m3u8"
