import { logger } from './logger';
import { network } from './network';
import { chainManager } from './chain';
import { mempool } from './mempool';
import { Worker } from 'worker_threads';
import { objectManager } from './object';
import * as ed from '@noble/ed25519';

const BIND_PORT = 18018;
const BIND_IP = '0.0.0.0';

logger.info(`Knickknack Node`);
logger.info(`Lauren Kong and Neil Khemani`);

async function mineBlock() {
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = await ed.getPublicKey(privateKey);
  const publicKeyHex = Buffer.from(publicKey).toString('hex');

  const worker = new Worker('./src/worker.js', {
    workerData: {
      privateKey: privateKey,
      publicKey: publicKey,
      publicKeyHex: publicKeyHex,
      mempool: mempool,
      chainHeight: chainManager.longestChainHeight,
      chainTip: chainManager.longestChainTip!,
    },
  });

  worker.on('message', async block => {
    const parentBlock = await block.loadParent();
    const stateAfter = parentBlock!.stateAfter!.copy();
    await stateAfter!.applyMultiple(mempool.txs, block);
    block.stateAfter = stateAfter;
    block.valid = true;
    await block.save();
    await objectManager.put(block);
    await chainManager.onValidBlockArrival(block);
    network.broadcast(block.toNetworkObject());
    worker.terminate();
  });

  worker.on('error', (error: Error) => {
    console.log(error);
  });

  worker.on('exit', (exitCode: number) => {
    console.log(`Worker exited with code ${exitCode}`);
    mineBlock();
  });
}

async function main() {
  await chainManager.init();
  await mempool.init();
  network.init(BIND_PORT, BIND_IP);
  mineBlock();
}

main();
