import * as wf from '@temporalio/workflow';
import * as cl from '@temporalio/client';
import * as wo from '@temporalio/worker';

const workflowId = 'scratchpad';
const taskQueue = 'scratchpad';

const myUpdate = wf.defineUpdate<string, [string]>('myUpdate');

export async function workflow(): Promise<void> {
  let continueAsNewSuggested = false;
  wf.setHandler(myUpdate, (arg: string) => {
    if (wf.workflowInfo().continueAsNewSuggested) {
      continueAsNewSuggested = true;
    }
    return arg + '-processed';
  });
  await wf.condition(() => continueAsNewSuggested);
  wf.log.warn('continueAsNewSuggested: exiting workflow');
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
    try {
      console.log(await handle.executeUpdate('myUpdate', { args: [`${++i}`] }));
    } catch (err) {
      console.error(err);
      break;
    }
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
// hello
