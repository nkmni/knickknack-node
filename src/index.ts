import { chainManager } from './chain';
import { logger } from './logger';
import { network } from './network';

const BIND_PORT = 18018;
const BIND_IP = '45.77.3.115';

logger.info(`Knickknack Marabu Node`);
logger.info(`Neil Khemani & Lauren Kong`);

async function main() {
  await chainManager.load();
  network.init(BIND_PORT, BIND_IP);
}

main();
