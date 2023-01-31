export type ObjectId = string;

import level from 'level-ts';
import { canonicalize } from 'json-canonicalize';
import {
  AnnotatedError,
  TransactionObject,
  ObjectType,
  ObjectTxOrBlock,
  OutpointObjectType,
} from './message';
import { Transaction } from './transaction';
import { logger } from './logger';
import { hash } from './crypto/hash';
import { Block } from './block';
import { EventEmitter } from 'events';

export const db = new level('./db');

export const storageEventEmitter = new EventEmitter();

export class ObjectStorage {
  static id(obj: any) {
    const objStr = canonicalize(obj);
    const objId = hash(objStr);
    return objId;
  }
  static async exists(objectid: ObjectId) {
    return await db.exists(`object:${objectid}`);
  }
  static async get(objectid: ObjectId) {
    try {
      return await db.get(`object:${objectid}`);
    } catch {
      throw new AnnotatedError(
        'UNKNOWN_OBJECT',
        `Object ${objectid} not known locally`,
      );
    }
  }
  static async del(objectid: ObjectId) {
    try {
      return await db.del(`object:${objectid}`);
    } catch {
      throw new AnnotatedError(
        'UNKNOWN_OBJECT',
        `Object ${objectid} not known locally`,
      );
    }
  }
  static async put(object: any) {
    logger.debug(`Storing object with id ${this.id(object)}: %o`, object);
    const ret = await db.put(`object:${this.id(object)}`, object);
    storageEventEmitter.emit('put', this.id(object));
    return ret;
  }
  static async getUtxoSet(blockid: ObjectId): Promise<OutpointObjectType[]> {
    try {
      return await db.get(`utxo:${blockid}`);
    } catch {
      throw new AnnotatedError(
        'UNKNOWN_OBJECT',
        `UTXO set for block ${blockid} not known locally`,
      );
    }
  }
  static async putUtxoSet(blockid: ObjectId, utxoSet: OutpointObjectType[]) {
    logger.debug(`Storing UTXO for block with id ${blockid}: %o`, utxoSet);
    const ret = await db.put(`utxo:${blockid}`, utxoSet);
    storageEventEmitter.emit('put-utxo', utxoSet);
    return ret;
  }
  static async validate(object: ObjectType) {
    if (!ObjectTxOrBlock.guard(object)) {
      throw new AnnotatedError('INVALID_FORMAT', 'Failed to parse object');
    }
    if (TransactionObject.guard(object)) {
      const tx = Transaction.fromNetworkObject(object);
      await tx.validate();
    } else {
      // It's a block object.
      const block = Block.fromNetworkObject(object);
      await block.validate();
    }
  }
}
