import { Connection, Client, WorkflowIdConflictPolicy } from '@temporalio/client';
import { nanoid } from 'nanoid';
import { lockWorkflow } from './workflows';
import { acquireLock } from './shared';

const resourceId = process.argv[2];
if (!resourceId) {
  throw new Error('Must set resourceId');
}

async function run() {
  const connection = await Connection.connect();

  const client = new Client({ connection });

  const workflowId = 'test-' + nanoid();

  const lockService = client.workflow.withStart(lockWorkflow, {
    workflowId,
    workflowIdConflictPolicy: WorkflowIdConflictPolicy.WORKFLOW_ID_CONFLICT_POLICY_USE_EXISTING,
    taskQueue: 'lock-service',
  });

  const lock = await lockService.executeUpdate(acquireLock, {
    args: [{ initiatorId: 'client-1', timeoutMs: 500 }],
  });

  console.log(`acquired lock: ${lock.token}`);

  await useAPIThatCantBeCalledInParallel(5000);
  // TODO: release
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

async function useAPIThatCantBeCalledInParallel(sleepForMs: number): Promise<void> {
  // Fake an activity with a critical path that can't run in parallel
  await new Promise((f) => setTimeout(f, sleepForMs));
}
