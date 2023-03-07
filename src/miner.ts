import { canonicalize } from 'json-canonicalize';
import { Block, BLOCK_REWARD, TARGET } from './block';
import { chainManager } from './chain';
import { hash } from './crypto/hash';
import { mempool } from './mempool';
import crypto from 'crypto';
import { BlockObjectType, TransactionObjectType } from './message';
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
  async mine(): Promise<BlockObjectType> {
    while (true) {
      // grab values from shared memory once at beginning
      const currentMempool = mempool;
      const chainHeight = chainManager.longestChainHeight;
      const chainTip = chainManager.longestChainTip;

      const mempoolFees = currentMempool.txs
        .map(tx => tx.fees!)
        .reduce((sum, fee) => sum + fee, 0);
      const coinbaseTx: TransactionObjectType = {
        type: 'transaction',
        outputs: [
          { value: BLOCK_REWARD + mempoolFees, pubkey: this.publicKeyHex! },
        ],
        height: chainHeight + 1,
      };
      const txids = currentMempool.txs.map(tx => tx.txid);
      const coinbaseTxHash = hash(canonicalize(coinbaseTx));
      txids.unshift(coinbaseTxHash);
      const candidate: BlockObjectType = {
        type: 'block',
        txids,
        nonce: crypto.randomBytes(32).toString('hex'),
        previd: chainManager.longestChainTip!.blockid,
        created: Date.now() / 1000,
        T: TARGET,
        miner: 'knickknack',
        note: 'thx for an awesome quarter!',
        studentids: ['nkhemani', 'lakong'],
      };
      if (
        BigInt(`0x${hash(canonicalize(candidate))}`) <
        BigInt(`0x${TARGET}`)
      ) {
        await objectManager.put(coinbaseTx);
        network.broadcast(coinbaseTx);
        // TODO: Needs Validation!
        // save block (as class)
        const candidateBlock = await Block.fromNetworkObject(candidate);
        // validation begin
        candidateBlock.valid = true;
          // TODO: candidateBlock.stateAfter = ;
        candidateBlock.height = chainHeight + 1;
        await candidateBlock.save();
        if (!(await objectManager.exists(candidateBlock.blockid))) {
          await objectManager.put(candidate);
        }        
        await chainManager.onValidBlockArrival(candidateBlock);
        // validation end
        network.broadcast(candidateBlock.toNetworkObject());
        this.ourCoinbaseUtxos.push(coinbaseTxHash);
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
      network.broadcast(tx);
    }
    this.ourCoinbaseUtxos = [];
  }
}
