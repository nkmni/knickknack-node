import net from 'net';
import delay from 'delay';

const SERVER_HOST = '0.0.0.0';
const SERVER_PORT = 18018;

const socket = new net.Socket();

socket.connect(SERVER_PORT, SERVER_HOST, async () => {
    console.log('Connected to server');
    await delay(3000);
    socket.write('Hello, server! Love, client.')
});

socket.on('data', data => {
    console.log(`Server sent: ${data}`);
});

socket.on('error', error => {
    console.error(`Server error: ${error}`);
});

socket.on('close', () => {
    console.log(`Server disconnected`);
});