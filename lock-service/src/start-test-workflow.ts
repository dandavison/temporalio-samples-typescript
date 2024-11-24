import { Connection, Client, WorkflowIdConflictPolicy, StartWorkflowOperation } from '@temporalio/client';
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

  const startOp = new StartWorkflowOperation(lockWorkflow, {
    workflowId,
    workflowIdConflictPolicy: 'USE_EXISTING',
    taskQueue: 'lock-service',
  });

  const lock = await client.workflow.executeUpdateWithStart(acquireLock, {
    args: [{ clientId: 'client-1', timeout: '500ms' }],
    startWorkflowOperation: startOp,
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
