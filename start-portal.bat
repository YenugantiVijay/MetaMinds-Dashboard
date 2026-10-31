@echo off
title MetaMinds Portal Dev Server
echo ====================================================
echo Starting MetaMinds Pvt. Ltd. Development Environment
echo ====================================================
echo Backend API : http://localhost:3001
echo Frontend App: http://localhost:5173
echo.
echo Launching browser in 3 seconds...
start "" http://localhost:5173
npm run dev
