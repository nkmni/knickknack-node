import { logger } from './logger'
import { network } from './network'
import { Block, BLOCK_REWARD, TARGET } from './block';
import { chainManager } from './chain'
import { mempool } from './mempool'
import { AnnotatedError } from './message'
import { Worker } from "worker_threads";
import { objectManager } from './object';

const BIND_PORT = 18018
const BIND_IP = '0.0.0.0'

logger.info(`Malibu - A Marabu node`)
logger.info(`Dionysis Zindros <dionyziz@stanford.edu>`)

async function main() {
  await chainManager.init()
  await mempool.init()
  network.init(BIND_PORT, BIND_IP)

  // TODO: After mined, restart this worker and resend new workerData
  const worker = new Worker("./src/worker.js", { workerData: {
    mempool: mempool, 
    chainHeight : chainManager.longestChainHeight,
    chainTip : chainManager.longestChainTip!, 
  }
  });

  worker.on('message', async (block) => {
    /* TODO: FIX
    await objectManager.put(block);
    const candidateBlock = await Block.fromNetworkObject(block);
    candidateBlock.height = currentData.chainHeight + 1;
    const parentBlock = await candidateBlock.loadParent();
    const stateAfter = parentBlock!.stateAfter!.copy();
    await stateAfter!.applyMultiple(mempool.txs, candidateBlock);
    candidateBlock.stateAfter = stateAfter;
    candidateBlock.fees = mempoolFees;
    candidateBlock.valid = true;
    await candidateBlock.save();
    await chainManager.onValidBlockArrival(candidateBlock); */
    network.broadcast(block);
  });
  
  worker.on("error", (error: Error) => {
    console.log(error);
  });

  worker.on("exit", (exitCode: number) => {
    console.log(`It exited with code ${exitCode}`);
  });
}

main()