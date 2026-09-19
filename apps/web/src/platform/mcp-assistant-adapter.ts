import type {
  AssistantApi,
  AssistantEvent,
  AssistantAccountSnapshot,
  AssistantTurnStatus,
  AssistantThreadSummary,
} from "@tikz-editor/app/platform/types";
import {
  McpWebSocketClient,
  DEFAULT_ANTIGRAVITY_MODELS,
} from "./mcp-websocket-client";

export const READY_ACCOUNT_DATA = {
  requiresOpenaiAuth: false,
  account: {
    name: "Antigravity Local User",
    email: "local@antigravity",
    type: "local",
  },
};

export const READY_ACCOUNT_SNAPSHOT: AssistantAccountSnapshot = {
  account: READY_ACCOUNT_DATA,
  rateLimits: null,
};

export interface McpAssistantApi extends AssistantApi {
  getAccountSnapshot: () => Promise<AssistantAccountSnapshot | null>;
  getClient: () => McpWebSocketClient;
}

export function createMcpAssistantAdapter(wsUrl = "ws://localhost:3100"): McpAssistantApi {
  const client = new McpWebSocketClient(wsUrl);
  client.connect();

  const subscribers = new Set<(event: AssistantEvent) => void>();

  function dispatchEvent(event: AssistantEvent) {
    for (const handler of Array.from(subscribers)) {
      try {
        handler(event);
      } catch (err) {
        console.error("[MCP Assistant Adapter] Error in event handler:", err);
      }
    }
  }

  // Track active document, turn and stream content to satisfy UI requirements
  let currentDocumentId = "web-document-1";
  let currentTurnId: string | null = null;
  let currentTurnStatus: AssistantTurnStatus = "idle";
  let currentTurnText = "";
  let lastError: string | null = null;

  client.subscribe((event) => {
    const docId = currentDocumentId || "web-document-1";
    const turnId = currentTurnId || "current-turn";

    switch (event.type) {
      case "delta":
        currentTurnText += event.content;
        dispatchEvent({
          type: "item-delta",
          documentId: docId,
          itemId: turnId,
          deltaType: event.deltaType || "item/agentMessage/delta",
          delta: event.content,
        });
        break;

      case "source-updated":
        dispatchEvent({
          type: "source-updated",
          documentId: docId,
          source: event.source,
          revisionToken:
            typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
              ? crypto.randomUUID()
              : `rev-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        });
        break;

      case "turn-status":
        currentTurnStatus = event.status;
        lastError = event.error || null;

        // Emulate item-completed when turn finishes, retaining accumulated markdown text
        if (
          event.status === "completed" ||
          event.status === "failed" ||
          event.status === "interrupted"
        ) {
          dispatchEvent({
            type: "item-completed",
            documentId: docId,
            item: {
              type: "agentMessage",
              id: turnId,
              text: currentTurnText || (event.status === "failed" ? (lastError || "执行失败") : ""),
            },
          });
        }

        dispatchEvent({
          type: "turn-status",
          documentId: docId,
          turnId,
          status: event.status,
          error: lastError,
        });
        break;

      case "error":
        dispatchEvent({
          type: "error",
          documentId: docId,
          message: event.message,
        });
        break;

      case "connection-status":
      case "models":
        break;
    }
  });

  return {
    startTurn: async (params) => {
      const docId = params.documentId;
      const turnId = `turn-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      currentDocumentId = docId;
      currentTurnId = turnId;
      currentTurnText = "";

      if (!client.isConnected()) {
        client.connect();
      }

      // 1. Notify UI that turn is inProgress and starting agentMessage item
      dispatchEvent({
        type: "turn-status",
        documentId: docId,
        turnId,
        status: "inProgress",
        error: null,
      });
      dispatchEvent({
        type: "item-started",
        documentId: docId,
        item: {
          type: "agentMessage",
          id: turnId,
          text: "",
        },
      });

      // 2. Extract and format attached images (pastedImages)
      const images = params.pastedImages?.map((img) => ({
        base64: img.base64,
        mimeType: img.mimeType,
        fileName: img.fileName,
      }));

      // 3. Package and send via WebSocket
      await client.sendChatMessage({
        threadId: params.threadId || "default",
        documentId: docId,
        prompt: params.prompt,
        model: params.model || undefined,
        context: {
          source: params.source,
          pngBase64: params.pngBase64 || undefined,
          figureContext: params.figureContext || undefined,
          diagnosticsText: params.diagnosticsText || undefined,
          images,
          pastedImages: params.pastedImages,
        },
      });

      return { turnId };
    },

    interruptTurn: async (params) => {
      client.sendInterrupt();
      const docId = params?.documentId || currentDocumentId || "web-document-1";
      const turnId = currentTurnId || "current-turn";

      dispatchEvent({
        type: "turn-status",
        documentId: docId,
        turnId,
        status: "interrupted",
        error: null,
      });
      dispatchEvent({
        type: "item-completed",
        documentId: docId,
        item: {
          type: "agentMessage",
          id: turnId,
          text: "",
        },
      });
    },

    bindEvents: (handler) => {
      subscribers.add(handler);

      // Tell UI we are "logged in" and ready to use
      try {
        handler({
          type: "account-updated",
          authMode: "antigravity-local",
        });
      } catch (err) {
        console.error("[MCP Assistant Adapter] Error calling initial account-updated:", err);
      }

      return () => {
        subscribers.delete(handler);
      };
    },

    listModels: async () => {
      try {
        const models = await client.requestModels();
        if (models && models.length > 0) {
          return models;
        }
      } catch (err) {
        console.warn("[MCP Assistant Adapter] Error requesting models:", err);
      }
      return DEFAULT_ANTIGRAVITY_MODELS;
    },

    getAccountSnapshot: async () => READY_ACCOUNT_SNAPSHOT,
    readAccountSnapshot: async () => READY_ACCOUNT_SNAPSHOT,
    readAccount: async () => READY_ACCOUNT_DATA,
    readRateLimits: async () => null,

    checkCodexStatus: async () => ({
      installed: true,
      hasNpm: false,
      hasBrew: false,
      hasWsl: false,
    }),

    ensureDocumentThread: async (params) => {
      currentDocumentId = params.documentId;
      return {
        threadId: params.threadId || `thread-${params.documentId}`,
        workspacePath: params.workspacePath || "",
        figurePath: params.figurePath || "",
        previewPath: params.previewPath || "",
      };
    },

    warmUp: async () => {
      if (!client.isConnected()) {
        client.connect();
      }
    },

    syncSource: async () => {},
    loadThreadState: async () => null,
    getClient: () => client,
  };
}
