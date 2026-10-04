import type {
  ChannelAdapter,
  ChannelCapabilities,
  ChannelStartOptions,
  DeliveryReceipt,
  OutgoingMessage,
} from "@yoyojcoder-weixin-ai/core";
import { assertAdapterOwnsMessage, createLogger } from "@yoyojcoder-weixin-ai/core";
import type { WeixinCredentials } from "./login.ts";
import { runInboundLoop, type WeixinInboundMessage } from "./inbound.ts";
import { WeixinOutbound } from "./outbound.ts";
import { restoreContextTokens, getContextToken, setContextToken } from "./api.ts";

const WEIXIN_CAPABILITIES: Readonly<ChannelCapabilities> = Object.freeze({
  text: true,
  markdown: false,
  images: false,
  files: false,
  messageReplies: true,
  streaming: false,
  maxTextLength: 4000,
});

interface WeixinSender {
  sendText(to: string, text: string, contextToken?: string): Promise<string[]>;
}

type InboundRunner = (options: {
  creds: WeixinCredentials;
  abortSignal: AbortSignal;
  onMessage: (message: WeixinInboundMessage) => Promise<void>;
}) => Promise<void>;

export interface WeixinChannelAdapterOptions {
  channelId?: string;
  startupText?: string;
  contextStore?: {
    restore(accountId: string): void;
    get(accountId: string, userId: string): string | undefined;
    set(accountId: string, userId: string, token: string): void;
  };
  /** Test seam; production callers should leave this unset. */
  inboundRunner?: InboundRunner;
  /** Test seam; production callers should leave this unset. */
  sender?: WeixinSender;
}

export class WeixinChannelAdapter implements ChannelAdapter {
  readonly channelId: string;
  readonly platform = "weixin" as const;
  readonly accountId: string;
  /** 扫码登录的微信用户；其消息默认已授权 */
  readonly ownerId?: string;
  readonly capabilities = WEIXIN_CAPABILITIES;

  private readonly inboundRunner: InboundRunner;
  private readonly sender: WeixinSender;
  private readonly log = createLogger("weixin");
  private startupAttempted = false;
  private startupDelivered = false;
  private startupSending?: Promise<void>;
  private readonly contextStore;

  constructor(
    private readonly creds: WeixinCredentials,
    private readonly options: WeixinChannelAdapterOptions = {},
  ) {
    this.channelId = options.channelId ?? "weixin-main";
    this.accountId = creds.accountId;
    this.ownerId = creds.userId;
    this.inboundRunner = options.inboundRunner ?? runInboundLoop;
    this.sender = options.sender ?? new WeixinOutbound(creds);
    this.contextStore = options.contextStore ?? {
      restore: restoreContextTokens, get: getContextToken, set: setContextToken,
    };
  }

  private async notifyStartup(contextToken?: string): Promise<void> {
    if (!this.options.startupText || !this.creds.userId || this.startupDelivered) return;
    if (this.startupSending) return this.startupSending;
    this.startupSending = (async () => {
      try {
        await this.sender.sendText(this.creds.userId!, this.options.startupText!, contextToken);
        this.startupDelivered = true;
        this.log.info("启动通知已发送，微信发送自检通过");
      } catch (error) {
        this.log.error("微信启动发送自检失败；收到登录用户的新消息后将携带最新上下文重试:", error);
      }
    })();
    try { await this.startupSending; } finally { this.startupSending = undefined; }
  }

  async start(options: ChannelStartOptions): Promise<void> {
    options.onStateChange?.("starting");
    if (!this.startupAttempted && !options.abortSignal.aborted) {
      this.startupAttempted = true;
      this.contextStore.restore(this.accountId);
      if (this.creds.userId) {
        await this.notifyStartup(this.contextStore.get(this.accountId, this.creds.userId));
      } else if (this.options.startupText) {
        this.log.warn("登录记录缺少 userId，无法确定启动通知接收者；请运行 wah auth login 更新登录信息");
      }
    }
    options.onStateChange?.("connected");
    try {
      await this.inboundRunner({
        creds: this.creds,
        abortSignal: options.abortSignal,
        onMessage: async (message) => {
          if (message.contextToken) {
            this.contextStore.set(this.accountId, message.fromUserId, message.contextToken);
          }
          if (message.fromUserId === this.creds.userId) {
            await this.notifyStartup(message.contextToken);
          }
          await options.onMessage({
            channelId: this.channelId,
            platform: this.platform,
            accountId: this.accountId,
            conversationId: message.fromUserId,
            senderId: message.fromUserId,
            text: message.text,
            receivedAt: message.receivedAt,
            replyContext: message.contextToken
              ? { contextToken: message.contextToken }
              : undefined,
          });
        },
      });
    } finally {
      options.onStateChange?.("stopped");
    }
  }

  async send(message: OutgoingMessage): Promise<DeliveryReceipt> {
    assertAdapterOwnsMessage(this, message);
    const contextToken = message.replyContext?.contextToken;
    const messageIds = await this.sender.sendText(
      message.conversationId,
      message.text,
      typeof contextToken === "string" ? contextToken : this.contextStore.get(this.accountId, message.conversationId),
    );
    return {
      channelId: this.channelId,
      conversationId: message.conversationId,
      messageIds,
      sentAt: Date.now(),
    };
  }
}
