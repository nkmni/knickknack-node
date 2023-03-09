import { BlockObjectType } from './message';
import { parentPort, workerData } from 'worker_threads';
import crypto from 'crypto';
import { canonicalize } from 'json-canonicalize';
import { hash } from './crypto/hash';
import { TARGET } from './block';

function main() {
  const candidateBlock: BlockObjectType = workerData;
  while (true) {
    candidateBlock.nonce = crypto.randomBytes(32).toString('hex');
    const candidateBlockId = hash(canonicalize(candidateBlock));
    if (BigInt(`0x${candidateBlockId}`) <= BigInt(`0x${TARGET}`)) {
      parentPort?.postMessage(candidateBlock);
      break;
    }
  }
}

main();
