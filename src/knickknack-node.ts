import net, {isIP} from 'net';
import {canonicalize} from 'json-canonicalize';
import isValidDomain from 'is-valid-domain';

/* Constants */

const MESSAGE_TYPES = ['hello', 'error', 'getpeers', 'peers', 'getobject', 'ihaveobject', 'object', 'getmempool', 'mempool', 'getchaintip', 'chaintip'];

const HOST = '45.77.3.115';
const PORT = 18018;

const BOOTSTRAP_PEERS = ['45.63.84.226:18018', '45.63.89.228:18018', '144.202.122.8:18018'];

const GREETING = {
    type: 'hello',
    version: '0.9.0',
    agent: 'Knickknack Marabu Client',
};

const GETPEERS = {type: 'getpeers'};

/* Socket Variables Class */

class SocketData {
    receivedHello = false;
    buffer = '';
    timeoutId: any = null;
}

/* Knickknack Node Class */

export default class KnickknackNode {
    private peers = new Set<string>(BOOTSTRAP_PEERS);
    private socketData = new Map<net.Socket, SocketData>();
    private server: net.Server;

    constructor() {
        this.server = net.createServer(socket => {
            console.log(`Connected to client ${socket.remoteAddress}:${socket.remotePort}`);

            this.socketData.set(socket, new SocketData());

            this.sendMessage(socket, GREETING);
            this.sendMessage(socket, GETPEERS);

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
                this.sendMessage(socket, GREETING);
                this.sendMessage(socket, GETPEERS);
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
                const getPeers = {type: 'peers', peers: Array.from(this.peers)};
                this.sendMessage(socket, getPeers);
                break;
            case 'peers':
                // ensure well-formatted peer address, else: don't include
                for (const peer of message.peers) {
                    const [ip, port] = peer.split(':');
                    if (!ip || (isIP(ip) == 0 && !isValidDomain(ip))) break;
                    if (!port || port === '' || +port < 0 || +port > 65535) break;
                    this.peers.add(peer);
                    console.log(`Added new peer ${ip}:${port}`);
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
            if (message.type === 'hello' && message.version === undefined) {
                return 'Missing version.';
            }
            return message;
        } catch (e) {
            console.error(e);
            return 'Invalid JSON.';
        }
    }

    socketOnData(socket: net.Socket, sentData: Buffer) {
        const address = `${socket.remoteAddress}:${socket.remotePort}`;
        const data = this.socketData.get(socket);

        if (data === undefined) {
            throw new Error(`\`socketOnData\`: ${address} not mapped to any SocketData object.`);
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
                        socket.end();
                        this.socketData.delete(socket);
                    }
                }

                if (!data.receivedHello) {
                    if (message.type !== 'hello' || message.version !== '0.9.0') {
                        // TODO: allow message.version to be 0.9.x
                        console.log(`Ending socket with ${address}`);
                        this.sendMessage(socket, {
                            type: 'error',
                            name: 'INVALID_HANDSHAKE',
                        });
                        socket.end();
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
                socket.end();
                this.socketData.delete(socket);
            }, 10000);
        }
    }

    socketOnError(socket: net.Socket, error: Error) {
        console.error(`${socket.remoteAddress}:${socket.remotePort} error: ${error}`);
    }

    socketOnClose(socket: net.Socket) {
        console.log(`${socket.remoteAddress}:${socket.remotePort} disconnected`);
        this.socketData.delete(socket);
    }
}
