import * as wf from '@temporalio/workflow';
import * as cl from '@temporalio/client';
import * as wo from '@temporalio/worker';

const workflowId = __filename;
const taskQueue = __filename;

const myUpdate = wf.defineUpdate('myUpdate');

// A workflow that is canceled while handlers are running.
export async function workflow(name: string): Promise<void> {
  wf.setHandler(myUpdate, async () => {
    await wf.condition(() => false);
  });
  await wf.condition(() => false);
}

async function starter(client: cl.Client): Promise<void> {
  const wfHandle = await client.workflow.start(workflow, {
    taskQueue,
    workflowId,
    args: ['Temporal'],
    workflowIdReusePolicy: cl.WorkflowIdReusePolicy.WORKFLOW_ID_REUSE_POLICY_TERMINATE_IF_RUNNING,
  });
  const upHandle = await wfHandle.startUpdate(myUpdate, { waitForStage: cl.WorkflowUpdateStage.ACCEPTED });
  await wfHandle.cancel();
  try {
    await upHandle.result();
    throw new Error('unreachable');
  } catch (err) {
    console.error(`Client: error on upHandle.result(): ${err}`);
  }
  try {
    console.log(`wfResult: ${await wfHandle.result()}`);
    throw new Error('unreachable');
  } catch (err) {
    console.error(`Client: error on wfHandle.result(): ${err}`);
  }
}

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
