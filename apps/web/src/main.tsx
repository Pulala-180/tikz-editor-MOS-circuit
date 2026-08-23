import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { useEditorStore } from "@tikz-editor/app";
import { setActiveEditorPlatform } from "@tikz-editor/app/platform/current";
import { createBrowserPlatformAdapter } from "./platform/browser-platform";

export function registerAgentSyncHMR(hot: any) {
  hot.on("agent:update-code", (data: { source: string }) => {
    useEditorStore.getState().dispatch({
      type: "CODE_EDITED",
      source: data.source
    });
  });
  if (hot.send) {
    hot.send("agent:request-code");
  }
}

if (import.meta.hot) {
  registerAgentSyncHMR(import.meta.hot);
}

async function bootstrap() {
  setActiveEditorPlatform(createBrowserPlatformAdapter());
  const { App } = await import("@tikz-editor/app");

  const rootElement = typeof document !== "undefined" ? document.getElementById("root") : null;
  if (!rootElement) return;

  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

void bootstrap();

