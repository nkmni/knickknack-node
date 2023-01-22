import { logger } from './logger';
import { MessageSocket } from './network';
import semver from 'semver';
import { Messages,
         Message, HelloMessage, PeersMessage, GetPeersMessage, ErrorMessage, GetObjectMessage, IHaveObjectMessage, ObjectMessage, GetMempoolMessage, MempoolMessage, GetChainTipMessage, ChainTipMessage,
         MessageType, HelloMessageType, PeersMessageType, GetPeersMessageType, ErrorMessageType, GetObjectMessageType, IHaveObjectMessageType, ObjectMessageType, 
         GetMempoolMessageType, MempoolMessageType, GetChainTipMessageType, ChainTipMessageType, AnnotatedError } from './message';
import { peerManager } from './peermanager';
import { canonicalize } from 'json-canonicalize';
import { db } from './store';

const VERSION = '0.9.0'
const NAME = 'Knickknack (pset2)'

export class Peer {
  active: boolean = false
  socket: MessageSocket
  handshakeCompleted: boolean = false

  async sendHello() {
    this.sendMessage({
      type: 'hello',
      version: VERSION,
      agent: NAME
    })
  }
  async sendGetPeers() {
    this.sendMessage({
      type: 'getpeers'
    })
  }

  async sendPeers() {
    this.sendMessage({
      type: 'peers',
      peers: [...peerManager.knownPeers]
    })
  }

  async sendError(err: AnnotatedError) {
    try {
      this.sendMessage(err.getJSON())
    } catch (error) {
      this.sendMessage(new AnnotatedError('INTERNAL_ERROR', `Failed to serialize error message: ${error}`).getJSON())
    }
  }

  /* If has object in db, send to requester. If not, do nothing. */
  async getObject(objectid: string) {
    this.debug (`Client asked us for object with id: ${objectid}`);
    try {
        const reqObj = await db.get(`object-${objectid}`);
        this.sendMessage(reqObj);
        this.debug (`Sent object with id: ${objectid}`);
    } catch {
        this.debug (`Knickknack does not have object with id: ${objectid}`);
        return;
    }
  }

  /* If has obj in db, do nothing. Else, request 'getobject' */
  async iHaveObject(objectid: string) {
    try { // Has object in db
        await db.get(`object-${objectid}`);
    } catch {
        const getObject = {
            type: 'getobject',
            objectid: objectid
          }
        this.sendMessage(getObject);
        return;
    }
  }

  /* Store object in db */
  async store(sentObject: object) {
    const objectid = this.getObjectId(sentObject);
    await db.put(`object-${objectid}`, sentObject)
  }

  /* If new obj, store in db and broadcast. If not, do nothing. */
  async receivedObject(sentObject: object) {
    const objectid = this.getObjectId(sentObject);
    try { // Has object in db, do nothing
        await db.get(`object-${objectid}`);
    } catch { // Store new obj, broadcast to all peers
        await this.store(sentObject);
        const IHAVEOBJECTMSG = {
            type: "ihaveobject",
            objectid: objectid
        };
        peerManager.connectedPeers.forEach((peer: Peer, address: string) => {
            peer.sendMessage(IHAVEOBJECTMSG);
            this.debug (`Broadcasted "ihaveobject" msg to client: ${address}`);
        });
        return;
    }
  }

  /* General Helper Functions */

  /* Function to map objects to objectids (canonical -> BLAKE2 hash). */
  getObjectId(obj: object) {
    var blake2 = require('blake2');
    var hash = blake2.createHash('blake2s');
    hash.update(Buffer.from(canonicalize(obj)));
    return(hash.digest("hex"));
    // already tested/verified using genesis block
  }

  sendMessage(obj: object) {
    const message: string = canonicalize(obj)
    this.debug(`Sending message: ${message}`)
    this.socket.sendMessage(message)
  }

  async fatalError(err: AnnotatedError) {
    await this.sendError(err)
    this.warn(`Peer error: ${err}`)
    this.active = false
    this.socket.end()
  }

  /* On Events */

  async onConnect() {
    this.active = true
    await this.sendHello()
    await this.sendGetPeers()
  }

  async onTimeout() {
    return await this.fatalError(new AnnotatedError('INVALID_FORMAT', 'Timed out before message was complete'))
  }

  /* Process message */
  async onMessage(message: string) {
    this.debug(`Message arrival: ${message}`)

    let msg: object

    try {
      msg = JSON.parse(message)
      this.debug(`Parsed message into: ${JSON.stringify(msg)}`)
    }
    catch {
      return await this.fatalError(new AnnotatedError('INVALID_FORMAT', `Failed to parse incoming message as JSON: ${message}`))
    }
    if (!Message.guard(msg)) {
      return await this.fatalError(new AnnotatedError('INVALID_FORMAT', `The received message does not match one of the known message formats: ${message}`))
    }
    if (!this.handshakeCompleted) {
      if (HelloMessage.guard(msg)) {
        return this.onMessageHello(msg)
      }
      return await this.fatalError(new AnnotatedError('INVALID_HANDSHAKE', `Received message ${message} prior to "hello"`))
    }
    Message.match(
      async () => {
        return await this.fatalError(new AnnotatedError('INVALID_HANDSHAKE', `Received a second "hello" message, even though handshake is completed`))
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
      this.onMessageChainTip.bind(this)
    )(msg)
  }

  /* Message Options */
  async onMessageHello(msg: HelloMessageType) {
    if (!semver.satisfies(msg.version, `^${VERSION}`)) {
      return await this.fatalError(new AnnotatedError('INVALID_FORMAT', `You sent an incorrect version (${msg.version}), which is not compatible with this node's version ${VERSION}.`))
    }
    this.info(`Handshake completed. Remote peer running ${msg.agent} at protocol version ${msg.version}`)
    this.handshakeCompleted = true
  }

  async onMessagePeers(msg: PeersMessageType) {
    for (const peer of msg.peers) {
      this.info(`Remote party reports knowledge of peer ${peer}`)
      peerManager.peerDiscovered(peer)
    }
  }

  async onMessageGetPeers(msg: GetPeersMessageType) {
    this.info(`Remote party is requesting peers. Sharing.`)
    await this.sendPeers()
  }

  async onMessageError(msg: ErrorMessageType) {
    this.warn(`Peer reported error: ${msg.name}`)
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

  async onMessageGetMempool(msg: GetMempoolMessageType){}
  async onMessageMempool(msg: MempoolMessageType){}
  async onMessageGetChainTip(msg: GetChainTipMessageType){}
  async onMessageChainTip(msg: ChainTipMessageType){}

  /* Logging */
  log(level: string, message: string) {
    logger.log(level, `[peer ${this.socket.peerAddr}:${this.socket.netSocket.remotePort}] ${message}`)
  }
  warn(message: string) {
    this.log('warn', message)
  }
  info(message: string) {
    this.log('info', message)
  }
  debug(message: string) {
    this.log('debug', message)
  }

  /* Constructor */
  constructor(socket: MessageSocket) {
    this.socket = socket;

    socket.netSocket.on('connect', this.onConnect.bind(this))
    socket.netSocket.on('error', err => {
      this.warn(`Socket error: ${err}`)
    })
    socket.on('message', this.onMessage.bind(this))
    socket.on('timeout', this.onTimeout.bind(this))
  }
}
