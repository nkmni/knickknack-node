import net, {isIP} from 'net';
import {canonicalize} from 'json-canonicalize';
import isValidDomain from 'is-valid-domain';
import {z} from 'zod';
import level from 'level-ts';
import { db } from './store';

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
    description: z.string(),
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
    // fyi: I deleted 'peers' (array of strings) in favor of this map, bc we need a way to access (string -> socket)
    private connectedPeers = new Map<string, net.Socket>();
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
            this.connectToPeer(p);
        }
    }

    connectToPeer(p: string) {
        let socket = new net.Socket();
        this.socketData.set(socket, new SocketData());

        const [ip, port] = p.split(':');
        socket.connect(+port, ip, () => {
            console.log(`Connected to server ${ip}:${port}`);
            this.sendMessage(socket, HELLO_MESSAGE);
            this.sendMessage(socket, GETPEERS_MESSAGE);
            this.connectedPeers.set(p, socket);
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

    sendMessage(socket: net.Socket, message: object) {
        console.log(
            `Sending to ${socket.remoteAddress}:${
                socket.remotePort
            }: ${canonicalize(message)}`,
        );
        socket.write(canonicalize(message) + '\n');
    }

    /* Object Helper Functions */

    /* Function to map objects to objectids (canonical -> BLAKE2 hash). */
    getObjectId(obj: object) {
        var blake2 = require('blake2');
        var hash = blake2.createHash('blake2s');
        hash.update(Buffer.from(canonicalize(obj)));
        return(hash.digest("hex"));
        // already tested/verified using genesis block
    }

    /* If has object in db, send to requester. If not, do nothing. */
    async getObject(socket: net.Socket, objectid: string) {
        try {
            const reqObj = await db.get(`object-${objectid}`);
            this.sendMessage(socket, reqObj);
            console.log(`Sent object: ${reqObj}`)
        } catch {
            return;
        }
    }

    /* If has obj in db, do nothing. Else, request 'getobject' */
    async iHaveObject(socket: net.Socket, objectid: string) {
        try { // Has object in db
            await db.get(`object-${objectid}`);
        } catch {
            const getObject = {
                type: 'getobject',
                objectid: objectid
              }
            this.sendMessage(socket, getObject);
            return;
        }
    }

    /* Store object in db */
    async store(sentObject: object) {
        const objectid = this.getObjectId(sentObject);
        await db.put(`object-${objectid}`, sentObject)
    }
    
    /* If new obj, store in db and broadcast. If not, do nothing. */
    async receivedObject(socket: net.Socket, sentObject: object) {
        const objectid = this.getObjectId(sentObject);
        try { // Has object in db, do nothing
            await db.get(`object-${objectid}`);
        } catch { // Store new obj, broadcast to all peers
            this.store(sentObject);
            const IHAVEOBJECTMSG = {
                type: "ihaveobject",
                objectid: objectid
            };
            this.connectedPeers.forEach((value: net.Socket, key: string) => {
                this.sendMessage(value, IHAVEOBJECTMSG);
                console.log (`Broadcasted "ihaveobject" msg to client: ${key}`);
            });
            return;
        }
    }
    
    respond(socket: net.Socket, message: any) {
        switch (message.type) {
            case 'hello':
                break;
            case 'error':
                break;
            case 'getpeers':
                const getPeers = {type: 'peers', peers: Object.keys(this.connectedPeers)};
                this.sendMessage(socket, getPeers);
                break;
            case 'peers':
                // ensure well-formatted peer address, else: don't include
                for (const peer of message.peers) {
                    if (!Object.keys(this.connectedPeers).includes(peer)) {
                        const [ip, port] = peer.split(':');
                        if (!ip || (isIP(ip) == 0 && !isValidDomain(ip)))
                            continue;
                        if (!port || port === '' || +port < 0 || +port > 65535)
                            continue;
                        // this.connectToPeer(peer);
                        console.log(`Added new peer ${ip}:${port}`);
                    }
                }
                break;
            // TODO: Missing verification for all Object schemas/JSON fields/types
            case 'getobject':
                this.getObject(socket, message.objectid);
                break;
            case 'ihaveobject':
                this.iHaveObject(socket, message.objectid);
            case 'object':
                // this.receivedObject(socket, message.object);
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
                    description: 'Invalid message type.',
                });
                break;
        }
    }

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
                        versionNums.length !== 3 ||
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
                // default:
                //     return 'Invalid message type.';
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
                        description: message,
                    });
                    if (!data.receivedHello) {
                        console.log(`Ending socket with ${address}`);
                        socket.destroy();
                        this.connectedPeers.delete(address);
                        this.socketData.delete(socket);
                    }
                    break;
                }

                if (!data.receivedHello) {
                    if (message.type !== 'hello') {
                        console.log(`Ending socket with ${address}`);
                        this.sendMessage(socket, {
                            type: 'error',
                            name: 'INVALID_HANDSHAKE',
                        });
                        socket.destroy();
                        this.connectedPeers.delete(address);
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
                    description: 'Timeout',
                });
                socket.destroy();
                this.connectedPeers.delete(address);
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
        this.connectedPeers.delete(`${socket.remoteAddress}:${socket.remotePort}`);
        this.socketData.delete(socket);
    }
}
