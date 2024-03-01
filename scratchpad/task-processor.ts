import { proxyActivities, inWorkflowContext } from '@temporalio/workflow';
import { Connection, Client, WorkflowIdReusePolicy } from '@temporalio/client';
import { Worker, DefaultLogger, Runtime } from '@temporalio/worker';
import * as wf from '@temporalio/workflow';
import ms from 'ms';
import assert from 'assert';

interface TaskInput {
  uuid: string;
  // Other properties
}

interface TaskResult {
  // Other properties
}

interface TaskError {
  // Other properties
}

interface TaskCompletion {
  uuid: string;
  status: 'succeeded' | 'failed' | 'retry';
  result?: TaskResult;
  error?: TaskError;
}

interface SerializedState {
  tasks: {
    uuid: string;
    input?: TaskInput | undefined;
    completion?: TaskCompletion | undefined;
    expiration?: number | undefined;
  }[];
}

export const submitTaskUpdate = wf.defineUpdate<TaskCompletion, [TaskInput]>('submitTaskUpdate');

const taskMap: Map<string, QueuedTask> = new Map();
const taskQueue: string[] = [];

class QueuedTask {
  public readonly uuid: string;

  public readonly input: TaskInput | undefined;
  private completion: TaskCompletion | undefined;
  private expiration: number | undefined;

  private promise_: Promise<TaskCompletion> | undefined;
  private resolvePromise: ((result: TaskCompletion) => void) | undefined;
  private rejectPromise: ((err: Error) => void) | undefined;

  constructor(input: TaskInput | undefined, completion: TaskCompletion | undefined) {
    assert(input ?? completion);
    this.uuid = input?.uuid ?? completion!.uuid;
    this.input = input;
  }

  get promise(): Promise<TaskCompletion> {
    if (this.promise_ === undefined) {
      if (this.completion) {
        taskMap.delete(this.uuid);
        return Promise.resolve(this.completion);
      }
      this.promise_ = new Promise<TaskCompletion>((res, rej) => {
        this.resolvePromise = res;
        this.rejectPromise = rej;
      });
    }
    return this.promise_;
  }

  resolve(result: TaskResult) {
    const completion: TaskCompletion = { uuid: this.uuid, status: 'succeeded', result };
    if (this.resolvePromise) {
      // There is an active listener; resolve the promise and forget about this task
      taskMap.delete(this.uuid);
      this.resolvePromise(completion);
    } else {
      // No active listener; store the result for later
      this.completion = completion;
      this.expiration = Date.now() + ms('1 hour');
    }
  }

  reject(err: Error) {
    const completion: TaskCompletion = { uuid: this.uuid, status: 'failed', result: undefined, error: err };
    if (this.rejectPromise) {
      // There is an active listener; reject the promise and forget about this task
      taskMap.delete(this.uuid);
      this.rejectPromise(err);
    } else {
      // No active listener; store the result for later
      this.completion = completion;
      this.expiration = Date.now() + ms('1 hour');
    }
  }

  isExpired() {
    return this.expiration !== undefined && this.expiration < Date.now();
  }

  toSerializedState(): SerializedState['tasks'][0] {
    // There is an active listener; inform it that the task is being transported to another workflow
    if (this.resolvePromise) {
      this.resolvePromise({
        uuid: this.uuid,
        status: 'retry',
      });
      taskMap.delete(this.uuid);
    }

    return {
      uuid: this.uuid,
      input: this.input,
      completion: this.completion,
      expiration: this.expiration,
    };
  }
}

const activities = {
  async processSingleTask(input: TaskInput): Promise<TaskResult> {
    console.log(`processing: ${input.uuid}`);
    return {};
  },
};

const { processSingleTask } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
});

class Condition {
  private queue: (() => void)[];

  constructor() {
    this.queue = [];
  }

  // Add self to queue and wait if not first
  async wait(): Promise<void> {
    const first = this.queue.length == 0;
    const self = new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
    if (!first) {
      await self;
    }
  }

  // Remove self from queue and advance next
  async notify(): Promise<void> {
    this.queue.shift();
    if (this.queue.length > 0) {
      this.queue[0]();
    }
  }
}

export async function entityWorkflowWithUpdate(transportedState?: SerializedState): Promise<void> {
  const cond = new Condition();

  const handleIncomingTask = async (incomingTask: TaskInput): Promise<TaskCompletion> => {
    let task = taskMap.get(incomingTask.uuid);
    if (task) {
      // Task is already known, maybe even already completed
      taskMap.delete(incomingTask.uuid);
      return task.promise;
    }
    await cond.wait();

    task = new QueuedTask(incomingTask, undefined);

    try {
      task.resolve(await processSingleTask(task.input!));
    } catch (e) {
      task.reject(e as Error);
    }

    taskMap.set(task.uuid, task);
    taskQueue.push(task.uuid);

    await cond.notify();
    return task.promise;
  };

  if (transportedState) {
    for (const task of transportedState.tasks) {
      taskMap.set(task.uuid, new QueuedTask(task.input, task.completion));
      if (task.completion === undefined) {
        taskQueue.push(task.uuid);
      }
    }
  }

  wf.setHandler(submitTaskUpdate, handleIncomingTask);

  await wf.condition(() => wf.workflowInfo().continueAsNewSuggested);

  // Note that we don't need to transport taskQueue, as JS's Map guarantees that
  // iteration ordering match intertion order.
  transportedState = {
    tasks: Array.from(taskMap.values())
      .filter((task) => !task.isExpired())
      .map((task) => task.toSerializedState()),
  };

  // FIXME: Confirm either this is required, if so, that it is enough.
  // We need to make sure that task promises are fully completed before execution of the workflow reaches the
  // continueAsNew call below. However, this `Promise.resolve()` can't result in  completion of the workflow task,
  // so there's no risk that new update calls could came in due to this await.
  await Promise.resolve();

  // FIXME: Confirm that Update completion sent in the same WFT completion as
  // a CAN command correctly get processed by the server
  await wf.continueAsNew(transportedState);
}

const workflowId = 'task-processor';
const temporalTaskQueue = 'task-processor';

async function starter(client: Client): Promise<void> {
  const wfHandle = await client.workflow.start(entityWorkflowWithUpdate, {
    taskQueue: temporalTaskQueue,
    workflowId,
    workflowIdReusePolicy: WorkflowIdReusePolicy.WORKFLOW_ID_REUSE_POLICY_TERMINATE_IF_RUNNING,
  });
  await Promise.all([
    wfHandle.executeUpdate(submitTaskUpdate, { args: [{ uuid: '1' }] }),
    wfHandle.executeUpdate(submitTaskUpdate, { args: [{ uuid: '2' }] }),
    wfHandle.executeUpdate(submitTaskUpdate, { args: [{ uuid: '3' }] }),
  ]);
  console.log(wfHandle.result());
}

async function main(): Promise<void> {
  const worker = await Worker.create({
    workflowsPath: __filename,
    activities,
    taskQueue: temporalTaskQueue,
    bundlerOptions: {
      ignoreModules: ['@temporalio/client', '@temporalio/worker'],
    },
  });
  const connection = await Connection.connect();
  const client = new Client({ connection });
  await worker.runUntil(starter(client));
}

if (!inWorkflowContext()) {
  Runtime.install({ logger: new DefaultLogger('WARN') });
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
