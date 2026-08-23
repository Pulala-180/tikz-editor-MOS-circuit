import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { setActiveEditorPlatform } from "@tikz-editor/app/platform/current";
import { createBrowserPlatformAdapter } from "./platform/browser-platform";

setActiveEditorPlatform(createBrowserPlatformAdapter());

export function registerAgentSyncHMR(hot: any) {
  hot.on("agent:update-code", async (data: { source: string }) => {
    const { useEditorStore } = await import("@tikz-editor/app");
    useEditorStore.getState().dispatch({
      type: "CODE_EDITED",
      source: data.source
    });
  });
}

if (import.meta.hot) {
  registerAgentSyncHMR(import.meta.hot);
}

async function bootstrap() {
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

