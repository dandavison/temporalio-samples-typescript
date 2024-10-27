import { defineUpdate } from '@temporalio/workflow';

export interface TransactionReport {
  id: string;
  status: 'complete' | 'failed';
  amount: number;
}

export interface TransactionConfirmation {
  id: string;
  status: string;
}

export const getTransactionConfirmation = defineUpdate<TransactionConfirmation, []>('get-transaction-confirmation');

export const taskQueue = 'early-return';
