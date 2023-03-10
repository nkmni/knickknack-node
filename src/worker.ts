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
  let prevHashes = 0;
  const templateBlock: BlockObjectType = workerData;
  const templateStr = canonicalize(templateBlock);
  const [prefix, suffix] = templateStr.split('null');
  while (true) {
    // candidateBlock.nonce = crypto.randomBytes(32).toString('hex');
    // const candidateBlockId = hash(canonicalize(candidateBlock));
    const nonce = crypto.randomBytes(32).toString('hex');
    const candidateBlockStr = `${prefix}"${nonce}"${suffix}`;
    const candidateBlockId = hash(candidateBlockStr);
    if (BigInt(`0x${candidateBlockId}`) <= BigInt(`0x${TARGET}`)) {
      parentPort?.postMessage('successfully mined block');
      parentPort?.postMessage(JSON.parse(candidateBlockStr));
      break;
    }
    ++hashes;
    let totalSeconds = (Date.now() - startTime) / 1000;
    if (totalSeconds - prevTotalSeconds > 5) {
      parentPort?.postMessage(`avg hashrate: ${hashes / totalSeconds}`);
      parentPort?.postMessage(
        `curr hashrate: ${
          (hashes - prevHashes) / (totalSeconds - prevTotalSeconds)
        }`,
      );
      prevHashes = hashes;
      prevTotalSeconds = totalSeconds;
    }
  }
}

main();
