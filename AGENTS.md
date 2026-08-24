# AI Agent Workflow & Developer Guide (TikZ Editor MOS Edition)

This document provides system instructions for AI coding assistants (Cursor, Claude Code, Antigravity, GitHub Copilot, Devin, etc.) and developers interacting with this repository.

---

## ⚡ Quick Start & Run Instructions

To automatically install dependencies and run the development environment:

```bash
# 1. Install all monorepo dependencies
npm install

# 2. Start the web development server (with automatic browser launch)
npm run dev
```

- **Local Web Server**: [http://localhost:8888/](http://localhost:8888/)
- **Network Access**: Bindable to LAN via `host: true`.

---

## 📁 Repository Structure

```
├── apps/
│   ├── web/           # Web entry point (Vite + React 19 + agent-sync-plugin)
│   ├── desktop/       # Desktop entry point (Tauri + Vite)
│   └── landing/       # Landing website
├── packages/
│   ├── app/           # Core UI components, canvas renderer, toolbar, store
│   ├── core/          # TikZ AST parser, geometric engines, wire-following engine
│   ├── lang-tikz/     # CodeMirror TikZ language support
│   └── lezer-tikz/    # Lezer parser for TikZ grammar
├── Sketch/            # Saved .tex circuit drafts and examples (OTA, CS stages, etc.)
├── scripts/           # MCP bridge server, CPU profiling, and test fixtures
├── 一键启动.bat       # Windows 1-click launch script for users
└── start.bat          # English 1-click launch script
```

---

## 🛠️ Key Build & Test Commands

- **Build packages & start dev**: `npm run dev`
- **Build web for production**: `npm run -w @tikz-editor/web build`
- **Compile Lezer grammar**: `npm run -w @tikz-editor/lezer-tikz build`
- **Run all E2E tests**: `npm run -w @tikz-editor/web test:e2e`

---

## 🤖 Agent Real-time Sync & Integration

This project includes a built-in WebSocket & file sync bridge in `apps/web/agent-sync-plugin.ts`:
- Any `.tex` file saved in `Sketch/active-drawing/active-drawing.tex` or `apps/web/agent-sync/active-drawing.tex` will automatically trigger real-time hot-reloading in the browser canvas.
- The UI exposes `useEditorStore` and WebSocket channel `agent:update-code` to inject TikZ code programmatically.
