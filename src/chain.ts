import { Block } from './block';
import { ObjectId, db, objectManager } from './object';

class ChainManager {
  chainTipHeight: number = 0;
  chainTipId: ObjectId =
    '0000000052a0e645eca917ae1c196e0d0a4fb756747f29ef52594d68484bb5e2'; // Genesis block

  async load() {
    try {
      this.chainTipId = await db.get('chaintip');
    } catch {
      await this.store();
      return;
    }
    const chainTipObj = await objectManager.get(this.chainTipId);
    const chainTip = await Block.fromNetworkObject(chainTipObj);
    this.chainTipHeight = await chainTip.getHeight();
  }

  async store() {
    await db.put('chaintip', this.chainTipId);
  }

  async updateChainTip(block: Block) {
    const blockHeight = await block.getHeight();
    if (blockHeight > this.chainTipHeight) {
      this.chainTipHeight = blockHeight;
      this.chainTipId = block.blockid;
      await this.store();
    }
  }
}

export const chainManager = new ChainManager();
