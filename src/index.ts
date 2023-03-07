import { logger } from './logger';
import { network } from './network';
import { chainManager } from './chain';
import { mempool } from './mempool';
import { AnnotatedError } from './message';
import { Worker } from "worker_threads";

const BIND_PORT = 18018;
const BIND_IP = '45.77.3.115';

logger.info(`Knickknack - A Marabu node`);
logger.info(`Neil Khemani & Lauren Kong`);

async function main() {
  await chainManager.init();
  await mempool.init();
  network.init(BIND_PORT, BIND_IP);

  let number: number = 10;

  const worker = new Worker("./myWorker.js", { workerData: { num: number } });

  worker.once("message", (result: number) => {
    console.log(`${number}th Fibonacci No: ${result}`);
  });

  worker.on("error", (error: Error) => {
    console.log(error);
  });

  worker.on("exit", (exitCode: number) => {
    console.log(`It exited with code ${exitCode}`);
  });

  console.log("Execution in main thread");
}