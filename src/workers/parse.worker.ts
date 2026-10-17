import { readLog } from '@/io/registry';
import {
  toErrorResponse,
  transferablesOf,
  type WorkerRequest,
  type WorkerResponse,
} from './protocol';

const post = (msg: WorkerResponse, transfer: Transferable[] = []) =>
  self.postMessage(msg, { transfer });

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  try {
    const log = await readLog(event.data.file, (fraction) => post({ type: 'progress', fraction }));
    post({ type: 'done', log }, transferablesOf(log));
  } catch (err) {
    post(toErrorResponse(err));
  }
};
