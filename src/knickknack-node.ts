import net, {isIP} from 'net';
import {canonicalize} from 'json-canonicalize';
import isValidDomain from 'is-valid-domain';
import {z} from 'zod';

/* ======== CONSTANTS ======== */

// Server

const HOST = '45.77.3.115';
const PORT = 18018;

const BOOTSTRAP_PEERS = [
    '45.63.84.226:18018',
    '45.63.89.228:18018',
    '144.202.122.8:18018',
];

// Message Schemas

const helloSchema = z.object({
    type: z.string(),
    version: z.string(),
    agent: z.any(),
});

const errorSchema = z.object({
    type: z.string(),
    name: z.string(),
    message: z.string(),
});

const getPeersSchema = z.object({
    type: z.string(),
});

const peersSchema = z.object({
    type: z.string(),
    peers: z.array(z.string()),
});

// Protocol

const MESSAGE_TYPES = [
    'hello',
    'error',
    'getpeers',
    'peers',
    'getobject',
    'ihaveobject',
    'object',
    'getmempool',
    'mempool',
    'getchaintip',
    'chaintip',
];

const ERROR_NAMES = [
    'INTERNAL_ERROR',
    'INVALID_FORMAT',
    'UNKNOWN_OBJECT',
    'UNFINDABLE_OBJECT',
    'INVALID_HANDSHAKE',
    'INVALID_TX_OUTPOINT',
    'INVALID_TX_SIGNATURE',
    'INVALID_TX_CONSERVATION',
    'INVALID_BLOCK_COINBASE',
    'INVALID_BLOCK_TIMESTAMP',
    'INVALID_BLOCK_POW',
    'INVALID_GENESIS',
];

const HELLO_MESSAGE = {
    type: 'hello',
    version: '0.9.0',
    agent: 'Knickknack Marabu Client',
};

const GETPEERS_MESSAGE = {type: 'getpeers'};

/* ======== Socket Data Class ======== */

class SocketData {
    receivedHello = false;
    buffer = '';
    timeoutId: any = null;
}

/* ======== Knickknack Node Class ======== */

export default class KnickknackNode {
    private peers: string[] = BOOTSTRAP_PEERS;
    private socketData = new Map<net.Socket, SocketData>();
    private server: net.Server;

    constructor() {
        this.server = net.createServer(socket => {
            console.log(
                `Connected to client ${socket.remoteAddress}:${socket.remotePort}`,
            );

            this.socketData.set(socket, new SocketData());

            this.sendMessage(socket, HELLO_MESSAGE);
            this.sendMessage(socket, GETPEERS_MESSAGE);

            socket.on('data', data => {
                this.socketOnData(socket, data);
            });

            socket.on('error', error => {
                this.socketOnError(socket, error);
            });

            socket.on('close', () => {
                this.socketOnClose(socket);
            });
        });
    }

    start() {
        this.server.listen(PORT, HOST, () => {
            console.log(`Server listening on ${HOST}:${PORT}`);
        });

        /* CLIENT SIDE */

        for (const p of BOOTSTRAP_PEERS) {
            let socket = new net.Socket();
            this.socketData.set(socket, new SocketData());

            const [ip, port] = p.split(':');
            socket.connect(+port, ip, () => {
                console.log(`Connected to server ${ip}:${port}`);
                this.sendMessage(socket, HELLO_MESSAGE);
                this.sendMessage(socket, GETPEERS_MESSAGE);
            });

            socket.on('data', data => {
                this.socketOnData(socket, data);
            });

            socket.on('error', error => {
                this.socketOnError(socket, error);
            });

            socket.on('close', () => {
                this.socketOnClose(socket);
            });
        }
    }

    sendMessage(socket: net.Socket, message: object) {
        socket.write(canonicalize(message) + '\n');
    }

    respond(socket: net.Socket, message: any) {
        switch (message.type) {
            case 'hello':
                break;
            case 'error':
                break;
            case 'getpeers':
                const getPeers = {type: 'peers', peers: this.peers};
                this.sendMessage(socket, getPeers);
                break;
            case 'peers':
                // ensure well-formatted peer address, else: don't include
                for (const peer of message.peers) {
                    if (!this.peers.includes(peer)) {
                        const [ip, port] = peer.split(':');
                        if (!ip || (isIP(ip) == 0 && !isValidDomain(ip)))
                            continue;
                        if (!port || port === '' || +port < 0 || +port > 65535)
                            continue;
                        this.peers.push(peer);
                        console.log(`Added new peer ${ip}:${port}`);
                    }
                }
                break;
            case 'getobject':
                break;
            case 'ihaveobject':
                break;
            case 'object':
                break;
            case 'getmempool':
                break;
            case 'mempool':
                break;
            case 'getchaintip':
                break;
            case 'chaintip':
                break;
            default:
                this.sendMessage(socket, {
                    type: 'error',
                    name: 'INVALID_FORMAT',
                    message: 'Invalid message type.',
                });
                break;
        }
    }

    // TODO: Ed Post #20: Need more rigorous msg validation
    isValidMessage(m: string) {
        try {
            const message = JSON.parse(m);

            if (!MESSAGE_TYPES.includes(message.type)) {
                return 'Invalid message type.';
            }

            switch (message.type) {
                case 'hello':
                    helloSchema.parse(message);
                    if (message.version === undefined)
                        return 'Missing version.';
                    const versionNums = message.version.split('.');
                    if (
                        versionNums.length < 2 ||
                        versionNums[0] !== '0' ||
                        versionNums[1] !== '9'
                    )
                        return 'Invalid version number.';
                    break;
                case 'error':
                    errorSchema.parse(message);
                    if (!ERROR_NAMES.includes(message.name))
                        return 'Invalid error name.';
                    break;
                case 'getpeers':
                    getPeersSchema.parse(message);
                    break;
                case 'peers':
                    peersSchema.parse(message);
                    for (const p of message.peers) {
                        if (p.split(':').length !== 2)
                            return 'Malformed peers array.';
                    }
                    break;
                default:
                    return 'Invalid message type.';
            }

            return message;
        } catch (e: any) {
            console.error(e);
            return e.message;
        }
    }

    socketOnData(socket: net.Socket, sentData: Buffer) {
        const address = `${socket.remoteAddress}:${socket.remotePort}`;
        const data = this.socketData.get(socket);

        if (data === undefined) {
            throw new Error(
                `\`socketOnData\`: ${address} not mapped to any SocketData object.`,
            );
        }

        data.buffer += sentData;
        const messages = data.buffer.split('\n');

        if (messages.length > 1) {
            if (data.timeoutId !== null) {
                clearTimeout(data.timeoutId);
                data.timeoutId = null;
            }

            for (const m of messages.slice(0, -1)) {
                console.log(`${address} sent: ${m}`);
                const message = this.isValidMessage(m);

                if (typeof message !== 'object') {
                    this.sendMessage(socket, {
                        type: 'error',
                        name: 'INVALID_FORMAT',
                        message,
                    });
                    if (!data.receivedHello) {
                        console.log(`Ending socket with ${address}`);
                        socket.destroy();
                        this.socketData.delete(socket);
                    }
                }

                if (!data.receivedHello) {
                    if (
                        message.type !== 'hello' ||
                        message.version !== '0.9.0'
                    ) {
                        // TODO: allow message.version to be 0.9.x
                        console.log(`Ending socket with ${address}`);
                        this.sendMessage(socket, {
                            type: 'error',
                            name: 'INVALID_HANDSHAKE',
                        });
                        socket.destroy();
                        this.socketData.delete(socket);
                    } else {
                        data.receivedHello = true;
                    }
                } else {
                    this.respond(socket, message);
                }
            }

            data.buffer = messages[messages.length - 1];
        }

        if (data.buffer.length && data.timeoutId === null) {
            data.timeoutId = setTimeout(() => {
                this.sendMessage(socket, {
                    type: 'error',
                    name: 'INVALID_FORMAT',
                    message: 'Timeout',
                });
                socket.destroy();
                this.socketData.delete(socket);
            }, 10000);
        }
    }

    socketOnError(socket: net.Socket, error: Error) {
        console.error(
            `${socket.remoteAddress}:${socket.remotePort} error: ${error}`,
        );
    }

    socketOnClose(socket: net.Socket) {
        console.log(
            `${socket.remoteAddress}:${socket.remotePort} disconnected`,
        );
        this.socketData.delete(socket);
    }
}
