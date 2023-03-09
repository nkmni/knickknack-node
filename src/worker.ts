import { BlockObjectType } from './message';
import { parentPort, workerData } from 'worker_threads';
import crypto from 'crypto';
import { canonicalize } from 'json-canonicalize';
import { hash } from './crypto/hash';
import { TARGET } from './block';

function main() {
  let hashes = 0;
  const startTime = Date.now();
  let prevTotalSeconds = 0;
  const candidateBlock: BlockObjectType = workerData;
  while (true) {
    let totalSeconds = (Date.now() - startTime) / 1000;
    if (totalSeconds - prevTotalSeconds > 5) {
      prevTotalSeconds = totalSeconds;
      parentPort?.postMessage(`hashrate: ${hashes / totalSeconds}`);
    }
    candidateBlock.nonce = crypto.randomBytes(32).toString('hex');
    const candidateBlockId = hash(canonicalize(candidateBlock));
    if (BigInt(`0x${candidateBlockId}`) <= BigInt(`0x${TARGET}`)) {
      parentPort?.postMessage('successfully mined block');
      parentPort?.postMessage(candidateBlock);
      break;
    }
    ++hashes;
  }
}

main();
