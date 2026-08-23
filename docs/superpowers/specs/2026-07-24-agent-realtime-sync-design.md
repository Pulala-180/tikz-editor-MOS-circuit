# AI Realtime Sync Workflow Design

## Purpose
To enable a seamless, automated workflow where an AI agent (Antigravity) can generate or modify TikZ code in the background, and the local TikZ Editor browser instance updates immediately in real-time without manual file picking or page refreshes.

## Approach: Vite HMR Inject
Instead of relying on the browser's FileSystem Access API (which requires manual user interaction to grant permissions per session), this design leverages Vite's existing WebSocket infrastructure used for Hot Module Replacement (HMR).

## Components

### 1. File Watcher & WebSocket Emitter (Server-Side)
- **Location:** `apps/web/vite.config.ts` (or a custom Vite plugin imported there).
- **Behavior:** 
  - Uses Vite's `configureServer` hook.
  - Sets up a file watcher (e.g. using `fs.watch` or Vite's `server.watcher`) on a dedicated directory: `apps/web/agent-sync/`.
  - When `active-drawing.tex` within that folder is created or modified, the plugin reads its content.
  - The plugin sends a custom WebSocket message to the client: `server.ws.send('agent:update-code', { source: <file-content> })`.

### 2. HMR Listener & State Dispatcher (Client-Side)
- **Location:** `apps/web/src/main.tsx` or a dedicated platform integration file like `packages/app/src/platform/browser-hmr-sync.ts`.
- **Behavior:**
  - In development mode only (`if (import.meta.hot)`), listens for the custom event `agent:update-code`.
  - Upon receiving the event, it accesses the editor's global state store (e.g., via the Redux/Zustand store or dispatching a DOM event caught by the editor).
  - Updates the active document's `source` state, immediately triggering a re-render of the TikZ graphic and the source code panel.

## Scope & Constraints
- This is strictly a development-time workflow enhancement. It does not affect production builds.
- Assumes the AI agent will output its TikZ code exclusively to `apps/web/agent-sync/active-drawing.tex`.
- The system gracefully handles the absence of the sync directory (it won't crash if the folder is missing).

## Verification
- Run `npm run dev:web`.
- Echo new TikZ code into `apps/web/agent-sync/active-drawing.tex`.
- Observe the browser instance at `http://localhost:5173/` updating instantly.
