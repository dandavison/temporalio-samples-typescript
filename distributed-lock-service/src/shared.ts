import { defineQuery, defineUpdate } from '@temporalio/workflow';

export interface LockRequest {
  initiatorId: string;
  timeoutMs: number;
}

interface LockResponse {
  token: string;
}

export const currentWorkflowIdQuery = defineQuery<string | null>('current-workflow-id');
export const acquireLock = defineUpdate<LockResponse, [LockRequest]>('acquire-lock');
export const taskQueue = 'lock-service';
