import * as wf from '@temporalio/workflow';
import * as cl from '@temporalio/client';
import * as wo from '@temporalio/worker';

const workflowId = 'scratchpad';
const taskQueue = 'scratchpad';

const myUpdate = wf.defineUpdate('myUpdate');

export async function workflow(name: string): Promise<string> {
  let updateHasStarted = false;
  wf.setHandler(myUpdate, async () => {
    updateHasStarted = true;
    if (true) {
      throw new wf.ApplicationFailure('update handler threw ApplicationFailure');
    } else {
      throw new Error('update handler threw error');
    }
  });
  await wf.condition(() => updateHasStarted);
  return 'wf-result';
}

async function starter(client: cl.Client): Promise<void> {
  const handle = await client.workflow.start(workflow, {
    taskQueue,
    workflowId,
    args: ['Temporal'],
    workflowIdReusePolicy: cl.WorkflowIdReusePolicy.WORKFLOW_ID_REUSE_POLICY_TERMINATE_IF_RUNNING,
  });
  try {
    await handle.executeUpdate(myUpdate);
    throw new Error('unreacahable');
  } catch (err) {
    console.error(`Error on executeUpdate: ${err}`);
  }
  console.log(`wfResult: ${await handle.result()}`);
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
