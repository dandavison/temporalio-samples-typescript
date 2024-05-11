import * as wf from '@temporalio/workflow';
import * as cl from '@temporalio/client';
import * as wo from '@temporalio/worker';

const workflowId = 'scratchpad';
const taskQueue = 'scratchpad';

const myUpdate = wf.defineUpdate<string, [string]>('myUpdate');

export async function workflow(): Promise<void> {
  wf.setHandler(myUpdate, (arg: string) => arg + '-processed');
  await wf.condition(() => false);
}

async function starter(client: cl.Client): Promise<void> {
  const handle = await client.workflow
    .start(workflow, {
      taskQueue,
      workflowId,
      workflowIdReusePolicy: cl.WorkflowIdReusePolicy.WORKFLOW_ID_REUSE_POLICY_TERMINATE_IF_RUNNING,
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
  let i = 0;
  for (;;) {
    console.log(await handle.executeUpdate('myUpdate', { args: [`${++i}`] }));
  }
}

// ----------------------------------------------------------------------------------------------

async function main(): Promise<void> {
  const worker = await wo.Worker.create({
    workflowsPath: __filename,
    taskQueue,
    bundlerOptions: {
      ignoreModules: ['@temporalio/client', '@temporalio/worker'],
    },
  });
  const connection = await cl.Connection.connect();
  const client = new cl.Client({ connection });
  await worker.runUntil(starter(client));
}

if (!wf.inWorkflowContext()) {
  wo.Runtime.install({ logger: new wo.DefaultLogger('WARN') });
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
