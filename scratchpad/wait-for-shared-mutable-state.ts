import * as wf from '@temporalio/workflow';
import { Connection, Client, WorkflowIdReusePolicy } from '@temporalio/client';
import { Worker, DefaultLogger, Runtime } from '@temporalio/worker';

const workflowId = 'scratchpad';
const taskQueue = 'scratchpad';

export async function workflow(): Promise<void> {
  let cond = false;

  const coro = async (id: string) => {
    await wf.condition(() => cond);
    console.log(`coro ${id} after wait, sees ${cond}`);
    cond = false;
    await wf.sleep(1000);
    cond = true;
  };

  cond = true;
  await Promise.all([coro('1'), coro('2')]);
}

async function starter(client: Client): Promise<void> {
  const result = await client.workflow.execute(workflow, {
    taskQueue,
    workflowId,
    workflowIdReusePolicy: WorkflowIdReusePolicy.WORKFLOW_ID_REUSE_POLICY_TERMINATE_IF_RUNNING,
  });
}

async function main(): Promise<void> {
  const worker = await Worker.create({
    workflowsPath: __filename,
    taskQueue,
    bundlerOptions: {
      ignoreModules: ['@temporalio/client', '@temporalio/worker'],
    },
  });
  const connection = await Connection.connect();
  const client = new Client({ connection });
  await worker.runUntil(starter(client));
}

if (!wf.inWorkflowContext()) {
  Runtime.install({ logger: new DefaultLogger('WARN') });
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
