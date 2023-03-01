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

class MempoolManager {
  utxo: UTXOSet = new UTXOSet(new Set<string>());;
  // txids for the current mempool
  txids: String[] = [];

  // on init, set utxo to longest chain tip's, populate txids
  async init() { 
    if (chainManager.longestChainTip !== null) {
        this.utxo = chainManager.longestChainTip!.stateAfter!;
        for (const outpoint of this.utxo.outpoints) {
            this.txids.push(JSON.parse(outpoint).txid)
        }
    }
  }
  async updateMempoolTx(tx: Transaction, peer: Peer) {
    try {
        this.utxo.apply(tx);
        this.txids.push(tx.txid);
    } catch (e: any) {
        peer.sendError(e);
        return;
    }
  }
  async updateMempoolBlock(block: Block) {
    const blockTxs = await block.getTxs();
    for (const tx of blockTxs) {
      // remove from mempool
      const index = this.txids.indexOf(tx.txid, 0);
      if (index > -1) {
        this.txids.splice(index, 1);
      }
      // updating mempool state
      await this.utxo.apply(tx);
      // TODO: remove now invalid other txs
    }
  }
  async getChainIds(block: Block, peer: Peer) {
    let previd = block.previd;
    const chain:Block[] = [ block ];
    while (previd !== null) {
        let parentBlock: Block;
        try {
          const parentObject = await objectManager.retrieve(previd, peer);
          if (!BlockObject.guard(parentObject)) {
            throw new AnnotatedError(
              'UNFINDABLE_OBJECT',
              `Got parent of block ${block.blockid}, but it was not of BlockObject type; rejecting block.`,
            );
          }
          parentBlock = await Block.fromNetworkObject(parentObject);
          chain.unshift(parentBlock);
          previd = parentBlock.previd;
        } catch (e: any) {
            peer.sendError(e);
            return;
        }
    }
    return chain;
  }
  async chainReorg(oldBlock: Block, newTip: Block, peer: Peer) {
    // Set your mempool UTXO set equal to the UTXO set of the chain tip of the new chain.
    const oldUtxo = this.utxo;
    this.utxo = newTip.stateAfter!;

    // Apply all the transactions that were in the old chain but not in the new chain to the mempool and mempool UTXO.
    // Find common ancestor
    const oldChain = await this.getChainIds(oldBlock, peer);
    const newChain = await this.getChainIds(newTip, peer);
    let forkIndex = 0;
    for (let i = 0; i < oldChain!.length; i++) {
        if (oldChain![i].blockid == newChain![i].blockid) continue; 
        else forkIndex = i;
    }
    // from common ancestor -> old chain, get all txs
    const oldChainTxs:Transaction[] = [];
    for (let j = forkIndex; j < oldChain!.length; j++) {
        const txs = await oldChain![j].getTxs();
        oldChainTxs.push(...txs);
    }
    // apply each tx to new mempool UTXO
    for (const tx of oldChainTxs) {
        this.updateMempoolTx(tx, peer);
    }
    // Apply the transactions that used to be in your mempool pre-fork.
    const oldUtxoTxs = [];
    for (const outpoint of oldUtxo.outpoints) {
        oldUtxoTxs.push(JSON.parse(outpoint).txid)
    }
    for (const tx of oldUtxoTxs) {
        try {
            this.utxo.apply(tx);
            this.txids.push(tx.txid);
        } catch (e){}
    }
  }
}
export const mempoolManager = new MempoolManager();

