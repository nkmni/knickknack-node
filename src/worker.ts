import { BlockObjectType } from './message';
import { parentPort, workerData } from 'worker_threads';
import crypto from 'crypto';
import { canonicalize } from 'json-canonicalize';
import { hash } from './crypto/hash';
import { TARGET } from './block';
import { logger } from './logger';

function main() {
  let hashes = 0;
  const startTime = Date.now();
  let prevTotalSeconds = 0;
  const candidateBlock: BlockObjectType = workerData;
  while (true) {
    let totalSeconds = (Date.now() - startTime) / 1000;
    if (totalSeconds - prevTotalSeconds > 5) {
      prevTotalSeconds = totalSeconds;
      logger.log('debug', `hashrate: ${hashes / totalSeconds}`);
    }
    candidateBlock.nonce = crypto.randomBytes(32).toString('hex');
    const candidateBlockId = hash(canonicalize(candidateBlock));
    if (BigInt(`0x${candidateBlockId}`) <= BigInt(`0x${TARGET}`)) {
      parentPort?.postMessage(candidateBlock);
      break;
    }
    ++hashes;
  }
}

main();
