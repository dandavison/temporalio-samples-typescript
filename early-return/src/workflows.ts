import { condition, setHandler, sleep } from '@temporalio/workflow';
import { getTransactionConfirmation, TransactionReport } from './shared';

export async function transactionWorkflow(id: string): Promise<TransactionReport> {
  let confirmed = false;
  setHandler(getTransactionConfirmation, () => {
    confirmed = true;
    return { id, status: 'confirmed' };
  });
  await condition(() => confirmed);
  await sleep(1000);
  let amount = 77;
  return { id, amount, status: 'complete' };
}
