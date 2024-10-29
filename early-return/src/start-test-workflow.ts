import { Connection, Client } from '@temporalio/client';
import { transactionWorkflow } from './workflows';
import { getTransactionConfirmation } from './shared';

const transactionID = process.argv[2];
if (!transactionID) {
  throw new Error('Must set transactionID');
}

async function run() {
  const connection = await Connection.connect();
  const client = new Client({ connection });
  const workflowId = 'transaction-' + transactionID;

  const transaction = client.workflow.withStart(transactionWorkflow, {
    workflowId,
    args: [transactionID],
    taskQueue: 'early-return',
  });

  const earlyConfirmation = await transaction.executeUpdate(getTransactionConfirmation);
  const finalReport = await transaction.result();

  console.log(`transaction confirmation: ${JSON.stringify(earlyConfirmation)}`);
  console.log(`transaction report: ${JSON.stringify(finalReport)}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
