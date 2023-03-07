import { Miner } from './miner';
import { parentPort } from 'worker_threads';

(async function () {
  const miner = new Miner();
  await miner.init();
  while (true) {
    await miner.mine();
    await miner.dumpCoinsOnDionyziz();
    parentPort?.postMessage('success');
  }
})();
