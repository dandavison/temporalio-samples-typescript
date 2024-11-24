import { condition, setHandler, workflowInfo, ApplicationFailure } from '@temporalio/workflow';
import { LockRequest, currentLockHolder, acquireLock } from './shared';

export async function lockWorkflow(): Promise<void> {
  let lockHolder: string | undefined;
  const requests: [string, (token: number) => void][] = [];
  setHandler(acquireLock, async (req: LockRequest) => {
    const token = await new Promise<number>((f) => requests.push([req.clientId, f]));
    return { token };
  });
  setHandler(currentLockHolder, () => lockHolder);
  while (!workflowInfo().continueAsNewSuggested) {
    await condition(() => requests.length > 0);
    const [clientId, waker] = requests.shift()!;
    lockHolder = clientId;
    waker(1);
  }
  throw new ApplicationFailure('TODO: support ContinueAsNew');
}
