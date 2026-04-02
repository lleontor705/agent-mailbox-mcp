export const SCOPES = [
  "messages:read",
  "messages:write",
  "messages:admin",
  "agents:read",
  "agents:write",
  "a2a:submit",
] as const;

export type Scope = (typeof SCOPES)[number];

/** Default scopes granted to a regular agent */
export const DEFAULT_AGENT_SCOPES: Scope[] = [
  "messages:read",
  "messages:write",
  "agents:read",
  "agents:write",
  "a2a:submit",
];

/** Full scopes for admin */
export const ADMIN_SCOPES: Scope[] = [...SCOPES];
