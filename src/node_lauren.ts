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

export class Node {
    private discoveredPeers: Array<string> = BOOTSTRAP_PEERS;

    constructor() {
        /* Server Side */
        const server = net.createServer(socket => {    
            const address = `${socket.remoteAddress}:${socket.remotePort}`;
            console.log(`Client connected: ${address}`);

            // Send 'hello' message
            this.sendMessage(socket, GREETING);
            // Immediately after, send "getpeers" message
            this.sendMessage(socket, GETPEERS);
        
            let receivedHello = false;
            let buffer = '';
            let waiting = false;
            let timeoutId: NodeJS.Timeout;

            // Received data from client
            socket.on('data', data => {
                const address = `${socket.remoteAddress}:${socket.remotePort}`;
                buffer += data;
                const messages = buffer.split('\n');
                if (messages.length > 1) {
                    if (waiting) {
                        clearTimeout(timeoutId);
                        waiting = false;
                    }
                    for (const m of messages.slice(0, -1)) {
                        console.log(`Client ${address} sent: ${m}`);
                        try {
                            const message = JSON.parse(m);
                            if (!receivedHello) {
                                if (message.type !== 'hello' || message.version !== '0.9.0') {
                                    // TODO: allow message.version to be 0.9.x
                                    console.log(`Ending socket with client ${address}`);
                                    this.sendMessage(socket, {
                                        type: 'error',
                                        name: 'INVALID_HANDSHAKE',
                                    });
                                    socket.end();
                                } else {
                                    receivedHello = true;
                                }
                            } else {
                                this.respond(socket, message);
                            }
                        } catch (e) {
                            console.error(e);
                            this.sendMessage(socket, {
                                type: 'error',
                                name: 'INVALID_FORMAT',
                                message: 'Invalid JSON.',
                            });
                            if (!receivedHello) {
                                console.log(`Ending socket with client ${address}`);
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
                console.error(`Client ${address} error: ${error}`);
            });
        
            // Connection closed
            socket.on('close', () => {
                console.log(`Client ${address} disconnected`);
            });
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
                console.log('Connected to server');
                console.log('Sent hello');
                this.sendMessage(socket, GREETING);
                console.log('Sent getpeers');
                this.sendMessage(socket, GETPEERS);
            });

            const address = `${socket.remoteAddress}:${socket.remotePort}`;

            let receivedHello = false;
            let buffer = '';
            let waiting = false;
            let timeoutId: NodeJS.Timeout;{}

            socket.on('data', data => {
                const address = `${socket.remoteAddress}:${socket.remotePort}`;
                buffer += data;
                const messages = buffer.split('\n');
                if (messages.length > 1) {
                    if (waiting) {
                        clearTimeout(timeoutId);
                        waiting = false;
                    }
                    for (const m of messages.slice(0, -1)) {
                        console.log(`Client ${address} sent: ${m}`);
                        try {
                            const message = JSON.parse(m);
                            if (!receivedHello) {
                                if (message.type !== 'hello' || message.version !== '0.9.0') {
                                    // TODO: allow message.version to be 0.9.x
                                    console.log(`Ending socket with client ${address}`);
                                    this.sendMessage(socket, {
                                        type: 'error',
                                        name: 'INVALID_HANDSHAKE',
                                    });
                                    socket.end();
                                } else {
                                    receivedHello = true;
                                }
                            } else {
                                this.respond(socket, message);
                            }
                        } catch (e) {
                            console.error(e);
                            this.sendMessage(socket, {
                                type: 'error',
                                name: 'INVALID_FORMAT',
                                message: 'Invalid JSON.',
                            });
                            if (!receivedHello) {
                                console.log(`Ending socket with client ${address}`);
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

            socket.on('error', error => {
                console.error(`Server error: ${error}`);
            });

            socket.on('close', () => {
                console.log('Server disconnected');
            });
        }
    }

    sendMessage(socket: net.Socket, message: object) {
        socket.write(canonicalize(message) + '\n');
    };
    
    respond(socket: net.Socket, message: any) {
        switch (message.type) {
            case 'hello':
                break;
            case 'error':
                break;
            case 'getpeers':
                break;
            case 'peers':
                // ensure well-formatted peer address, else: don't include
                console.log('Received peers msg back');
                for (const peer of message.peers) {
                    const [ip, port] = peer.split(':');
                    if (!ip || (isIP(ip) == 0 && !isValidDomain(ip))) break;
                    if (!port || port === "" || Number(port) < 0 || Number(port) > 65535) break;
                    this.discoveredPeers.push(peer);
                    console.log(`Added new peer: ${ip}:${port}`);
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
};

const node = new Node();