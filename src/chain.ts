import { Block } from './block';
import { logger } from './logger';
import { mempoolManager } from './mempool';

class ChainManager {
  longestChainHeight: number = 0;
  longestChainTip: Block | null = null;

  async init() {
    this.longestChainTip = await Block.makeGenesis();
  }
  async onValidBlockArrival(block: Block) {
    if (!block.valid) {
      throw new Error(
        `Received onValidBlockArrival() call for invalid block ${block.blockid}`,
      );
    }
    const height = block.height;

    if (this.longestChainTip === null) {
      throw new Error('We do not have a local chain to compare against');
    }
    if (height === undefined) {
      throw new Error(
        `We received a block ${block.blockid} we thought was valid, but had no calculated height.`,
      );
    }
    if (height > this.longestChainHeight) {
      logger.debug(
        `New longest chain has height ${height} and tip ${block.blockid}`,
      );
      // Mempool Update
      if (block.previd == this.longestChainTip.blockid) { // adding to existing longest chain
        await mempoolManager.updateMempoolBlock(block);
      } else { // reorg needed
        // TODO:  Mempool state is rolled back to after the latest common ancestor between the old canonical chain and the new reorged chain
        //  State transitions are applied from that point onwards. 
        // As for the new mempool, it is reconstructed by attempting to apply first all the transactions in the abandoned fork, 
        // and then the transactions in the old mempool
      }
      this.longestChainHeight = height;
      this.longestChainTip = block;
    }
  }
}

export const chainManager = new ChainManager();
