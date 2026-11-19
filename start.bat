@echo off
title GoDezk AI Attendance Tracker - Multi-Org Enterprise Edition
echo ======================================================================
echo   GoDezk AI Attendance Tracker - Multi-Org Enterprise Edition
echo   Opening at: http://localhost:8198
echo ======================================================================
cd /d "%~dp0backend"
python face_tracker.py
pause
