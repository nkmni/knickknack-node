const { Miner } = require('./miner');
const {parentPort, workerData} = require("worker_threads");

(async function () {
  const miner = new Miner();
  await miner.init();
  while (true) {
    const block = await miner.mine();
    parentPort.postMessage(block);
  }
})();