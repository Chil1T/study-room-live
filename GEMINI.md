# Gemini Context File (GEMINI.md)

This file serves as a context anchor for the Gemini CLI agent. It describes the project's architecture, key components, and current development status.

## Project Identity

- **Name**: Bilibili Study Room Live (study-room-live)
- **Type**: Interactive Live Streaming Plugin (Node.js + Web Overlay)
- **Goal**: Allow viewers to send Danmu (bullet comments) to "clock in" for study sessions, displayed on OBS via browser sources.

## Architecture

### 1. Backend (Node.js/TypeScript)

- **Entry**: `src/main.ts` - Initializes clients and servers.
- **Core Engine**: `src/core/bilibili/`
  - `client.ts`: Handles Bilibili Open Platform API (HTTP/WS), Heartbeats, and Signatures.
  - `protocol.ts`: Decodes binary WebSocket packets (Zlib).
- **Database**: `src/core/database/repository.ts`
  - Uses `better-sqlite3`.
  - Table: `daka_records` (Stores user sessions, duration, target_duration).
  - **Methods**: `searchUserStats(query)` creates aggregated stats for users by UID or Username.
- **Service Layer**:
  - `src/services/StudyService.ts`:
    - **Brain of the app**.
    - Parses Danmu regex (e.g., `打卡 数学 60`).
    - Handles Widget Commands: `专注统计` (Stats), `AI报告` (AI Summary).
    - Manages session lifecycle (Start -> Check Loop -> Auto Complete -> Delayed End).
    - Broadcasts events to local WebSocket (`STATE_UPDATE`, `WIDGET_STATS`, `WIDGET_AI`).
  - `src/services/AIService.ts`:
    - Handles communication with AI providers (OpenAI compatible).
    - Uses prompts configured in `.env`.
- **Interfaces**:
  - **HTTP**: `src/api/http/server.ts` (Express, Port 3000) - Serves static files and API (`/api/stats`, `/api/ai`).
  - **WebSocket**: `src/api/websocket/server.ts` (ws, Port 23335) - Pushes real-time state to overlays.

### 2. Frontend (OBS Overlay)

- **Study Timer**: `public/index.html` - Chalkboard style, shows progress.
- **Leaderboard**: `public/stats.html` - Cyberpunk style, 3D transform, lists sessions.
- **AI Wingman Widget**: `public/ai_widget.html`
  - **Style**: **Transparent + 80° Parallelogram + Extra Bold Typography**. No background/border, floating text.
  - **Logic**:
    - **Idle**: Persistent Clock (Large), Date, and Hint (`> Awaiting Input_`).
    - **Active**: Shows Stats Card (Duration/Sessions split) or AI Report (Typewriter effect) on command.
    - **Tech**: Alpine.js, Queue system, Fixed Height (h-80).
  - **Styles**:
    - **Fonts**: `Chakra Petch` (Numbers/English) + `Noto Sans SC` (Chinese), ensuring bold weight consistency.
    - **Layout**: Compact vertical spacing, top-aligned to prevent shifting.

### 3. Data & Configuration

- **Config API**: `/api/config` (GET/POST)
  - Manages `.env` persistence for `DISPLAY_DURATION_WIDGET`, `DISPLAY_DURATION_INDEX`, `AI_PROMPT_WIDGET`.
- **Sync**: Backend broadcasts state on new WebSocket connections ensuring `index.html` initiates correctly (Sleeping Cat vs Active).

## Key Data Flows

1. **Clock In**: User sends `打卡` -> Bilibili WS -> `StudyService` -> `Repository` -> `LocalWS` -> `index.html`.
2. **Widget Stats**: User sends `专注统计` -> `StudyService` -> `Repository` (Aggregated) -> `LocalWS` (`WIDGET_STATS`) -> `ai_widget.html`.
3. **Widget AI**: User sends `AI报告` -> `StudyService` -> `AIService` (Gen Text) -> `LocalWS` (`WIDGET_AI`) -> `ai_widget.html`.

## Environment Variables (.env)

- `BILIBILI_*`: API Creds.
- `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`: AI Provider config.
- `AI_PROMPT_ADMIN`: Prompt for Admin Dashboard summaries.
- `AI_PROMPT_WIDGET`: Prompt for the concise, "toxic" or "praise" style widget reports.

## Current Status (2026-01-07)

- [x] Core Backend (Bilibili Connection)
- [x] Database Migration & Aggregation (Search by Name/UID)
- [x] Study Timer UI (`index.html`)
  - [x] **Sleeping Cat Empty State**: Chalk-style SVG animation when room is empty.
  - [x] Top-aligned layout to avoid text crowding.
- [x] Leaderboard UI (`stats.html`)
  - [x] Fixed OBS transparency flickering.
- [x] Admin Dashboard (`admin.html`)
  - [x] **System Config Panel**: Edit display durations (seconds) and AI prompts.
  - [x] Fixed layout/script syntax issues.
- [x] **AI Wingman Widget (`ai_widget.html`)**
  - [x] Loading state animation.
  - [x] Dynamic display duration controls.
- [x] **Historical Stats Query (Native)**
  - [x] **Database Optimization**: Added indexes for `uid`, `user`, `date` to ensure millisecond-level queries even with 10k+ records.
- [x] **Operations & Tooling**
  - [x] **Start Script (`start.bat`)**: One-click startup, auto-install dependencies, and auto-open Admin Dashboard.
  - [x] **Performance Testing**: Added `seed_data.ts` and `clean_data.ts` for stress testing.
  - [x] **Admin enhancements**: Added "Restore Defaults" button for system config.
