import net from 'net';
import { canonicalize } from 'json-canonicalize';
import { isIP } from 'net';

/* Constants */

const HOST = '0.0.0.0';
const PORT = 18018;

const BOOTSTRAP_PEERS = [
    '45.63.84.226:18018',
    '45.63.89.228:18018',
    '144.202.122.8:18018',
];

const isValidDomain = require('is-valid-domain')

const GREETING = {
    type: 'hello',
    version: '0.9.0',
    agent: 'Knickknack Marabu Client',
};

const GETPEERS = { "type": "getpeers" };

/* Peer Class */ 

export class Peer {
    ip: string;
    port: Number;
    address: string;
    receivedHello: boolean;

    constructor(socket: net.Socket, discoveredPeers: Array<string>) {
        this.ip = socket.remoteAddress ?? "";
        this.port = socket.remotePort ?? -1;
        this.address = `${socket.remoteAddress}:${socket.remotePort}`;
        this.receivedHello = false;
    
        // Send 'hello' message
        this.sendMessage(socket, GREETING);
        // Immediately after, send "getpeers" message
        this.sendMessage(socket, GETPEERS);

         // Received data from client  
        let buffer = '';
        let waiting = false;
        let timeoutId: NodeJS.Timeout;

        socket.on('data', data => {
            buffer += data;
            const messages = buffer.split('\n');
            if (messages.length > 1) {
                if (waiting) {
                    clearTimeout(timeoutId);
                    waiting = false;
                }
                for (const m of messages.slice(0, -1)) {
                    console.log(`Client ${this.address} sent: ${m}`);
                    try {
                        const message = JSON.parse(m);
                        if (!this.receivedHello) {
                            if (message.type !== 'hello' || message.version !== '0.9.0') {
                                // TODO: allow message.version to be 0.9.x
                                console.log(`Ending socket with client ${this.address}`);
                                this.sendMessage(socket, {
                                    type: 'error',
                                    name: 'INVALID_HANDSHAKE',
                                });
                                socket.end();
                            } else {
                                this.receivedHello = true;
                            }
                        } else {
                            this.respond(socket, message, discoveredPeers);
                        }
                    } catch (e) {
                        console.error(e);
                        this.sendMessage(socket, {
                            type: 'error',
                            name: 'INVALID_FORMAT',
                            message: 'Invalid JSON.',
                        });
                        if (!this.receivedHello) {
                            console.log(`Ending socket with client ${this.address}`);
                            socket.end();
                        }
                    }
                }
                buffer = messages[messages.length - 1];
            }
            if (buffer.length && !waiting) {
                waiting = true;
                timeoutId = setTimeout(() => {
                    this.sendMessage(socket, {
                        type: 'error',
                        name: 'INVALID_FORMAT',
                        message: 'Timeout',
                    });
                    socket.end();
                }, 10000);
            }
        });
    
        // On Error
        socket.on('error', error => {
            console.error(`Client ${this.address} error: ${error}`);
        });
    
        // Connection closed
        socket.on('close', () => {
            console.log(`Client ${this.address} disconnected`);
        });
    }

    sendMessage(socket: net.Socket, message: object) {
        socket.write(canonicalize(message) + '\n');
    }
    
    respond(socket: net.Socket, message: any, discoveredPeers: Array<string>) {
        switch (message.type) {
            case 'hello':
                break;
            case 'error':
                break;
            case 'getpeers':
                break;
            case 'peers':
                // ensure well-formatted peer address, else: don't include
                for (const peer of message.peers) {
                    const [ip, port] = peer.split(':');
                    if (!ip || (isIP(ip) == 0 && !isValidDomain(ip))) break;
                    if (!port || port === "" || Number(port) < 0 || Number(port) > 65535) break;
                    discoveredPeers.push(peer);
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
}

export class Node {
    private discoveredPeers: Array<string> = BOOTSTRAP_PEERS;

    constructor() {
        /* Server Side */
        const server = net.createServer(socket => {    
            const address = `${socket.remoteAddress}:${socket.remotePort}`;
            console.log(`Client connected: ${address}`);

            const peer = new Peer(socket, this.discoveredPeers);
        });
        
        server.listen(PORT, HOST, () => {
            console.log(`Server listening on ${HOST}:${PORT}`)
        });

        /* CLIENT SIDE */

        let sockets: net.Socket[] = [];
        for (const p of BOOTSTRAP_PEERS) {
            let socket = new net.Socket();
            sockets.push(socket);

            const [ip, port] = p.split(':');
            socket.connect(Number(port), ip, () => {
                const peer = new Peer(socket, this.discoveredPeers);
            });
        }
    }
}

// Run node
const node = new Node();