import { parentPort, workerData } from "worker_threads";

function getFibonacciNumber(num: number): number {
  if (num === 0) {
    return 0;
  } else if (num === 1) {
    return 1;
  } else {
    return getFibonacciNumber(num - 1) + getFibonacciNumber(num - 2);
  }
}

parentPort!.postMessage(getFibonacciNumber(workerData.num));