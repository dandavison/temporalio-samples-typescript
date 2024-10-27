import { condition, continueAsNew, setHandler, workflowInfo, uuid4 } from '@temporalio/workflow';
import { LockRequest, currentWorkflowIdQuery, acquireLock } from './shared';

export async function lockWorkflow(requests = Array<LockRequest>()): Promise<void> {
  let currentWorkflowId: string | null = null;
  setHandler(acquireLock, (req: LockRequest) => {
    requests.push(req);
    // TODO: actually implement the lock service. For now we give a lock to anyone who asks.
    return { token: uuid4() };
  });
  setHandler(currentWorkflowIdQuery, () => currentWorkflowId);
  while (!workflowInfo().continueAsNewSuggested) {
    await condition(() => requests.length > 0);
    const req = requests.shift()!;
  }
  await continueAsNew<typeof lockWorkflow>(requests);
}
