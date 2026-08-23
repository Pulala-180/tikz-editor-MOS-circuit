export type McpClientEvent = 
  | { type: "delta"; deltaType: string; content: string }
  | { type: "source-updated"; source: string }
  | { type: "turn-status"; status: "idle" | "starting" | "inProgress" | "completed" | "failed" | "interrupted"; error?: string }
  | { type: "error"; message: string };

export class McpWebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private eventHandlers: Set<(event: McpClientEvent) => void> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isIntentionalClose = false;

  constructor(url = "ws://localhost:3100") {
    this.url = url;
  }

  public connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isIntentionalClose = false;
    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log(`[MCP Client] Connected to ${this.url}`);
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
          this.emit({ type: "error", message: "Lost connection to MCP Server" });
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (err) => {
        console.error("[MCP Client] WebSocket error", err);
      };
    } catch (err) {
      console.error("[MCP Client] Connection error", err);
      this.scheduleReconnect();
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
  }

  public sendChatMessage(params: {
    threadId: string;
    prompt: string;
    context: {
      source: string;
      pngBase64?: string;
      figureContext?: string;
      diagnosticsText?: string;
    };
    model?: string;
  }): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.emit({ type: "error", message: "MCP Server is not connected. Make sure the backend is running." });
      this.emit({ type: "turn-status", status: "failed", error: "Not connected" });
      return;
    }

    this.emit({ type: "turn-status", status: "starting" });
    const payload = {
      type: "start-turn",
      payload: params
    };
    this.ws.send(JSON.stringify(payload));
  }

  public sendInterrupt(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "interrupt" }));
    }
  }

  public subscribe(handler: (event: McpClientEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  private emit(event: McpClientEvent) {
    for (const handler of this.eventHandlers) {
      handler(event);
    }
  }

  private handleServerMessage(data: any) {
    if (!data || typeof data.type !== "string") return;

    switch (data.type) {
      case "delta":
        this.emit({ type: "delta", deltaType: "item/agentMessage/delta", content: data.content || "" });
        break;
      case "source-updated":
        this.emit({ type: "source-updated", source: data.source });
        break;
      case "turn-status":
        this.emit({ type: "turn-status", status: data.status, error: data.error });
        break;
      case "error":
        this.emit({ type: "error", message: data.message });
        break;
      default:
        console.warn("[MCP Client] Unknown message type:", data.type);
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }
}
