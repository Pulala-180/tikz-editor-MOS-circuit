# Agent Realtime Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Vite-based realtime synchronization channel allowing an external AI agent to write TikZ code to a local directory and instantly see the results in the web editor without a page refresh.

**Architecture:** A Vite dev-server plugin watches `apps/web/agent-sync/active-drawing.tex`. Upon changes, it broadcasts a custom `agent:update-code` event via Vite's WebSocket. The React client (`main.tsx`) listens for this HMR event and dispatches a `CODE_EDITED` action to the global `useEditorStore`.

**Tech Stack:** Vite, React, Zustand (store), chokidar (Vite's built-in file watcher).

## Global Constraints

- Code modifications should strictly be development-only (must not break production build).
- HMR client code should be guarded by `if (import.meta.hot)`.
- Use exact imports following the existing project patterns.

---

### Task 1: Expose the Editor Store

**Files:**
- Modify: `packages/app/src/index.ts`

**Interfaces:**
- Produces: `useEditorStore` export so that `main.tsx` can dispatch actions.

- [ ] **Step 1: Export useEditorStore from the app index**

Modify `packages/app/src/index.ts` to export `useEditorStore`.

```typescript
export { useEditorStore } from "./store/store.js";
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/index.ts
git commit -m "feat(app): export useEditorStore for external dispatch"
```

---

### Task 2: Create the Vite Sync Plugin

**Files:**
- Create: `apps/web/agent-sync-plugin.ts`

**Interfaces:**
- Consumes: Vite plugin API (`configureServer`).
- Produces: A default exported Vite plugin function.

- [ ] **Step 1: Write the Vite plugin implementation**

Create `apps/web/agent-sync-plugin.ts`:

```typescript
import fs from "fs";
import path from "path";
import type { Plugin } from "vite";

export default function agentSyncPlugin(): Plugin {
  return {
    name: "agent-sync-plugin",
    configureServer(server) {
      const syncDir = path.resolve(__dirname, "agent-sync");
      const targetFile = path.resolve(syncDir, "active-drawing.tex");

      // Ensure directory exists
      if (!fs.existsSync(syncDir)) {
        fs.mkdirSync(syncDir, { recursive: true });
      }

      server.watcher.add(syncDir);

      server.watcher.on("change", (file) => {
        if (file === targetFile) {
          try {
            const content = fs.readFileSync(targetFile, "utf-8");
            server.ws.send("agent:update-code", { source: content });
          } catch (e) {
            console.error("Failed to read agent sync file", e);
          }
        }
      });
    }
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/agent-sync-plugin.ts
git commit -m "feat(web): add agent-sync-plugin for Vite"
```

---

### Task 3: Integrate Plugin into Vite Config

**Files:**
- Modify: `apps/web/vite.config.ts`

**Interfaces:**
- Consumes: `agentSyncPlugin` from `agent-sync-plugin.ts`.

- [ ] **Step 1: Register the plugin in vite.config.ts**

Import and add the plugin to the `plugins` array in `apps/web/vite.config.ts`.

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import agentSyncPlugin from "./agent-sync-plugin";

const profilingBuild = process.env.TIKZ_PROFILE_BUILD === "1";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/editor/web/" : "/",
  plugins: [react(), agentSyncPlugin()],
  // ... rest of the file
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/vite.config.ts
git commit -m "feat(web): register agent-sync-plugin in vite config"
```

---

### Task 4: Client-Side HMR Listener

**Files:**
- Modify: `apps/web/src/main.tsx`

**Interfaces:**
- Consumes: `import.meta.hot`, `useEditorStore` from `@tikz-editor/app`.

- [ ] **Step 1: Implement the HMR listener in main.tsx**

Add the listener code before `void bootstrap();` in `apps/web/src/main.tsx`.

```typescript
import { useEditorStore } from "@tikz-editor/app";

// ... existing code ...

if (import.meta.hot) {
  import.meta.hot.on("agent:update-code", (data) => {
    useEditorStore.getState().dispatch({
      type: "CODE_EDITED",
      source: data.source
    });
  });
}

void bootstrap();
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/main.tsx
git commit -m "feat(web): listen for agent:update-code HMR event to update store"
```
