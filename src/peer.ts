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
    TxInput,
    TxInputType,
    TxOutpoint,
    TxOutpointType,
    TxOutput,
    TxOutputType,
    TxObject,
    TxObjectType,
    CoinbaseTxObject,
    CoinbaseTxObjectType,
    StandardTxObject,
    StandardTxObjectType,
    BlockTxObject,
    BlockTxObjectType,
    BlockObject,
} from './message';
import {peerManager} from './peermanager';
import {canonicalize} from 'json-canonicalize';
import {db} from './store';
import * as ed from '@noble/ed25519';
import {sign} from 'crypto';
import {createHash} from 'blake2';

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
    async store(sentObject: BlockTxObjectType) {
        const id = this.getObjectId(sentObject);
        await db.put(`object-${id}`, sentObject);
    }

    async isValidSig(sig: string) {
        return /^[a-f0-9]{128}$/.test(sig);
    }

    async isValidPubKey(pubkey: string) {
        return /^[a-f0-9]{64}$/.test(pubkey);
    }

    getNullSigsTxObjMessage(obj: StandardTxObjectType) {
        let objWithoutSigs: StandardTxObjectType = JSON.parse(
            JSON.stringify(obj),
        );
        for (let i = 0; i < objWithoutSigs.inputs.length; i++) {
            objWithoutSigs.inputs[i].sig = null;
        }
        return canonicalize(objWithoutSigs);
    }

    async validateTxObject(obj: TxObjectType) {
        if (StandardTxObject.guard(obj)) {
            const objWithoutSigsStr = this.getNullSigsTxObjMessage(obj);
            let outputSum = 0;
            for (const output of obj.outputs) {
                //Check format of output value
                if (output.value < 0 || !Number.isInteger(output.value)) {
                    this.sendError(
                        new AnnotatedError(
                            'INVALID_FORMAT',
                            `Invalid output value for output with public key ${
                                output.pubkey
                            } of transaction ${this.getObjectId(obj)}`,
                        ),
                    );
                    return false;
                }
                if (!this.isValidPubKey(output.pubkey)) {
                    this.sendError(
                        new AnnotatedError(
                            'INVALID_FORMAT',
                            `Invalid pubkey in transaction ${this.getObjectId(
                                obj,
                            )}`,
                        ),
                    );
                    return false;
                }
                outputSum += output.value;
            }
            let inputSum = 0;
            for (const input of obj.inputs) {
                try {
                    let inputTx: TxObjectType = await db.get(
                        `object-${input.outpoint.txid}`,
                    );
                    if (
                        input.outpoint.index < 0 ||
                        input.outpoint.index >= inputTx.outputs.length
                    ) {
                        this.sendError(
                            new AnnotatedError(
                                'INVALID_TX_OUTPOINT',
                                `Invalid outpoint index for input ${
                                    input.outpoint.txid
                                } of transaction ${this.getObjectId(obj)}`,
                            ),
                        );
                        return false;
                    }
                    if (input.sig === null || !this.isValidSig(input.sig)) {
                        this.sendError(
                            new AnnotatedError(
                                'INVALID_TX_SIGNATURE',
                                `Invalid signature for input ${
                                    input.outpoint.txid
                                } of transaction ${this.getObjectId(obj)}`,
                            ),
                        );
                        return false;
                    }
                    let inputTxOutput = inputTx.outputs[input.outpoint.index];
                    const sigArray = Uint8Array.from(
                        Buffer.from(input.sig, 'hex'),
                    );
                    if (
                        !(await ed.verify(
                            sigArray,
                            objWithoutSigsStr,
                            inputTxOutput.pubkey,
                        ))
                    ) {
                        this.sendError(
                            new AnnotatedError(
                                'INVALID_TX_SIGNATURE',
                                `Invalid signature for input ${
                                    input.outpoint.txid
                                } of transaction ${this.getObjectId(obj)}`,
                            ),
                        );
                        return false;
                    }
                    inputSum += inputTxOutput.value;
                } catch (error) {
                    this.debug(
                        `Could not find input ${input.outpoint.txid} in database. Error: ${error.message}`,
                    );
                    this.sendError(
                        new AnnotatedError(
                            'UNKNOWN_OBJECT',
                            `Could not find in database: input ${
                                input.outpoint.txid
                            } of transaction ${this.getObjectId(obj)}`,
                        ),
                    );
                    return false;
                }
            }
            if (inputSum < outputSum) {
                this.sendError(
                    new AnnotatedError(
                        'INVALID_TX_CONSERVATION',
                        `Value not conserved for transaction ${this.getObjectId(
                            obj,
                        )}`,
                    ),
                );
                return false;
            }
        } else {
            return true;
        }
        return true;
    }

    /* If new obj, store in db and broadcast. If not, do nothing. */
    async receivedObject(sentObject: BlockTxObjectType) {
        const id = this.getObjectId(sentObject);
        try {
            // Has object in db, do nothing
            await db.get(`object-${id}`);
        } catch {
            // Store new obj, broadcast to all peers
            if (
                (TxObject.guard(sentObject) &&
                    (await this.validateTxObject(sentObject))) ||
                BlockObject.guard(sentObject)
            ) {
                await this.store(sentObject);
                this.debug(
                    `Broadcasting "ihaveobject" msg to all connected peers for object id: ${id}}`,
                );
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
    }

    /* General Helper Functions */

    /* Function to map objects to objectids (canonical -> BLAKE2 hash). */
    getObjectId(obj: BlockTxObjectType) {
        var hash = createHash('blake2s');
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

    /* On Events */

    async onConnect() {
        this.active = true;
        await this.sendHello();
        await this.sendGetPeers();
        peerManager.addConnectedPeer(this);
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
