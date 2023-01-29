import { ObjectId, ObjectStorage } from './store';
import { AnnotatedError, BlockObject, BlockObjectType } from './message';
import { PublicKey, Signature, ver } from './crypto/signature';
import { canonicalize } from 'json-canonicalize';

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
    for (const txid in this.txids) {
      if (!(await ObjectStorage.exists(txid))) {
        // not sure how to do this
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
