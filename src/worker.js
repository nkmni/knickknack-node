const { Miner } = require('./miner.js');
const {parentPort, workerData} = require('worker_threads');

(async function () {
  const miner = new Miner(workerData.mempool, workerData.chainHeight, workerData.chainTip);
  await miner.init();
  const minedBlock = await miner.mine();
  parentPort.postMessage(minedBlock);
})();