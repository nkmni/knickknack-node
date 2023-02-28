import { logger } from './logger';
import { network } from './network';
import { chainManager } from './chain';
import { AnnotatedError } from './message';

const BIND_PORT = 18018;
const BIND_IP = '0.0.0.0';

logger.info(`Knickknack - A Marabu node`);
logger.info(`Neil Khemani and Lauren Kong`);

async function main() {
  await chainManager.init();
  network.init(BIND_PORT, BIND_IP);
}

main();