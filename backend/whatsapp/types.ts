export interface TwilioWebhookBody {
  MessageSid: string;
  AccountSid: string;
  From: string; // "whatsapp:+1234567890"
  To: string;
  Body: string;
  NumMedia: string;
  MediaUrl0?: string;
  MediaContentType0?: string;
  MediaUrl1?: string;
  MediaContentType1?: string;
  MediaUrl2?: string;
  MediaContentType2?: string;
  MediaUrl3?: string;
  MediaContentType3?: string;
  MediaUrl4?: string;
  MediaContentType4?: string;
  MediaUrl5?: string;
  MediaContentType5?: string;
  MediaUrl6?: string;
  MediaContentType6?: string;
  MediaUrl7?: string;
  MediaContentType7?: string;
  MediaUrl8?: string;
  MediaContentType8?: string;
  MediaUrl9?: string;
  MediaContentType9?: string;
}

export type ConversationMode = "self" | "cm";

export interface WhatsappMediaItem {
  url: string;
  type: "image" | "video";
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  mediaItems?: WhatsappMediaItem[];
}

export interface Conversation {
  id: string;
  phoneNumber: string;
  profileId: string | null;
  isNewCreator: boolean;
  status: "active" | "abandoned" | "completed";
  sourceChannel: "whatsapp" | "whatsapp_cm";
  messageHistory: ConversationMessage[];
  turnsCount: number;
  /**
   * Cached on the session so the self-mode handler doesn't hit the DB every
   * inbound turn. Refreshed when the profile is first linked, and flipped
   * to true after a successful setAvailability tool call.
   */
  hasAvailability: boolean;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface LLMMetadata {
  model: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
}
