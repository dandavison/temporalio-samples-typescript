import { Connection, Client, WorkflowIdReusePolicy } from '@temporalio/client';
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

  console.log('Starting test workflow with id', workflowId, 'connecting to lock workflow', resourceId);
  const start = Date.now();

  const uws = true;
  if (uws) {
    const lazyStart = client.workflow.start(lockWorkflow, {
      workflowId,
      taskQueue: 'lock-service',
      lazy: true,
    });
    const lock = await lazyStart.then((wfHandle) =>
      wfHandle.executeUpdate(acquireLock, {
        args: [{ initiatorId: 'client-1', timeoutMs: 500 }],
      })
    );
    console.log(`acquired lock: ${lock.token}`);
  } else {
    const wfHandle = await client.workflow.start(lockWorkflow, {
      workflowId,
      args: [],
      taskQueue: 'lock-service',
    });
    const lock = await wfHandle.executeUpdate(acquireLock, {
      args: [{ initiatorId: 'client-1', timeoutMs: 500 }],
    });
    console.log(`acquired lock: ${lock.token}`);
  }
  await useAPIThatCantBeCalledInParallel(5000);
  // TODO: release
  console.log('Test workflow finished after', Date.now() - start, 'ms');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

async function useAPIThatCantBeCalledInParallel(sleepForMs: number): Promise<void> {
  // Fake an activity with a critical path that can't run in parallel
  await new Promise((f) => setTimeout(f, sleepForMs));
}
