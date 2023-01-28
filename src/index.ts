import { logger } from './logger';
import { network } from './network';

const BIND_PORT = 18018;
const BIND_IP = '45.77.3.115';

logger.info(`Knickknack - A Marabu node`);
logger.info(`Neil Khemani <nkhemani@stanford.edu>`);
logger.info(`Lauren Kong <lakong@stanford.edu>`);

network.init(BIND_PORT, BIND_IP);
