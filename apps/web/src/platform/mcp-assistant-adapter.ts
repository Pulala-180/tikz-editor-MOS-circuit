import type { AssistantApi, AssistantEvent, AssistantAccountSnapshot, AssistantTurnStatus } from "@tikz-editor/app/platform/types";
import { McpWebSocketClient } from "./mcp-websocket-client";

export function createMcpAssistantAdapter(): AssistantApi {
  const client = new McpWebSocketClient("ws://localhost:3100");
  client.connect();

  let globalEventHandler: ((event: AssistantEvent) => void) | null = null;
  
  // Track state to satisfy UI requirements
  let currentTurnStatus: AssistantTurnStatus = "idle";
  let lastError: string | null = null;

  client.subscribe((event) => {
    if (!globalEventHandler) return;

    // Use a fixed document ID for simplicity in Web
    const documentId = "web-document-1";

    switch (event.type) {
      case "delta":
        globalEventHandler({
          type: "item-delta",
          documentId,
          itemId: "current-turn",
          deltaType: event.deltaType,
          delta: event.content,
        });
        break;
      case "source-updated":
        globalEventHandler({
          type: "source-updated",
          documentId,
          source: event.source,
          revisionToken: crypto.randomUUID(),
        });
        break;
      case "turn-status":
        currentTurnStatus = event.status;
        lastError = event.error || null;
        globalEventHandler({
          type: "turn-status",
          documentId,
          turnId: "current-turn",
          status: event.status,
          error: lastError,
        });
        
        // Emulate item-completed when done
        if (event.status === "completed" || event.status === "failed" || event.status === "interrupted") {
          globalEventHandler({
            type: "item-completed",
            documentId,
            item: {
              type: "agentMessage",
              id: "current-turn",
              text: "", // UI will use the accumulated delta
            }
          });
        }
        break;
      case "error":
        globalEventHandler({
          type: "error",
          documentId,
          message: event.message,
        });
        break;
    }
  });

  return {
    startTurn: async (params) => {
      // The AssistantPanel UI needs to see this turn starting
      const turnId = "current-turn";
      
      // Start the item
      if (globalEventHandler) {
        globalEventHandler({
          type: "item-started",
          documentId: params.documentId,
          item: {
            type: "agentMessage",
            id: turnId,
            text: ""
          }
        });
      }

      client.sendChatMessage({
        threadId: params.threadId || "default",
        prompt: params.prompt,
        context: {
          source: params.source,
          pngBase64: params.pngBase64 || undefined,
          figureContext: params.figureContext || undefined,
          diagnosticsText: params.diagnosticsText || undefined,
        },
        model: params.model || undefined,
      });

      return { turnId };
    },

    interruptTurn: async () => {
      client.sendInterrupt();
    },

    bindEvents: (handler) => {
      globalEventHandler = handler;
      
      // Tell UI we are "logged in" since MCP handles auth
      handler({
        type: "account-updated",
        authMode: "mcp-local",
      });

      return () => {
        globalEventHandler = null;
      };
    },

    // MCP bridge supports these directly
    checkCodexStatus: async () => ({
      installed: true,
      hasNpm: false,
      hasBrew: false,
      hasWsl: false,
    }),

    listModels: async () => [
      { id: "gpt-4o", label: "GPT-4o (MCP)" },
      { id: "claude-3-5-sonnet-20240620", label: "Claude 3.5 Sonnet (MCP)" },
      { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro (MCP)" },
    ],

    // Mock auth methods to keep UI happy
    readAccount: async () => ({
      name: "MCP Local User",
      email: "local@mcp",
    }),
    
    readAccountSnapshot: async () => ({
      account: { name: "MCP Local User" },
      rateLimits: null,
    }),

    // No-op for things we don't support in simple MCP
    ensureDocumentThread: async (params) => ({
      threadId: "default",
      workspacePath: "",
      figurePath: "",
      previewPath: "",
    }),
    
    warmUp: async () => {},
  };
}
