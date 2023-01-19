import net, {isIP} from 'net';
import {canonicalize} from 'json-canonicalize';
import isValidDomain from 'is-valid-domain';
import { Boolean,
    Number,
    String,
    Literal,
    Array,
    Tuple,
    Record,
    Dictionary,
    Union,
    Static,
    match, } from 'runtypes';

/* Constants */

const MESSAGE_TYPES = ['hello', 'error', 'getpeers', 'peers', 'getobject', 'ihaveobject', 'object', 'getmempool', 'mempool', 'getchaintip', 'chaintip'];
const ERROR_TYPES = ['INTERNAL_ERROR', 'INVALID_FORMAT', 'UNKNOWN_OBJECT', 'UNFINDABLE_OBJECT', 'INVALID_HANDSHAKE', 'INVALID_TX_OUTPOINT', 
'INVALID_TX_SIGNATURE', 'INVALID_TX_CONSERVATION', 'INVALID_BLOCK_COINBASE', 'INVALID_BLOCK_TIMESTAMP', 'INVALID_BLOCK_POW', 'INVALID_GENESIS'];

const HOST = '45.77.3.115';
const PORT = 18018;

const BOOTSTRAP_PEERS = ['45.63.84.226:18018', '45.63.89.228:18018', '144.202.122.8:18018'];

const GREETING = {
    type: 'hello',
    version: '0.9.0',
    agent: 'Knickknack Marabu Client',
};

//Types for rigorously checking JSON
const HELLO = Record({
    type: String,
    version: String,
    agent: String,
});
type HELLO = Static<
    typeof HELLO
>;

const ERROR = Record({
    type: String,
    name: String,
    message: String,
});
type ERROR = Static<
    typeof ERROR
>;

const GETPEERSTYPE = Record({
    type: String,
});
type GETPEERSTYPE = Static<
    typeof GETPEERSTYPE
>;

const PEERS = Record({
    type: String,
    peers: Array(String),
});
type PEERS = Static<
    typeof PEERS
>;

const GETPEERS = {type: 'getpeers'};

/* Socket Variables Class */

class SocketData {
    receivedHello = false;
    buffer = '';
    timeoutId: any = null;
}

/* Knickknack Node Class */

export default class KnickknackNode {
    private peers: string[] = BOOTSTRAP_PEERS;
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
                const getPeers = {type: 'peers', peers: this.peers};
                this.sendMessage(socket, getPeers);
                break;
            case 'peers':
                // ensure well-formatted peer address, else: don't include
                for (const peer of message.peers) {
                    if (!this.peers.includes(peer)) {
                        const [ip, port] = peer.split(':');
                        if (!ip || (isIP(ip) == 0 && !isValidDomain(ip))) continue;
                        if (!port || port === '' || +port < 0 || +port > 65535) continue;
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

            //the following line should throw an error, specifically a ValidationError, if the key or value is of incorrect type
            const messageCheck = message.type.check

            if (!MESSAGE_TYPES.includes(message.type)) {
                return 'Invalid message type.';
            }

            //Hello message validation
            if (message.type == 'hello') {
                //The following line should throw an error if the types do not match
                const hellocheck = HELLO.check(message);

                //Check if version is of 0.9.x format
                const nums = message.version.split('.');
                if (nums.length != 3) {
                    return 'Invalid message type.'
                } else {
                    if (nums[0] != 0 || nums[1] != 9) {
                        return 'Invalid message type.'
                    }
                }
            }

            //Error message validation
            if (message.type == 'error') {
                //The following line should throw an error if the types do not match
                const errorcheck = ERROR.check(message);

                //Check if error name is valid
                if (!ERROR_TYPES.includes(message.name)) {
                    return 'Invalid message type.';
                }
            }

            //Getpeers message validation
            if (message.type == 'getpeers') {
                //The following line should throw an error if the types do not match
                const getpeerscheck = GETPEERSTYPE.check(message);
            }

            //Peers message validation
            if (message.type == 'peers') {
                //The following line should throw an error if the types do not match
                const peerscheck = PEERS.check(message);

                //Check peer host/port format is correct
                const peers = message.peers;
                for (var peer of peers) {
                    if (peer.split(':').length != 2) {
                        return 'Invalid message type.';
                    }
                }
            }

            //if (message.type === 'hello' && message.version === undefined) {
            //    return 'Missing version.';
            //}

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
                        socket.destroy();
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
        console.error(`${socket.remoteAddress}:${socket.remotePort} error: ${error}`);
    }

    socketOnClose(socket: net.Socket) {
        console.log(`${socket.remoteAddress}:${socket.remotePort} disconnected`);
        this.socketData.delete(socket);
    }
}
