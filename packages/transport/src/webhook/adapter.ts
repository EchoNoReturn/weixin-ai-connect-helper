import type {
  ChannelAdapter,
  ChannelCapabilities,
  ChannelStartOptions,
  DeliveryReceipt,
  OutgoingMessage,
} from "@yoyojcoder-weixin-ai/core";
import { assertAdapterOwnsMessage } from "@yoyojcoder-weixin-ai/core";

const MAX_REQUEST_BYTES = 64 * 1024;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export interface LocalWebhookChannelOptions {
  channelId?: string;
  hostname?: string;
  port?: number;
  token?: string;
}

interface WebhookBody {
  senderId?: unknown;
  conversationId?: unknown;
  messageId?: unknown;
  text?: unknown;
  metadata?: unknown;
}

interface PendingReply {
  message?: OutgoingMessage;
}

const WEBHOOK_CAPABILITIES: Readonly<ChannelCapabilities> = Object.freeze({
  text: true,
  markdown: false,
  images: false,
  files: false,
  messageReplies: true,
  streaming: false,
  maxTextLength: 64 * 1024,
});

/** Local request/response adapter used as the first non-WeChat reference channel. */
export class LocalWebhookChannelAdapter implements ChannelAdapter {
  readonly channelId: string;
  readonly platform = "webhook" as const;
  readonly capabilities = WEBHOOK_CAPABILITIES;

  private readonly hostname: string;
  private readonly configuredPort: number;
  private readonly token?: string;
  private server?: ReturnType<typeof Bun.serve>;
  private startOptions?: ChannelStartOptions;
  private readonly pendingReplies = new Map<string, PendingReply>();

  constructor(options: LocalWebhookChannelOptions = {}) {
    this.channelId = options.channelId ?? "webhook-local";
    this.hostname = options.hostname ?? "127.0.0.1";
    this.configuredPort = options.port ?? 3211;
    this.token = options.token?.trim() || undefined;
    if (!LOOPBACK_HOSTS.has(this.hostname) && !this.token) {
      throw new Error("Webhook 监听非本机地址时必须配置 token");
    }
  }

  get url(): string | undefined {
    return this.server
      ? `http://${this.hostname}:${this.server.port}`
      : undefined;
  }

  async start(options: ChannelStartOptions): Promise<void> {
    if (this.server) throw new Error(`渠道 ${this.channelId} 已启动`);
    this.startOptions = options;
    options.onStateChange?.("starting");
    if (options.abortSignal.aborted) {
      options.onStateChange?.("stopped");
      return;
    }

    this.server = Bun.serve({
      hostname: this.hostname,
      port: this.configuredPort,
      fetch: (request) => this.handleRequest(request),
    });
    options.onStateChange?.("connected");

    await new Promise<void>((resolve) => {
      options.abortSignal.addEventListener("abort", () => {
        void this.server?.stop(true);
        this.server = undefined;
        this.startOptions = undefined;
        options.onStateChange?.("stopped");
        resolve();
      }, { once: true });
    });
  }

  async send(message: OutgoingMessage): Promise<DeliveryReceipt> {
    assertAdapterOwnsMessage(this, message);
    const requestId = message.replyContext?.requestId;
    const pending = typeof requestId === "string"
      ? this.pendingReplies.get(requestId)
      : undefined;
    if (!pending) {
      throw new Error("Webhook 回复必须对应一个仍在处理的入站请求");
    }
    pending.message = message;
    return {
      channelId: this.channelId,
      conversationId: message.conversationId,
      messageIds: [crypto.randomUUID()],
      sentAt: Date.now(),
    };
  }

  private async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ status: "ok", channelId: this.channelId });
    }
    if (request.method !== "POST" || url.pathname !== "/v1/messages") {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    if (!this.isAuthorized(request)) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > MAX_REQUEST_BYTES) {
      return Response.json({ error: "payload_too_large" }, { status: 413 });
    }

    try {
      const body = await request.json() as WebhookBody;
      if (typeof body.senderId !== "string" || !body.senderId.trim()) {
        return Response.json({ error: "senderId_required" }, { status: 400 });
      }
      if (typeof body.text !== "string" || !body.text.trim()) {
        return Response.json({ error: "text_required" }, { status: 400 });
      }
      const requestId = crypto.randomUUID();
      const conversationId = typeof body.conversationId === "string" && body.conversationId.trim()
        ? body.conversationId
        : body.senderId;
      const pending: PendingReply = {};
      this.pendingReplies.set(requestId, pending);
      try {
        await this.startOptions?.onMessage({
          channelId: this.channelId,
          platform: this.platform,
          messageId: typeof body.messageId === "string" ? body.messageId : undefined,
          conversationId,
          senderId: body.senderId,
          text: body.text,
          receivedAt: Date.now(),
          replyContext: { requestId },
          metadata: isRecord(body.metadata) ? body.metadata : undefined,
        });
      } finally {
        this.pendingReplies.delete(requestId);
      }
      return pending.message
        ? Response.json({ text: pending.message.text })
        : new Response(null, { status: 204 });
    } catch (error) {
      return Response.json({ error: "invalid_request", message: String(error) }, { status: 400 });
    }
  }

  private isAuthorized(request: Request): boolean {
    if (!this.token) return true;
    return request.headers.get("authorization") === `Bearer ${this.token}`;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
