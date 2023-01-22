import { Network } from './network';

const PORT = 18018;
const HOST = '45.77.3.115';

const network = new Network();
network.init(PORT, HOST);