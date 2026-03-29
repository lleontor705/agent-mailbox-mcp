export const MESSAGE_STATUSES = ["pending", "delivered", "read", "acked", "expired"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const PRIORITIES = ["high", "normal", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];

export interface Message {
  id: string;
  sender: string;
  recipient: string;
  subject: string;
  body: string;
  priority: Priority;
  status: MessageStatus;
  thread_id: string | null;
  dedup_key: string | null;
  created_at: string;
  delivered_at: string | null;
  acked_at: string | null;
  expires_at: string | null;
}

export interface Thread {
  id: string;
  subject: string;
  participants: string;
  created_at: string;
  updated_at: string;
}

export interface AgentInfo {
  id: string;
  role: string;
  last_active: string;
  registered_at: string;
}
