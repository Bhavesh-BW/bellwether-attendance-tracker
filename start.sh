#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/backend"
if ! curl --silent --fail --max-time 2 http://127.0.0.1:9997/v3/config/global/get >/dev/null; then
    if ! command -v mediamtx >/dev/null; then
        echo "MediaMTX is required for live video. Install it before starting."
        exit 1
    fi
    MTX_API=yes MTX_APIADDRESS=127.0.0.1:9997 \
    MTX_RTSPADDRESS=127.0.0.1:8554 MTX_RTSPTRANSPORTS=tcp \
    MTX_WEBRTCADDRESS=127.0.0.1:8889 MTX_WEBRTCLOCALUDPADDRESS=127.0.0.1:8189 \
    MTX_WEBRTCADDITIONALHOSTS=127.0.0.1,localhost \
    MTX_RTMP=no MTX_HLS=no MTX_SRT=no MTX_MOQ=no \
    MTX_PATHS_ALL_OTHERS_SOURCE=publisher mediamtx &
    relay_pid=$!
    trap 'kill "$relay_pid" 2>/dev/null || true' EXIT
    for attempt in {1..30}; do
        curl --silent --fail --max-time 1 http://127.0.0.1:9997/v3/config/global/get >/dev/null && break
        sleep 0.2
    done
    curl --silent --fail --max-time 2 http://127.0.0.1:9997/v3/config/global/get >/dev/null
fi
echo "Starting Staff Attendance Tracker on http://localhost:${PORT:-8199}..."
python3 face_tracker.py
