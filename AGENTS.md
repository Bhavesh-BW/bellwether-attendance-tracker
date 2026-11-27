# Local development

- Run `bash start.sh` to start the Python dashboard and local MediaMTX relay. Python dependencies, FFmpeg and MediaMTX must already be installed.
- The dashboard defaults to http://localhost:8199. Local MediaMTX uses RTSP 8554, WebRTC HTTP 8889, ICE UDP 8189 and control API 9997, bound to loopback.
- Camera recognition and browser playback are separate pipelines. Check `/api/cameras` for camera ingestion and `http://127.0.0.1:9997/v3/paths/list` for ready annotated paths (`staff_hud`, `staff_exit_hud`).
- Verify launcher syntax with `bash -n start.sh`, Python syntax with `python3 -c "import ast,pathlib; ast.parse(pathlib.Path('backend/face_tracker.py').read_text())"` and whitespace with `git diff --check`.
- Detection crops and attendance records are stored in `backend/face_tracker.db`; do not delete or reset this database while debugging streams.
