import * as wf from '@temporalio/workflow';
import { Connection, Client, WorkflowUpdateStage } from '@temporalio/client';
import { Worker, DefaultLogger, Runtime } from '@temporalio/worker';

const workflowId = 'scratchpad';
const taskQueue = 'scratchpad';
const fooSignal = wf.defineSignal('foo');
const fooUpdate = wf.defineUpdate('foo');

export async function workflow(): Promise<string> {
  var numFoos = 0;

  wf.setHandler(fooSignal, () => {
    numFoos++;
  });

  wf.setHandler(fooUpdate, () => {
    numFoos++;
  });

  await wf.condition(() => numFoos > 0);
  return `foos: ${numFoos}`;
}
async function starter(client: Client): Promise<void> {
  const handle = await client.workflow.start(workflow, {
    workflowId,
    taskQueue,
    args: [],
    workflowIdReusePolicy: wf.WorkflowIdReusePolicy.WORKFLOW_ID_REUSE_POLICY_TERMINATE_IF_RUNNING,
  });
  await new Promise((res) => setTimeout(res, 1000));
  await handle.signal('foo');
  await handle.startUpdate('foo', {
    waitForStage: WorkflowUpdateStage.ACCEPTED,
  });
  console.log(`wf-result: ${await handle.result()}`);
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
