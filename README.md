===== README =====
1. ai-controller : So, this is a folder for all types of hardware running locally and connected to an existing database. This folder is used to activate the camera and analyze the data, then output it to the Arduino.
2. smart-door-admin : A web dashboard that connects the web to a database for registering new faces and viewing logs. The webpage can be viewed at face-door-recog.vercel.app


# Anzen Smart Door — Admin Panel

A React + Firebase admin panel for a smart door lock system with facial recognition.

## Features

- **Dashboard** — Real-time door status, system health, and weekly activity chart
- **Door Control** — Remote lock/unlock with 5-second auto-lock
- **Access Logs** — Chronological log of all door events and face recognition results
- **Guest Passes** — Generate time-limited QR codes for visitors (cryptographically secure)
- **Face Registration** — Enroll new users for face ID access

## Stack

- React 19 + TypeScript + Vite
- Firebase Realtime Database + Firebase Auth
- Tailwind CSS + shadcn/ui
- Framer Motion (motion/react)

## Setup

**Prerequisites:** Node.js 18+

1. Install dependencies:
   ```
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill in your Firebase config:
   ```
   cp .env.example .env.local
   ```

3. Run the dev server:
   ```
   npm run dev
   ```

## Firebase Database Schema

```
/door_status       — "Open" | "Closed" | "Unlocked"
/door_commands/    — Queue of OPEN/CLOSE commands for the edge hub
/logs/             — Access event log entries
/registered_face/  — Enrolled face ID profiles
/guest_tokens/     — Temporary guest pass codes
/system_health     — Heartbeat + component status from the Python edge hub
```

## Security Notes

- Guest pass tokens use `crypto.getRandomValues()` for cryptographic randomness
- Tokens expire automatically and can be manually revoked
- All door commands are logged with the requesting user's email
