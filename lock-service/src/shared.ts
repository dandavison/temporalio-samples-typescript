import { Duration } from '@temporalio/common';
import { defineQuery, defineUpdate } from '@temporalio/workflow';

export interface LockRequest {
  clientId: string;
  timeout: Duration;
}

interface LockResponse {
  token: number;
}

export const currentLockHolder = defineQuery<string | undefined>('current-workflow-id');
export const acquireLock = defineUpdate<LockResponse, [LockRequest]>('acquire-lock');
export const taskQueue = 'lock-service';
