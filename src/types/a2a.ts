// A2A Protocol types aligned with the Agent2Agent specification

export const TASK_STATES = [
  "submitted",
  "working",
  "input-required",
  "completed",
  "failed",
  "canceled",
] as const;
export type TaskState = (typeof TASK_STATES)[number];

export const TERMINAL_STATES: TaskState[] = ["completed", "failed", "canceled"];

/** Valid state transitions for A2A tasks */
export const VALID_TRANSITIONS: Record<TaskState, TaskState[]> = {
  submitted: ["working", "canceled", "failed"],
  working: ["input-required", "completed", "failed", "canceled"],
  "input-required": ["working", "canceled", "failed"],
  completed: [],
  failed: [],
  canceled: [],
};

// --- Part types (A2A Message/Parts model) ---

export interface TextPart {
  type: "text";
  text: string;
}

export interface FilePart {
  type: "file";
  file: {
    name?: string;
    mimeType?: string;
    bytes?: string; // base64
    uri?: string;
  };
}

export interface DataPart {
  type: "data";
  data: Record<string, unknown>;
}

export type Part = TextPart | FilePart | DataPart;

// --- Task message ---

export interface TaskMessage {
  id: string;
  task_id: string;
  role: "user" | "agent";
  parts: Part[];
  created_at: string;
}

// --- Task artifact ---

export interface TaskArtifact {
  id: string;
  task_id: string;
  name?: string;
  description?: string;
  parts: Part[];
  created_at: string;
}

// --- Task ---

export interface A2ATask {
  id: string;
  session_id?: string;
  from_agent: string;
  to_agent: string;
  status: TaskState;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
  messages?: TaskMessage[];
  artifacts?: TaskArtifact[];
}

// --- Agent Card (discovery) ---

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  tags?: string[];
  examples?: string[];
}

export interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  capabilities: {
    streaming?: boolean;
    pushNotifications?: boolean;
    stateTransitionHistory?: boolean;
  };
  skills: AgentSkill[];
  defaultInputModes?: string[];
  defaultOutputModes?: string[];
  authentication?: {
    schemes: string[];
  };
}

// --- JSON-RPC 2.0 ---

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// Standard JSON-RPC error codes
export const JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // Custom A2A errors
  TASK_NOT_FOUND: -32001,
  INVALID_TRANSITION: -32002,
  AGENT_NOT_FOUND: -32003,
} as const;
