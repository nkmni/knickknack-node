import net from 'net';
import { canonicalize } from 'json-canonicalize';

/* CONSTANTS */

const HOST = '0.0.0.0';
const PORT = 18018;

const BOOTSTRAP_PEERS = [
    {ip: '45.63.84.226', port: 18018},
    {ip: '45.63.89.228', port: 18018},
    {ip: '144.202.122.8', port: 18018},
];

const GREETING = {
    type: 'hello',
    version: '0.9.0',
    agent: 'Knickknack Marabu Client',
};

/* HELPER FUNCTIONS */

function sendMessage(socket: net.Socket, message: object) {
    socket.write(canonicalize(message) + '\n');
};

/* SERVER SIDE */

const server = net.createServer(socket => {
    sendMessage(socket, GREETING);

    const address = `${socket.remoteAddress}:${socket.remotePort}`;
    console.log(`Client connected: ${address}`);

    let receivedHello = false;
    let buffer = '';

    socket.on('data', data => {
        buffer += data;
        const messages = buffer.split('\n');
        if (messages.length > 1) {
            for (const m of messages.slice(0, -1)) {
                console.log(`Client ${address} sent: ${m}`);
                try {
                    const message = JSON.parse(m);
                    if (!receivedHello) {
                        if (message.type !== 'hello' || message.version !== '0.9.0') {
                            // TODO: allow message.version to be 0.9.x
                            console.log(`Ending socket with client ${address}`);
                            sendMessage(socket, {
                                type: 'error',
                                name: 'INVALID_HANDSHAKE',
                            });
                            socket.end();
                        } else {
                            receivedHello = true;
                        }
                    } else {
                        switch (message.type) {
                            case 'hello':
                                break;
                            case 'error':
                                break;
                            case 'getpeers':
                                break;
                            case 'peers':
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
                                sendMessage(socket, {
                                    type: 'error',
                                    name: 'INVALID_FORMAT',
                                    message: 'Invalid message type.',
                                });
                                break;
                        }
                    }
                } catch (e) {
                    console.error(e);
                    sendMessage(socket, {
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
    });

    socket.on('error', error => {
        console.error(`Client ${address} error: ${error}`);
    });

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

    socket.connect(p.port, p.ip, () => {
        console.log('Connected to server');
        sendMessage(socket, GREETING);
    });

    socket.on('data', data => {
        console.log(`Server sent: ${data}`);
    });

    socket.on('error', error => {
        console.error(`Server error: ${error}`);
    });

    socket.on('close', () => {
        console.log('Server disconnected');
    });
}

