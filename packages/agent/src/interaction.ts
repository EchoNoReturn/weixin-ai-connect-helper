import type { CreateElicitationRequest, CreateElicitationResponse, RequestPermissionRequest, RequestPermissionResponse } from "@agentclientprotocol/sdk";

export interface AgentInteraction {
  permission(request: RequestPermissionRequest, signal: AbortSignal): Promise<RequestPermissionResponse>;
  elicit(request: CreateElicitationRequest, signal: AbortSignal): Promise<CreateElicitationResponse>;
}
