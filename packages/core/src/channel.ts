/** A configured channel instance, for example "weixin-main" or "webhook-local". */
export type ChannelId = string;

export type ChannelPlatform = "weixin" | "webhook" | "console" | (string & {});

export interface ChannelCapabilities {
  text: boolean;
  markdown: boolean;
  images: boolean;
  files: boolean;
  messageReplies: boolean;
  streaming: boolean;
  maxTextLength?: number;
}

/** Normalized inbound message emitted by every channel adapter. */
export interface IncomingMessage {
  channelId: ChannelId;
  platform: ChannelPlatform;
  accountId?: string;
  messageId?: string;
  conversationId: string;
  senderId: string;
  text: string;
  receivedAt: number;
  /** Opaque data that the same adapter may need when replying. */
  replyContext?: Readonly<Record<string, unknown>>;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface OutgoingMessage {
  channelId: ChannelId;
  conversationId: string;
  text: string;
  replyToMessageId?: string;
  replyContext?: Readonly<Record<string, unknown>>;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface DeliveryReceipt {
  channelId: ChannelId;
  conversationId: string;
  messageIds: string[];
  sentAt: number;
}

export type ChannelConnectionState =
  | "starting"
  | "connected"
  | "reconnecting"
  | "stopped";

export interface ChannelStartOptions {
  abortSignal: AbortSignal;
  onMessage: (message: IncomingMessage) => Promise<void>;
  onStateChange?: (state: ChannelConnectionState, error?: Error) => void;
}

/**
 * Transport port implemented by WeChat and every future ingress/egress channel.
 * `start` remains pending while the receive loop is active and returns after abort.
 */
export interface ChannelAdapter {
  readonly channelId: ChannelId;
  readonly platform: ChannelPlatform;
  readonly accountId?: string;
  readonly capabilities: Readonly<ChannelCapabilities>;

  start(options: ChannelStartOptions): Promise<void>;
  send(message: OutgoingMessage): Promise<DeliveryReceipt>;
}

export function assertAdapterOwnsMessage(
  adapter: Pick<ChannelAdapter, "channelId">,
  message: Pick<OutgoingMessage, "channelId">,
): void {
  if (adapter.channelId !== message.channelId) {
    throw new Error(
      `渠道不匹配: adapter=${adapter.channelId}, message=${message.channelId}`,
    );
  }
}
