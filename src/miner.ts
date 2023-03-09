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
import { EventEmitter } from 'events';
import { writeFileSync } from 'fs';
import { logger } from './logger';
import { Transaction } from './transaction';

export const minerEventEmitter = new EventEmitter();

export class Miner {
  privateKey: Uint8Array | undefined;
  publicKey: Uint8Array | undefined;
  publicKeyHex: string | undefined;
  worker: Worker | undefined;

  async init() {
    this.privateKey = ed.utils.randomPrivateKey();
    this.publicKey = await ed.getPublicKey(this.privateKey);
    const privateKeyHex = Buffer.from(this.privateKey).toString('hex');
    this.publicKeyHex = Buffer.from(this.publicKey).toString('hex');

    writeFileSync(
      `./keys/${Date.now()}.txt`,
      `sec: ${privateKeyHex}\npub: ${this.publicKeyHex}`,
    );

    const candidateBlock = await this.generateCandidateBlock();
    this.worker = this.spawnWorker(candidateBlock);

    minerEventEmitter.on('update', async data => {
      this.worker?.terminate();
      const candidateBlock = await this.generateCandidateBlock();
      this.worker = this.spawnWorker(candidateBlock);
    });
  }
  importWorker(path: string, options?: WorkerOptions) {
    const resolvedPath = require.resolve(path);
    return new Worker(resolvedPath, {
      ...options,
      execArgv: /\.ts$/.test(resolvedPath)
        ? ["--require", "ts-node/register"]
        : undefined,
    });
  }
  spawnWorker(candidateBlock: BlockObjectType) {
    const worker = this.importWorker('./worker.ts', { workerData: candidateBlock });
    worker.on('message', async (msg) => {
      if (BlockObject.guard(msg)) {
        const minedBlockObj: BlockObjectType = msg;
        const candidateBlockMessage: ObjectMessageType = {
          type: 'object',
          object: minedBlockObj,
        };
        network.broadcast(candidateBlockMessage);
        const minedBlock = await Block.fromNetworkObject(minedBlockObj);
        await this.dumpCoinsOnDionyziz(minedBlock.txids[0]);
        const candidateBlock = await this.generateCandidateBlock();
        this.worker = this.spawnWorker(candidateBlock);
      } else {
        logger.log('debug', `worker: ${msg}`);
      }
    });
    worker.on('error', (error: Error) => {
      console.log(error);
    });
    return worker;
  }
  async generateCandidateBlock(): Promise<BlockObjectType> {
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
    const candidateBlock: BlockObjectType = {
      type: 'block',
      txids,
      nonce: crypto.randomBytes(32).toString('hex'),
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
    writeFileSync(
      `./txs/${Date.now()}.txt`,
      `${hash(canonicalize(tx))}`,
    );
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
