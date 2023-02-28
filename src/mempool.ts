import { Block } from './block';
import { logger } from './logger';
import { db } from './object';
import { chainManager } from './chain';
import { UTXOSet } from './utxo';
import { objectManager } from './object';
import { Transaction } from './transaction';
import { Peer } from './peer';

class MempoolManager {
  utxo: UTXOSet = new UTXOSet(new Set<string>());
  // txids for the current mempool
  txs: Transaction[] = [];
  // every valid txid this node has seen
  allTxids: String[] = [];

  async load() {
    try {
      // all valid txids
      this.allTxids = new Array(await db.get('allTxids'));
      logger.debug(`Loaded known txids: ${[...this.allTxids]}`);

      /* TODO: Init current mempool - allTxids that aren't in longest chain
      let currentBlock = chainManager.longestChainTip;
      let possibleMempool = this.allTxids but not in longestChain
      this.utxo = currentBlock.stateAfter;

      const txs = await currentBlock.getTxs();
      for (const tx of txs) {
        await this.utxo.apply(tx);
      } */

      // Apply each TX on top of your longest chain tip’s UTXO
      for (const tx of this.txs) {
        try {
            // apply tx to mempool UTXO
            this.utxo.apply(tx);
            // add to mempool tx list
            this.txs.push(tx);
        } catch (e) {}
      }
    } catch {
      logger.info(`Initializing txids database`);
      await this.storeTxids();
    }
  }
  async storeTxids() {
    await db.put('txids', [...this.allTxids]);
  }
  async addTxid(txid: string) {
    this.allTxids.push(txid);
    this.storeTxids(); // intentionally delayed await
  }
  async updateMempoolTx(tx: Transaction, peer: Peer) {
    try {
        this.utxo.apply(tx);
        this.txs.push(tx);
    } catch (e: any) {
        peer.sendError(e);
        return;
    }
  }
  async updateMempoolBlock(block: Block) {
    const blockTxs = await block.getTxs();
    for (const tx of blockTxs) {
      // remove from mempool
      const index = this.txs.indexOf(tx, 0);
      if (index > -1) {
        this.txs.splice(index, 1);
      }
      // updating mempool state
      await this.utxo.apply(tx);
      // TODO: remove now invalid other txs
    }
  }
}
export const mempoolManager = new MempoolManager();

