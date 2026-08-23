# Desktop Shell (Tauri v2)

This package hosts the desktop shell for TikZ Editor using Tauri v2.

## Scripts

- `npm run -w @tikz-editor/desktop dev` runs the Vite frontend on port 1420.
- `npm run -w @tikz-editor/desktop tauri:dev` runs the full Tauri desktop app.
- `npm run -w @tikz-editor/desktop tauri:build` creates desktop bundles.
- `npm run -w @tikz-editor/desktop test:e2e` runs real desktop e2e against a built binary (requires `tauri-driver` in PATH).
