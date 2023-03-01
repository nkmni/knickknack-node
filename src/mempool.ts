import { Block } from './block';
import { logger } from './logger';
import { db } from './object';
import { chainManager } from './chain';
import { UTXOSet } from './utxo';
import { objectManager } from './object';
import { Outpoint, Transaction } from './transaction';
import { Peer } from './peer';
import {
  BlockObject,
  BlockObjectType,
  TransactionObject,
  ObjectType,
  AnnotatedError,
  ErrorChoice,
} from './message';
import { Deferred } from './promise';

class MempoolManager {
  utxo: UTXOSet = new UTXOSet(new Set<string>());
  // txids for the current mempool
  txids: string[] = [];
  initialized: boolean = false;
  deferredInit: Deferred<boolean> | undefined = undefined;

  // on init, set utxo to longest chain tip's, populate txids
  async init(blockid: string, peer: Peer) {
    logger.log('debug', 'mempoolManager init');
    while (this.deferredInit !== undefined) {
      const alreadyInitialized = await this.deferredInit.promise;
      if (this.initialized) {
        return;
      }
    }
    this.deferredInit = new Deferred<boolean>();
    const blockObj = await objectManager.retrieve(blockid, peer);
    if (!BlockObject.guard(blockObj)) {
      peer.sendError(
        new AnnotatedError(
          'INVALID_FORMAT',
          'Received chaintip is not a block',
        ),
      );
      this.deferredInit.resolve(false);
      this.deferredInit = undefined;
      return;
    }
    const chainTip = await Block.fromNetworkObject(blockObj);
    this.utxo = chainTip.stateAfter!;
    this.initialized = true;
    this.deferredInit.resolve(true);
    this.deferredInit = undefined;
  }
  async updateMempoolTx(tx: Transaction) {
    if (!this.initialized) return;
    try {
      await this.utxo.apply(tx);
      this.txids.push(tx.txid);
    } catch {}
  }
  async updateMempoolBlocks(block: Block) {
    if (!this.initialized) return;
    let newSuffix: Block[] = [];
    let currentBlock = block;
    while (currentBlock.blockid !== chainManager.longestChainTip!.blockid) {
      newSuffix.unshift(currentBlock);
      currentBlock = await Block.fromNetworkObject(
        await objectManager.get(currentBlock.previd!),
      );
    }
    for (const b of newSuffix) {
      await this.updateMempoolBlock(b);
    }
  }
  async updateMempoolBlock(block: Block) {
    if (!this.initialized) return;

    const blockTxs = await block.getTxs();
    for (const tx of blockTxs) {
      // remove from mempool
      const index = this.txids.indexOf(tx.txid);
      if (index > -1) {
        this.txids.splice(index, 1);
      }
      // updating mempool state
      await this.utxo.apply(tx);
    }
    // remove conflicting txs
    for (let txid of this.txids) {
      for (const tx of blockTxs) {
        const oldMempoolTx = (await objectManager.get(txid)) as Transaction;
        if (oldMempoolTx.conflictsWith(tx)) {
          const index = this.txids.indexOf(txid);
          this.txids.splice(index, 1);
        }
      }
    }
  }
  async chainReorg(newTip: Block, peer: Peer) {
    if (!this.initialized) return;

    const oldTxids = [...this.txids];
    this.utxo = newTip.stateAfter!;

    let oldTip = chainManager.longestChainTip!;
    let oldParent = oldTip.previd;
    let newParent = newTip.previd;
    let oldChain: Array<string | null> = [oldTip.blockid];
    let newChain: Array<string | null> = [newTip.blockid];
    let intersection: Array<string | null> = oldChain.filter(blockid =>
      newChain.includes(blockid),
    );

    while (intersection.length === 0) {
      if (oldParent !== null) {
        oldChain.unshift(oldParent);
        oldParent = (
          await Block.fromNetworkObject(await objectManager.get(oldParent))
        ).previd;
      }
      if (newParent !== null) {
        newChain.unshift(newParent);
        newParent = (
          await Block.fromNetworkObject(await objectManager.get(newParent))
        ).previd;
      }
      intersection = oldChain.filter(blockid => newChain.includes(blockid));
    }

    const commonAncestorIndex = oldChain.indexOf(intersection[0]);
    for (let i = commonAncestorIndex + 1; i < oldChain.length; ++i) {
      const oldBlock = await Block.fromNetworkObject(
        await objectManager.get(oldChain[i]!),
      );
      const oldBlockTxs = await oldBlock.getTxs();
      for (const oldBlockTx of oldBlockTxs) {
        this.updateMempoolTx(oldBlockTx);
      }
    }

    for (const oldMempoolTxid of oldTxids) {
      const oldMempoolTx = await Transaction.fromNetworkObject(
        await objectManager.get(oldMempoolTxid),
      );
      this.updateMempoolTx(oldMempoolTx);
    }

    // // Set your mempool UTXO set equal to the UTXO set of the chain tip of the new chain.
    // const oldUtxo = this.utxo;
    // this.utxo = newTip.stateAfter!;

    // // Apply all the transactions that were in the old chain but not in the new chain to the mempool and mempool UTXO.
    // // Find common ancestor
    // const oldChain = await this.getChainIds(oldTip, peer);
    // const newChain = await this.getChainIds(newTip, peer);
    // let forkIndex = 0;
    // for (let i = 0; i < oldChain!.length; i++) {
    //   if (oldChain![i].blockid === newChain![i].blockid) continue;
    //   else {
    //     forkIndex = i;
    //     break;
    //   }
    // }
    // // from common ancestor -> old chain, get all txs
    // const oldChainTxs: Transaction[] = [];
    // for (let j = forkIndex; j < oldChain!.length; j++) {
    //   const txs = await oldChain![j].getTxs();
    //   oldChainTxs.push(...txs);
    // }
    // // apply each tx to new mempool UTXO
    // for (const tx of oldChainTxs) {
    //   this.updateMempoolTx(tx);
    // }
  }
}
export const mempoolManager = new MempoolManager();
