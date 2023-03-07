import { canonicalize } from 'json-canonicalize';
import { BLOCK_REWARD, TARGET } from './block';
import { chainManager } from './chain';
import { hash } from './crypto/hash';
import { mempool } from './mempool';
import crypto from 'crypto';
import {
  BlockObjectType,
  ObjectMessageType,
  TransactionObjectType,
} from './message';
import * as ed from '@noble/ed25519';
import { network } from './network';
import { objectManager } from './object';

export class Miner {
  privateKey: Uint8Array | undefined;
  publicKey: Uint8Array | undefined;
  publicKeyHex: string | undefined;
  initialized: boolean = false;
  ourCoinbaseUtxos: string[] = []; // array of txids
  async init() {
    this.privateKey = ed.utils.randomPrivateKey();
    this.publicKey = await ed.getPublicKey(this.privateKey);
    this.publicKeyHex = Buffer.from(this.publicKey).toString('hex');
    this.initialized = true;
  }
  async mine() {
    while (true) {
      const mempoolTxs = [...mempool.txs];
      const tipHeight = chainManager.longestChainHeight;
      const tip = chainManager.longestChainTip!;
      const mempoolFees = mempoolTxs
        .map(tx => tx.fees!)
        .reduce((sum, fee) => sum + fee, 0);
      const coinbaseTx: TransactionObjectType = {
        type: 'transaction',
        outputs: [
          { value: BLOCK_REWARD + mempoolFees, pubkey: this.publicKeyHex! },
        ],
        height: tipHeight + 1,
      };
      const txids = mempoolTxs.map(tx => tx.txid);
      const coinbaseTxid = hash(canonicalize(coinbaseTx));
      txids.unshift(coinbaseTxid);
      const candidateBlock: BlockObjectType = {
        type: 'block',
        txids,
        nonce: crypto.randomBytes(32).toString('hex'),
        previd: tip.blockid,
        created: Date.now() / 1000,
        T: TARGET,
        miner: 'knickknack',
        note: 'thx for an awesome quarter!',
        studentids: ['nkhemani', 'lakong'],
      };
      const candidateBlockId = hash(canonicalize(candidateBlock));
      if (BigInt(`0x${candidateBlockId}`) <= BigInt(`0x${TARGET}`)) {
        await objectManager.put(coinbaseTx);
        await objectManager.put(candidateBlock);
        const coinbaseTxMessage: ObjectMessageType = {
          type: 'object',
          object: coinbaseTx,
        };
        const candidateBlockMessage: ObjectMessageType = {
          type: 'object',
          object: candidateBlock,
        };
        network.broadcast(coinbaseTxMessage);
        network.broadcast(candidateBlockMessage);
        this.ourCoinbaseUtxos.push(coinbaseTxid);
        return;
      }
    }
  }
  async dumpCoinsOnDionyziz() {
    for (const txid in this.ourCoinbaseUtxos) {
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
            value: 50,
            pubkey:
              '3f0bc71a375b574e4bda3ddf502fe1afd99aa020bf6049adfe525d9ad18ff33f',
          },
        ],
      };
      const sig = await ed.sign(canonicalize(tx), this.privateKey!);
      tx.inputs[0].sig = Buffer.from(sig).toString('hex');
      await objectManager.put(tx);
      const txMessage: ObjectMessageType = {
        type: 'object',
        object: tx,
      };
      network.broadcast(txMessage);
    }
    this.ourCoinbaseUtxos = [];
  }
}
