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
  if (isMainThread) {
    await chainManager.init();
    await mempool.init();
    network.init(BIND_PORT, BIND_IP);
    const worker = new Worker(__filename);
    worker.on('message', msg => {
      console.log(msg);
    });
  } else {
    const miner = new Miner();
    await miner.init();
    while (true) {
      miner.mine();
      miner.dumpCoinsOnDionyziz();
    }
  }
}

main();
