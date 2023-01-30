import { ObjectId, ObjectStorage, storageEventEmitter } from './store';
import {
  AnnotatedError,
  BlockObjectType,
  CoinbaseTransactionObject,
  TransactionObjectType,
} from './message';
import { network } from './network';
import { Transaction } from './transaction';
import { resolve } from 'path';

export class Block {
  blockid: ObjectId;
  txids: string[];
  nonce: string;
  previd: string | null;
  created: number;
  T: string;
  miner: string;
  note: string;

  static fromNetworkObject(block: BlockObjectType): Block {
    return new Block(
      ObjectStorage.id(block),
      block.txids,
      block.nonce,
      block.previd,
      block.created,
      block.T,
      block.miner,
      block.note,
    );
  }
  static async byId(blockid: ObjectId): Promise<Block> {
    return this.fromNetworkObject(await ObjectStorage.get(blockid));
  }
  constructor(
    blockid: ObjectId,
    txids: string[],
    nonce: string,
    previd: string | null,
    created: number,
    T: string,
    miner: string,
    note: string,
  ) {
    this.blockid = blockid;
    this.txids = txids;
    this.nonce = nonce;
    this.previd = previd;
    this.created = created;
    this.T = T;
    this.miner = miner;
    this.note = note;
  }
  async validate() {
    if (
      this.T !==
      '00000000abc00000000000000000000000000000000000000000000000000000'
    ) {
      throw new AnnotatedError(
        'INVALID_FORMAT',
        `Block ${this.blockid} has invalid target: ${this.T}`,
      );
    }
    if (this.blockid >= this.T) {
      throw new AnnotatedError(
        'INVALID_BLOCK_POW',
        `Block ${this.blockid} has invalid Proof of Work`,
      );
    }
    await Promise.all(
      this.txids.map(async (txid, i) => {
        if (!(await ObjectStorage.exists(txid))) {
          // txid not in database
          // broadcast getobject to all peers
          network.broadcastGetObject(txid);

          return new Promise<void>((resolve, reject) => {
            // wait 10 seconds before giving up on finding missing transaction
            const timeout = setTimeout(() => {
              reject(
                new AnnotatedError(
                  'UNFINDABLE_OBJECT',
                  `Block ${this.blockid} contains transaction ${txid} that could not be found.`,
                ),
              );
            }, 10000);

            // callback for when new object shows up in storage
            const checkForTx = (objectid: string) => {
              if (txid === objectid) {
                clearTimeout(timeout);
                storageEventEmitter.off('put', checkForTx);
                resolve();
              }
            };

            // turn on callback on object
            storageEventEmitter.on('put', checkForTx);
          });
        }
      }),
    );
    // check that there are no coinbase txs at non-zero indices
    // and that no other tx in block spends the coinbase tx if present.
    // sum fees while you're at it.
    if (this.txids.length > 0) {
      const firstTxid = this.txids[0];
      const firstTxObj = await ObjectStorage.get(firstTxid);
      const firstTxIsCoinbase = CoinbaseTransactionObject.guard(firstTxObj);
      let sumFees = 0;
      for (let i = 1; i < this.txids.length; ++i) {
        const txid = this.txids[i];
        const txObj: TransactionObjectType = await ObjectStorage.get(txid);
        if (CoinbaseTransactionObject.guard(txObj)) {
          throw new AnnotatedError(
            'INVALID_BLOCK_COINBASE',
            `Block ${this.blockid} contains coinbase transaction ${txid} at a non-zero index.`,
          );
        }
        const tx = Transaction.fromNetworkObject(txObj);
        sumFees += await tx.calculateFee();
        if (firstTxIsCoinbase) {
          for (const input of txObj.inputs) {
            if (input.outpoint.txid === firstTxid) {
              throw new AnnotatedError(
                'INVALID_TX_OUTPOINT',
                `Block ${this.blockid} contains transaction ${txid} that spends coinbase transaction ${firstTxid} in same block.`,
              );
            }
          }
        }
      }
      // validate coinbase transaction if present
      if (
        firstTxIsCoinbase &&
        firstTxObj.outputs[0].value > 50 * 10 ** 12 + sumFees
      ) {
        throw new AnnotatedError(
          'INVALID_BLOCK_COINBASE',
          `Block ${this.blockid} contains coinbase transaction ${firstTxid} with output value greater than block reward plus fees.`,
        );
      }
    }
  }
  toNetworkObject(): BlockObjectType {
    return {
      type: 'block',
      txids: this.txids,
      nonce: this.nonce,
      previd: this.previd,
      created: this.created,
      T: this.T,
      miner: this.miner,
      note: this.note,
    };
  }
}
