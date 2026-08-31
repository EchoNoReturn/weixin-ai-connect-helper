import type {
  ChannelAdapter,
  ChannelCapabilities,
  ChannelStartOptions,
  DeliveryReceipt,
  OutgoingMessage,
} from "@yoyojcoder-weixin-ai/core";
import { assertAdapterOwnsMessage } from "@yoyojcoder-weixin-ai/core";
import type { WeixinCredentials } from "./login.ts";
import { runInboundLoop, type WeixinInboundMessage } from "./inbound.ts";
import { WeixinOutbound } from "./outbound.ts";

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
  /** Test seam; production callers should leave this unset. */
  inboundRunner?: InboundRunner;
  /** Test seam; production callers should leave this unset. */
  sender?: WeixinSender;
}

export class WeixinChannelAdapter implements ChannelAdapter {
  readonly channelId: string;
  readonly platform = "weixin" as const;
  readonly accountId: string;
  readonly capabilities = WEIXIN_CAPABILITIES;

  private readonly inboundRunner: InboundRunner;
  private readonly sender: WeixinSender;

  constructor(
    private readonly creds: WeixinCredentials,
    options: WeixinChannelAdapterOptions = {},
  ) {
    this.channelId = options.channelId ?? "weixin-main";
    this.accountId = creds.accountId;
    this.inboundRunner = options.inboundRunner ?? runInboundLoop;
    this.sender = options.sender ?? new WeixinOutbound(creds);
  }

  async start(options: ChannelStartOptions): Promise<void> {
    options.onStateChange?.("starting");
    options.onStateChange?.("connected");
    try {
      await this.inboundRunner({
        creds: this.creds,
        abortSignal: options.abortSignal,
        onMessage: async (message) => {
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
      typeof contextToken === "string" ? contextToken : undefined,
    );
    return {
      channelId: this.channelId,
      conversationId: message.conversationId,
      messageIds,
      sentAt: Date.now(),
    };
  }
}
