import { logger } from './logger';
import { network } from './network';
import { chainManager } from './chain';
import { mempool } from './mempool';
import { miner } from './miner';

const BIND_PORT = 18018;
const BIND_IP = '0.0.0.0';

logger.info(`Knickknack - A Marabu node`);
logger.info(`Neil Khemani & Lauren Kong`);

async function main() {
  await chainManager.init();
  await mempool.init();
  network.init(BIND_PORT, BIND_IP);
  miner.init();
}

main();
