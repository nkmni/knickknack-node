import { ObjectId, ObjectStorage, storageEventEmitter } from './store';
import { AnnotatedError, BlockObject, BlockObjectType } from './message';
import { PublicKey, Signature, ver } from './crypto/signature';
import { canonicalize } from 'json-canonicalize';
import { networkEventEmitter } from './network';

export class Block {
  blockid: ObjectId;
  txids: string[];
  nonce: string;
  previd: string | null;
  created: number;
  T: string;
  miner: string;
  note: string;

  static inputsFromNetworkObject() {}
  static outputsFromNetworkObject() {}
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

          // emit 'search' to broadcast getobject to all peers
          networkEventEmitter.emit('search', txid);

          // wait 10 seconds before giving up on finding missing transaction
          const timeout = setTimeout(() => {
            throw new AnnotatedError(
              'UNFINDABLE_OBJECT',
              `Block ${this.blockid} contains transaction ${txid} that could not be found.`,
            );
          }, 10000);

          // callback for when new object shows up in storage
          const checkForTx = (objectid: string) => {
            if (txid === objectid) {
              clearTimeout(timeout);
              storageEventEmitter.off('put', checkForTx);
            }
          };

          // turn on callback on object
          storageEventEmitter.on('put', checkForTx);
        }
      }),
    );
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
