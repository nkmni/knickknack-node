const { canonicalize } = require('json-canonicalize');
const crypto = require('crypto');
const hash = require('./crypto/hash')

const TARGET = '00000000abc00000000000000000000000000000000000000000000000000000'
const BU = 10 ** 12
const BLOCK_REWARD = 50 * BU

class Miner {
  constructor() {
    this.privateKey = undefined;
    this.publicKey = undefined;
    this.publicKeyHex = undefined;
    this.initialized = false;
    this.ourCoinbaseUtxos = [];
  }

  async init(mempool, chainHeight, chainTip) {
    this.privateKey = ed.utils.randomPrivateKey();
    this.publicKey = await ed.getPublicKey(this.privateKey);
    this.publicKeyHex = Buffer.from(this.publicKey).toString('hex');
    this.initialized = true;
    this.currentMempool = mempool;
    this.chainHeight = chainHeight;
    this.chainTip = chainTip;
  }

  async mine() {
    while (true) {
      const mempoolFees = this.currentMempool.txs
        .map(tx => tx.fees)
        .reduce((sum, fee) => sum + fee, 0);
      const coinbaseTx = {
        type: 'transaction',
        outputs: [
          { value: BLOCK_REWARD + mempoolFees, pubkey: this.publicKeyHex },
        ],
        height: this.chainHeight + 1,
      };
      const txids = this.currentMempool.txs.map(tx => tx.txid);
      const coinbaseTxHash = hash(canonicalize(coinbaseTx));
      txids.unshift(coinbaseTxHash);
      const candidateBlock = {
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
        candidateBlock.height = this.chainHeight + 1;
        candidateBlock.fees = mempoolFees;
        candidateBlock.valid = true;
        return candidateBlock;
      }
    }
  }
}
module.exports = { Miner };
  /*
async dumpCoinsOnDionyziz() {
  for (const txid in this.ourCoinbaseUtxos) {
    const tx = {
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
    const sig = await ed.sign(canonicalize(tx), this.privateKey);
    tx.inputs[0].sig = Buffer.from(sig).toString('hex');
    network.broadcast(tx);
  }
  this.ourCoinbaseUtxos = [];
}
}
*/