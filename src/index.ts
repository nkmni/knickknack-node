import { logger } from './logger';
import { network } from './network';
import { chainManager } from './chain';
import { mempool } from './mempool';
import { AnnotatedError } from './message';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { Miner } from './miner';

const BIND_PORT = 18018;
const BIND_IP = '45.77.3.115';

logger.info(`Knickknack - A Marabu node`);
logger.info(`Neil Khemani & Lauren Kong`);

async function main() {
  await chainManager.init();
  await mempool.init();
  network.init(BIND_PORT, BIND_IP);

  function importWorker(path: string, options?: WorkerOptions) {
    const resolvedPath = require.resolve(path);
    return new Worker(resolvedPath, {
      ...options,
      execArgv: /\.ts$/.test(resolvedPath)
        ? ['require', 'ts-node/register']
        : undefined,
    });
  }

  const worker = importWorker('./worker.js');
  worker.on('message', msg => {
    console.log(msg);
  });
}

main();
