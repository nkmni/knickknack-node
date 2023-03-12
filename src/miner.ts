import { canonicalize } from 'json-canonicalize';
import { BLOCK_REWARD, Block, TARGET } from './block';
import { chainManager } from './chain';
import { hash } from './crypto/hash';
import { mempool } from './mempool';
import crypto from 'crypto';
import {
  BlockObject,
  BlockObjectType,
  ObjectMessageType,
  TransactionObjectType,
} from './message';
import * as ed from '@noble/ed25519';
import { network } from './network';
import { objectManager } from './object';
import { Worker, WorkerOptions } from 'worker_threads';
import { writeFileSync } from 'fs';
import { logger } from './logger';
import { Transaction } from './transaction';
import { Deferred } from './promise';

export class Miner {
  privateKey: Uint8Array | undefined;
  publicKey: Uint8Array | undefined;
  publicKeyHex: string | undefined;
  worker: Worker | undefined;
  deferredUpdate: Deferred<boolean> | undefined;

  async init() {
    this.privateKey = ed.utils.randomPrivateKey();
    this.privateKey = Uint8Array.from(Buffer.from('e918506d92dfce0ebb16b3acebd005da6552f5ccf72a08c75979632ce6a020a3', 'hex'));
    this.publicKey = await ed.getPublicKey(this.privateKey);
    const privateKeyHex = Buffer.from(this.privateKey).toString('hex');
    this.publicKeyHex = Buffer.from(this.publicKey).toString('hex');

    writeFileSync(
      `./keys/${Date.now()}.txt`,
      `sec: ${privateKeyHex}\npub: ${this.publicKeyHex}`,
    );

    await this.updateWorker();
  }
  async updateWorker() {
    while (this.deferredUpdate !== undefined) {
      await this.deferredUpdate.promise;
    }
    this.deferredUpdate = new Deferred<boolean>();
    await this.worker?.terminate();
    const candidateBlock = await this.generateCandidateBlock();
    this.worker = this.spawnWorker(candidateBlock);
    this.deferredUpdate.resolve(true);
    this.deferredUpdate = undefined;
  }
  importWorker(path: string, options?: WorkerOptions) {
    const resolvedPath = require.resolve(path);
    return new Worker(resolvedPath, {
      ...options,
      execArgv: /\.ts$/.test(resolvedPath)
        ? ['--require', 'ts-node/register']
        : undefined,
    });
  }
  spawnWorker(candidateBlock: object) {
    const worker = this.importWorker('./worker.js', {
      workerData: candidateBlock,
    });
    writeFileSync(
      './errorlogs/log.txt',
      `${Date.now()}\n${JSON.stringify(worker)}\n\n`,
    );
    worker.on('message', async msg => {
      if (BlockObject.guard(msg)) {
        const minedBlockObj: BlockObjectType = msg;
        const minedBlockStr = canonicalize(minedBlockObj);
        writeFileSync(
          `./blocks/${Date.now()}.txt`,
          `${hash(minedBlockStr)}\n\n${minedBlockStr}`,
        );
        const candidateBlockMessage: ObjectMessageType = {
          type: 'object',
          object: minedBlockObj,
        };
        network.broadcast(candidateBlockMessage);
        const minedBlock = await Block.fromNetworkObject(minedBlockObj);
        await this.dumpCoinsOnDionyziz(minedBlock.txids[0]);
        await this.updateWorker();
      } else {
        logger.log('debug', `worker: ${msg}`);
      }
    });
    worker.on('error', (error: Error) => {
      console.log(error);
      // writeFileSync(
      //   './errorlogs/log.txt',
      //   `${Date.now()}\n${error.name}\n${error.message}\n${error.stack}\n\n`,
      // );
    });
    return worker;
  }
  async generateCandidateBlock() {
    const mempoolTxs = [...mempool.txs];
    const tipHeight = chainManager.longestChainHeight;
    const tip = chainManager.longestChainTip!;

    const mempoolFees = mempoolTxs
      .map(tx => tx.fees ?? 0)
      .reduce((sum, fee) => sum + fee, 0);

    const coinbaseTxObj: TransactionObjectType = {
      type: 'transaction',
      outputs: [
        { value: BLOCK_REWARD + mempoolFees, pubkey: this.publicKeyHex! },
      ],
      height: tipHeight + 1,
    };

    await objectManager.put(coinbaseTxObj);
    const coinbaseTxid = hash(canonicalize(coinbaseTxObj));

    const txids = mempoolTxs.map(tx => tx.txid);
    txids.unshift(coinbaseTxid);
    const candidateBlock = {
      type: 'block',
      txids,
      nonce: null,
      previd: tip.blockid,
      created: Math.floor(Date.now() / 1000),
      T: TARGET,
      miner: 'knickknack',
      note: 'thx for an awesome quarter!',
      studentids: ['nkhemani', 'lakong'],
    };
    return candidateBlock;
  }
  async dumpCoinsOnDionyziz(txid: string) {
    const inputTxObj = await objectManager.get(txid);
    const inputTx = Transaction.fromNetworkObject(inputTxObj);
    const value = inputTx.outputs[0].value;
    const tx: TransactionObjectType = {
      type: 'transaction',
      inputs: [
        {
          outpoint: { txid, index: 0 },
          sig: null,
        },
      ],
      outputs: [
        {
          value,
          pubkey:
            '3f0bc71a375b574e4bda3ddf502fe1afd99aa020bf6049adfe525d9ad18ff33f',
        },
      ],
    };
    writeFileSync(`./txs/${Date.now()}.txt`, `${hash(canonicalize(tx))}\n\n${canonicalize(tx)}`);
    const sig = await ed.sign(Buffer.from(canonicalize(tx)), this.privateKey!);
    tx.inputs[0].sig = Buffer.from(sig).toString('hex');
    await objectManager.put(tx);
    const txMessage: ObjectMessageType = {
      type: 'object',
      object: tx,
    };
    network.broadcast(txMessage);
  }
}

export const miner = new Miner();
