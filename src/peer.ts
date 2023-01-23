import {logger} from './logger';
import {MessageSocket} from './network';
import semver from 'semver';
import {
    Messages,
    Message,
    HelloMessage,
    PeersMessage,
    GetPeersMessage,
    ErrorMessage,
    GetObjectMessage,
    IHaveObjectMessage,
    ObjectMessage,
    GetMempoolMessage,
    MempoolMessage,
    GetChainTipMessage,
    ChainTipMessage,
    MessageType,
    HelloMessageType,
    PeersMessageType,
    GetPeersMessageType,
    ErrorMessageType,
    GetObjectMessageType,
    IHaveObjectMessageType,
    ObjectMessageType,
    GetMempoolMessageType,
    MempoolMessageType,
    GetChainTipMessageType,
    ChainTipMessageType,
    AnnotatedError,
    Input,
    InputType,
    OutPoint,
    OutPointType,
    Output,
    OutputType,
    Transaction,
    TransactionType,
    CoinbaseTransaction,
    CoinbaseTransactionType,
} from './message';
import {peerManager} from './peermanager';
import {canonicalize} from 'json-canonicalize';
import {db} from './store';
import * as ed from '@noble/ed25519';
import {sign} from 'crypto';

const VERSION = '0.9.0';
const NAME = 'Knickknack (pset2)';

export class Peer {
    active: boolean = false;
    socket: MessageSocket;
    handshakeCompleted: boolean = false;

    async sendHello() {
        this.sendMessage({
            type: 'hello',
            version: VERSION,
            agent: NAME,
        });
    }
    async sendGetPeers() {
        this.sendMessage({
            type: 'getpeers',
        });
    }

    async sendPeers() {
        this.sendMessage({
            type: 'peers',
            peers: [...peerManager.knownPeers],
        });
    }

    async sendError(err: AnnotatedError) {
        try {
            this.sendMessage(err.getJSON());
        } catch (error) {
            this.sendMessage(
                new AnnotatedError(
                    'INTERNAL_ERROR',
                    `Failed to serialize error message: ${error}`,
                ).getJSON(),
            );
        }
    }

    /* If has object in db, send to requester. If not, do nothing. */
    async getObject(objectid: string) {
        this.debug(`Client asked us for object with id: ${objectid}`);
        try {
            const reqObj = await db.get(`object-${objectid}`);
            this.sendMessage({type: 'object', object: reqObj});
            this.debug(`Sent object with id: ${objectid}`);
        } catch {
            this.debug(`Knickknack does not have object with id: ${objectid}`);
            return;
        }
    }

    /* If has obj in db, do nothing. Else, request 'getobject' */
    async iHaveObject(id: string) {
        try {
            // Has object in db
            await db.get(`object-${id}`);
        } catch {
            this.sendMessage({
                type: 'getobject',
                objectid: `${id}`,
            });
            return;
        }
    }

    /* Store object in db */
    async store(sentObject: object) {
        const id = this.getObjectId(sentObject);
        await db.put(`object-${id}`, sentObject);
    }

    /* Store transaction in db and gossip it*/
    async storeTx(tx: object) {
        const id = this.getObjectId(tx);
        await this.store(tx);
        await this.iHaveObject(id);
    }
    
    /* If new obj, store in db and broadcast. If not, do nothing. */
    async receivedObject(sentObject: object) {
        const id = this.getObjectId(sentObject);
        try {
            // Has object in db, do nothing
            await db.get(`object-${id}`);
        } catch {
            // Store new obj, broadcast to all peers
            await this.store(sentObject);
            peerManager.connectedPeers.forEach(
                (peer: Peer, address: string) => {
                    peer.sendMessage({
                        type: 'ihaveobject',
                        objectid: `${id}`,
                    });
                    this.debug(
                        `Broadcasted "ihaveobject" msg to client: ${address}`,
                    );
                },
            );
            return;
        }
    }

    /* General Helper Functions */

    /* Function to map objects to objectids (canonical -> BLAKE2 hash). */
    getObjectId(obj: object) {
        var blake2 = require('blake2');
        var hash = blake2.createHash('blake2s');
        hash.update(Buffer.from(canonicalize(obj)));
        return hash.digest('hex');
        // already tested/verified using genesis block
    }

    sendMessage(obj: object) {
        const message: string = canonicalize(obj);
        this.debug(`Sending message: ${message}`);
        this.socket.sendMessage(message);
    }

    async fatalError(err: AnnotatedError) {
        await this.sendError(err);
        this.warn(`Peer error: ${err}`);
        this.active = false;
        this.socket.end();
    }

    async isValidHex(val: string) {
        if (val.toLowerCase() !== val) {
            return false;
        }
        if (/^[a-f0-9]*$/.test(val)) {
            return false;
        }
        return true;
    }

    async isValidSig(sig: string) {
        if (sig.length !== 128) {
            return false;
        }
        return this.isValidHex(sig);
    }

    async isValidPubKey(pubkey: string) {
        if (pubkey.length !== 64) {
            return false;
        }
        return this.isValidHex(pubkey);
    }

    // async fromHexString = (hexString) => Uint8Array.from(hexString.match(/.{1,2}/g).map((byte) => parseInt(byte, 16)));

    // async hexToUint8(hex: string){
    //   if(hex.match(/.{1,2}/g) === null){
    //     return NaN;
    //   }else{
    //     return Uint8Array.from(hex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
    //   }
    // }

    // async unit8ToHex()

    // const toHexString = (bytes) => bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '');

    /* On Events */

    async onConnect() {
        this.active = true;
        await this.sendHello();
        await this.sendGetPeers();
    }

    async onTimeout() {
        return await this.fatalError(
            new AnnotatedError(
                'INVALID_FORMAT',
                'Timed out before message was complete',
            ),
        );
    }

    /* Process message */
    async onMessage(message: string) {
        this.debug(`Message arrival: ${message}`);

        let msg: object;

        try {
            msg = JSON.parse(message);
            this.debug(`Parsed message into: ${JSON.stringify(msg)}`);
        } catch {
            return await this.fatalError(
                new AnnotatedError(
                    'INVALID_FORMAT',
                    `Failed to parse incoming message as JSON: ${message}`,
                ),
            );
        }
        if (!Message.guard(msg)) {
            return await this.fatalError(
                new AnnotatedError(
                    'INVALID_FORMAT',
                    `The received message does not match one of the known message formats: ${message}`,
                ),
            );
        }
        if (!this.handshakeCompleted) {
            if (HelloMessage.guard(msg)) {
                return this.onMessageHello(msg);
            }
            return await this.fatalError(
                new AnnotatedError(
                    'INVALID_HANDSHAKE',
                    `Received message ${message} prior to "hello"`,
                ),
            );
        }
        Message.match(
            async () => {
                return await this.fatalError(
                    new AnnotatedError(
                        'INVALID_HANDSHAKE',
                        `Received a second "hello" message, even though handshake is completed`,
                    ),
                );
            },
            this.onMessageGetPeers.bind(this),
            this.onMessagePeers.bind(this),
            this.onMessageError.bind(this),
            this.onMessageGetObject.bind(this),
            this.onMessageIHaveObject.bind(this),
            this.onMessageObject.bind(this),
            this.onMessageGetMempool.bind(this),
            this.onMessageMempool.bind(this),
            this.onMessageGetChainTip.bind(this),
            this.onMessageChainTip.bind(this),
            this.onTransaction.bind(this),
            this.onCoinbaseTransaction.bind(this),
        )(msg);
    }

    /* Message Options */
    async onMessageHello(msg: HelloMessageType) {
        if (!semver.satisfies(msg.version, `^${VERSION}`)) {
            return await this.fatalError(
                new AnnotatedError(
                    'INVALID_FORMAT',
                    `You sent an incorrect version (${msg.version}), which is not compatible with this node's version ${VERSION}.`,
                ),
            );
        }
        this.info(
            `Handshake completed. Remote peer running ${msg.agent} at protocol version ${msg.version}`,
        );
        this.handshakeCompleted = true;
    }

    async onMessagePeers(msg: PeersMessageType) {
        for (const peer of msg.peers) {
            this.info(`Remote party reports knowledge of peer ${peer}`);
            peerManager.peerDiscovered(peer);
        }
    }

    async onMessageGetPeers(msg: GetPeersMessageType) {
        this.info(`Remote party is requesting peers. Sharing.`);
        await this.sendPeers();
    }

    async onMessageError(msg: ErrorMessageType) {
        this.warn(`Peer reported error: ${msg.name}`);
    }

    async onMessageGetObject(msg: GetObjectMessageType) {
        await this.getObject(msg.objectid);
    }

    async onMessageIHaveObject(msg: IHaveObjectMessageType) {
        await this.iHaveObject(msg.objectid);
    }

    async onMessageObject(msg: ObjectMessageType) {
        await this.receivedObject(msg.object);
    }

    async onMessageGetMempool(msg: GetMempoolMessageType) {}
    async onMessageMempool(msg: MempoolMessageType) {}
    async onMessageGetChainTip(msg: GetChainTipMessageType) {}
    async onMessageChainTip(msg: ChainTipMessageType) {}

    /* Transaction Options */
    async onTransaction(msg: TransactionType) {
        var inputSum = 0;
        var outputSum = 0;
        //Check formatting for each input
        for (var input of msg.inputs) {
            const id = input.outpoint.txid;
            const index = input.outpoint.index;

            //Check if index is of valid integer format
            if (!Number.isInteger(index) || index < 0) {
                return await this.fatalError(
                    new AnnotatedError(
                        'INVALID_FORMAT',
                        `You sent a transaction that has an invalid outpoint index value.`,
                    ),
                );
            }

            //Check if outpoints exist in database
            try {
                const obj = await db.get(`object-${id}`);
                if (!Transaction.guard(obj)) {
                    return await this.fatalError(
                        new AnnotatedError(
                            'INVALID_TX_OUTPOINT',
                            `You sent a transaction with outpoint ids that are not associated with transactions.`,
                        ),
                    );
                }

                //Check if index is correct
                if (obj.outputs.length <= index) {
                    return await this.fatalError(
                        new AnnotatedError(
                            'INVALID_TX_OUTPOINT',
                            `The transaction outpoint index is too large.`,
                        ),
                    );
                }

                //Verify signature
                const pubkey = obj.outputs[index].pubkey;
                const sig = input.sig;
                const stringMsg = JSON.stringify(msg);

                if (!this.isValidPubKey(pubkey)) {
                    return await this.fatalError(
                        new AnnotatedError(
                            'INVALID_FORMAT',
                            `You sent a transaction that has an invalid outpoint public key format.`,
                        ),
                    );
                }

                if (!this.isValidSig(sig)) {
                    return await this.fatalError(
                        new AnnotatedError(
                            'INVALID_FORMAT',
                            `You sent a transaction that has an invalid outpoint signature format.`,
                        ),
                    );
                }

                /* TO DO: Verify signature using ed25519, and figure out how to convert from hex to uint8
          here's what I found out:
          - ed25519 doesn't need to be changed to uint8 (according to their git), if this is not true I tried to write some conversion methods above, not sure if/how they work
          - I'm pretty sure we need the original string version of the message so I converted it back 
          - I think the line I've written below should cover the verification, as long as keys and messages are created using ed, but can't check that yet*/

                const isValid = await ed.verify(sig, stringMsg, pubkey);

                if (!isValid) {
                    return await this.fatalError(
                        new AnnotatedError(
                            'INVALID_TX_SIGNATURE',
                            `The transaction is invalid.`,
                        ),
                    );
                }

                inputSum += obj.outputs[index].value;
            } catch {
                return await this.fatalError(
                    new AnnotatedError(
                        'INVALID_TX_OUTPOINT',
                        `You sent a transaction with outpoints that do not exist in the database.`,
                    ),
                );
            }
        }

        //Output validation
        for (var output of msg.outputs) {
            if (!this.isValidPubKey(output.pubkey)) {
                return await this.fatalError(
                    new AnnotatedError(
                        'INVALID_FORMAT',
                        `You sent a transaction that has an invalid output public key format.`,
                    ),
                );
            }
            if (!Number.isInteger(output.value) || output.value < 0) {
                return await this.fatalError(
                    new AnnotatedError(
                        'INVALID_FORMAT',
                        `You sent a transaction that has an invalid output value.`,
                    ),
                );
            }
            outputSum += output.value;
        }

        //Weak law of conservation check
        if (inputSum < outputSum) {
            return await this.fatalError(
                new AnnotatedError(
                    'INVALID_TX_CONSERVATION',
                    `The transaction does not satisfy the weak law of conservation.`,
                ),
            );
        }

        await this.storeTx(msg);
    }

    async onCoinbaseTransaction(msg: CoinbaseTransactionType) {
        await this.storeTx(msg);
    }

    /* Logging */
    log(level: string, message: string) {
        logger.log(
            level,
            `[peer ${this.socket.peerAddr}:${this.socket.netSocket.remotePort}] ${message}`,
        );
    }
    warn(message: string) {
        this.log('warn', message);
    }
    info(message: string) {
        this.log('info', message);
    }
    debug(message: string) {
        this.log('debug', message);
    }

    /* Constructor */
    constructor(socket: MessageSocket) {
        this.socket = socket;

        socket.netSocket.on('connect', this.onConnect.bind(this));
        socket.netSocket.on('error', err => {
            this.warn(`Socket error: ${err}`);
        });
        socket.on('message', this.onMessage.bind(this));
        socket.on('timeout', this.onTimeout.bind(this));
    }
}
