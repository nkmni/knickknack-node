import { canonicalize } from 'json-canonicalize';
import { Block, BLOCK_REWARD, TARGET } from './block';
import { chainManager } from './chain';
import { hash } from './crypto/hash';
import { MemPool } from './mempool';
import crypto from 'crypto';
import { TransactionObjectType } from './message';
import * as ed from '@noble/ed25519';
import { network } from './network';

export class Miner {
  privateKey: Uint8Array | undefined;
  publicKey: Uint8Array | undefined;
  publicKeyHex: string | undefined;
  initialized: boolean = false;
  ourCoinbaseUtxos: string[] = []; // array of txids
  currentMempool: MemPool;
  chainHeight: number;
  chainTip: Block;

  async init(mempool: MemPool, chainHeight: number, chainTip: Block) {
    this.privateKey = ed.utils.randomPrivateKey();
    this.publicKey = await ed.getPublicKey(this.privateKey);
    this.publicKeyHex = Buffer.from(this.publicKey).toString('hex');
    this.initialized = true;
    this.currentMempool = mempool;
    this.chainHeight = chainHeight;
    this.chainTip = chainTip;
  }
  async mine(): Promise<Block> {
    while (true) {
      const mempoolFees = this.currentMempool.txs
        .map(tx => tx.fees!)
        .reduce((sum, fee) => sum + fee, 0);
      const coinbaseTx: TransactionObjectType = {
        type: 'transaction',
        outputs: [
          { value: BLOCK_REWARD + mempoolFees, pubkey: this.publicKeyHex! },
        ],
        height: this.chainHeight + 1,
      };
      const txids = this.currentMempool.txs.map(tx => tx.txid);
      const coinbaseTxHash = hash(canonicalize(coinbaseTx));
      txids.unshift(coinbaseTxHash);
      const candidateBlock = new Block (
        chainManager.longestChainTip!.blockid,
        txids, 
        crypto.randomBytes(32).toString('hex'),
        TARGET,
        Math.floor(new Date().getTime() / 1000),
        'knickknack-node',
        'thx for an awesome quarter!',
        ['nkhemani', 'lakong']
      );
      if (candidateBlock.hasPoW()) {
        candidateBlock.height = this.chainHeight + 1;
        candidateBlock.fees = mempoolFees;
        candidateBlock.valid = true;
        return candidateBlock;
      }
      /*
      const candidateBlock : BlockObjectType {
        type: 'block',
        txids,
        nonce: crypto.randomBytes(32).toString('hex'),
        previd: chainManager.longestChainTip!.blockid,
        // how PSET5 Solutions gets block time
        created: Math.floor(new Date().getTime() / 1000),
        T: TARGET,
        miner: 'knickknack',
        note: 'thx for an awesome quarter!',
        studentids: ['nkhemani', 'lakong'],
      };
      if (
        BigInt(`0x${hash(canonicalize(candidate))}`) <
        BigInt(`0x${TARGET}`)
      ) { */
        /* coinbase
        await objectManager.put(coinbaseTx);
        await Transaction.fromNetworkObject(coinbaseTx).validate();
        network.broadcast(coinbaseTx);
        this.ourCoinbaseUtxos.push(coinbaseTxHash);
        // block
        await objectManager.put(candidate);
        const candidateBlock = await Block.fromNetworkObject(candidate);
        // block validation
        const parentBlock = await candidateBlock.loadParent();
        const stateAfter = parentBlock!.stateAfter!.copy();
        await stateAfter!.applyMultiple(mempool.txs, candidateBlock);
        candidateBlock.stateAfter = stateAfter;

        await candidateBlock.save();
        await chainManager.onValidBlockArrival(candidateBlock);
        network.broadcast(candidateBlock.toNetworkObject()); */
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
