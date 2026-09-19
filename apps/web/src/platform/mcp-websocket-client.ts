import type { AssistantModelOption, AssistantTurnStatus } from "@tikz-editor/app/platform/types";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting";

export type McpTurnStatus = AssistantTurnStatus;

export type McpClientEvent =
  | { type: "delta"; deltaType: string; content: string }
  | { type: "source-updated"; source: string }
  | { type: "turn-status"; status: AssistantTurnStatus; error?: string }
  | { type: "error"; message: string }
  | { type: "connection-status"; status: ConnectionStatus }
  | { type: "models"; models: AssistantModelOption[] };

export interface AttachedImage {
  base64: string;
  mimeType: string;
  fileName?: string;
}

export interface ChatMessageContext {
  source: string;
  pngBase64?: string;
  figureContext?: string;
  diagnosticsText?: string;
  images?: AttachedImage[];
  pastedImages?: Array<{
    base64: string;
    mimeType: string;
    fileName: string;
  }>;
  [key: string]: unknown;
}

export interface SendChatMessageParams {
  threadId?: string;
  documentId?: string;
  prompt: string;
  model?: string;
  context: ChatMessageContext;
}

export const DEFAULT_ANTIGRAVITY_MODELS: AssistantModelOption[] = [
  { id: "gemini-3.8-flash-low", label: "Gemini 3.8 Flash (极速秒回 2~3s · 推荐)" },
  { id: "gemini-3.8-flash-medium", label: "Gemini 3.8 Flash (均衡平衡)" },
  { id: "gemini-3.8-flash-high", label: "Gemini 3.8 Flash (深度推理)" },
  { id: "gemini-3.1-pro-high", label: "Gemini 3.1 Pro (大模型深度推理)" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (Thinking)" },
  { id: "gpt-oss-120b-medium", label: "GPT-OSS 120B" },
];

export class McpWebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private eventHandlers: Set<(event: McpClientEvent) => void> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isIntentionalClose = false;
  private connectionStatus: ConnectionStatus = "disconnected";
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private readonly baseReconnectDelay = 1500;
  private readonly maxReconnectDelay = 10000;
  private pendingModelResolvers: Set<(models: AssistantModelOption[]) => void> = new Set();

  constructor(url = "ws://localhost:3100") {
    this.url = url;
  }

  public getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isIntentionalClose = false;
    this.setConnectionStatus(this.reconnectAttempts > 0 ? "reconnecting" : "connecting");

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log(`[MCP Client] Connected to ${this.url}`);
        this.reconnectAttempts = 0;
        this.setConnectionStatus("connected");
        this.emit({ type: "turn-status", status: "idle" });
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleServerMessage(data);
        } catch (err) {
          console.error("[MCP Client] Failed to parse message", err);
        }
      };

      this.ws.onclose = () => {
        console.log("[MCP Client] Disconnected");
        this.ws = null;
        if (!this.isIntentionalClose) {
          this.setConnectionStatus("reconnecting");
          this.emit({ type: "error", message: "Lost connection to MCP Server (ws://localhost:3100). Reconnecting..." });
          this.scheduleReconnect();
        } else {
          this.setConnectionStatus("disconnected");
        }
      };

      this.ws.onerror = (err) => {
        console.error("[MCP Client] WebSocket error", err);
        // Standard WebSocket fires onclose after onerror, which handles reconnection.
      };
    } catch (err) {
      console.error("[MCP Client] Connection error", err);
      this.ws = null;
      if (!this.isIntentionalClose) {
        this.setConnectionStatus("reconnecting");
        this.scheduleReconnect();
      } else {
        this.setConnectionStatus("disconnected");
      }
    }
  }

  public disconnect(): void {
    this.isIntentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.reconnectAttempts = 0;
    this.setConnectionStatus("disconnected");
  }

  public async sendChatMessage(params: SendChatMessageParams): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
      await this.waitForOpen(2000);
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.connect();
      await this.waitForOpen(2500);
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.emit({
        type: "error",
        message: "无法连接到 Antigravity AI 后台 (ws://localhost:3100)。请确认后台桥接服务已启动。",
      });
      this.emit({
        type: "turn-status",
        status: "failed",
        error: "未连接到 Antigravity AI 桥接服务",
      });
      return;
    }

    const payload = {
      type: "start-turn",
      payload: params,
    };
    this.ws.send(JSON.stringify(payload));
  }

  public sendInterrupt(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "interrupt" }));
    }
    this.emit({ type: "turn-status", status: "interrupted" });
  }

  public sendGetModels(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "get-models" }));
    }
  }

  public async requestModels(): Promise<AssistantModelOption[]> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return DEFAULT_ANTIGRAVITY_MODELS;
    }

    return new Promise<AssistantModelOption[]>((resolve) => {
      let resolved = false;
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.pendingModelResolvers.delete(resolver);
          resolve(DEFAULT_ANTIGRAVITY_MODELS);
        }
      }, 2500);

      const resolver = (models: AssistantModelOption[]) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          resolve(models.length > 0 ? models : DEFAULT_ANTIGRAVITY_MODELS);
        }
      };

      this.pendingModelResolvers.add(resolver);

      try {
        this.ws!.send(JSON.stringify({ type: "get-models" }));
      } catch {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          this.pendingModelResolvers.delete(resolver);
          resolve(DEFAULT_ANTIGRAVITY_MODELS);
        }
      }
    });
  }

  public subscribe(handler: (event: McpClientEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  private emit(event: McpClientEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (err) {
        console.error("[MCP Client] Error in event handler", err);
      }
    }
  }

  private setConnectionStatus(status: ConnectionStatus): void {
    if (this.connectionStatus !== status) {
      this.connectionStatus = status;
      this.emit({ type: "connection-status", status });
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.isIntentionalClose) return;

    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(1.5, this.reconnectAttempts),
      this.maxReconnectDelay
    );
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private waitForOpen(timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.ws || this.ws.readyState === WebSocket.OPEN) {
        resolve(true);
        return;
      }
      const timer = setTimeout(() => {
        resolve(this.ws?.readyState === WebSocket.OPEN);
      }, timeoutMs);

      const onOpen = () => {
        clearTimeout(timer);
        resolve(true);
      };
      if (this.ws) {
        this.ws.addEventListener("open", onOpen, { once: true });
      }
    });
  }

  private handleServerMessage(data: any): void {
    if (!data || typeof data.type !== "string") return;

    switch (data.type) {
      case "delta":
        this.emit({
          type: "delta",
          deltaType: data.deltaType || "item/agentMessage/delta",
          content: data.content ?? data.delta ?? "",
        });
        break;

      case "source-updated":
        this.emit({
          type: "source-updated",
          source: data.source ?? "",
        });
        break;

      case "turn-status": {
        const normalizedStatus = this.normalizeTurnStatus(data.status);
        this.emit({
          type: "turn-status",
          status: normalizedStatus,
          error: data.error || undefined,
        });
        break;
      }

      case "interrupt":
      case "interrupted":
        this.emit({
          type: "turn-status",
          status: "interrupted",
        });
        break;

      case "models":
      case "get-models":
      case "models-list":
      case "get-models-response": {
        const rawList = Array.isArray(data.models)
          ? data.models
          : Array.isArray(data.payload?.models)
          ? data.payload.models
          : [];
        const models: AssistantModelOption[] = rawList
          .map((m: any) => {
            if (typeof m === "string") {
              return { id: m, label: m };
            }
            return {
              id: String(m.id || m.value || ""),
              label: String(m.label || m.name || m.id || ""),
            };
          })
          .filter((m: AssistantModelOption) => m.id.length > 0);

        const resolved = models.length > 0 ? models : DEFAULT_ANTIGRAVITY_MODELS;
        for (const resolver of this.pendingModelResolvers) {
          resolver(resolved);
        }
        this.pendingModelResolvers.clear();
        this.emit({ type: "models", models: resolved });
        break;
      }

      case "error":
        this.emit({
          type: "error",
          message: data.message || "Unknown error from server",
        });
        break;

      default:
        console.warn("[MCP Client] Unknown message type:", data.type);
    }
  }

  private normalizeTurnStatus(status: unknown): AssistantTurnStatus {
    switch (status) {
      case "idle":
        return "idle";
      case "starting":
      case "start":
        return "starting";
      case "inProgress":
      case "in_progress":
      case "running":
        return "inProgress";
      case "completed":
      case "complete":
      case "done":
      case "success":
        return "completed";
      case "failed":
      case "fail":
      case "error":
        return "failed";
      case "interrupted":
      case "interrupt":
      case "cancelled":
        return "interrupted";
      default:
        return "inProgress";
    }
  }
}
