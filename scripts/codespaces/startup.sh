#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "[codespaces] Starting desktop setup (CI parity)..."

if ! command -v rustup >/dev/null 2>&1; then
  echo "[codespaces] rustup not found; installing rustup and stable toolchain..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain stable
  export PATH="$HOME/.cargo/bin:$PATH"
else
  echo "[codespaces] Ensuring Rust stable toolchain is installed..."
  rustup toolchain install stable --profile minimal
  rustup default stable
fi

echo "[codespaces] Installing Tauri Linux dependencies..."
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  webkit2gtk-driver \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  patchelf \
  xvfb

echo "[codespaces] Installing npm dependencies..."
cd "$ROOT_DIR"
npm ci

if ! cargo install --list | grep -q '^tauri-driver v'; then
  echo "[codespaces] Installing tauri-driver..."
  cargo install tauri-driver --locked
else
  echo "[codespaces] tauri-driver already installed; skipping install."
fi

echo "[codespaces] Building desktop app (no bundle)..."
npm run -w @tikz-editor/desktop tauri:build -- --no-bundle

echo "[codespaces] Setup complete."
