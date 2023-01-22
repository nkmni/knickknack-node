import { Literal, Record, String, Array, Union, Static } from 'runtypes';

/* Hello */
export const HelloMessage = Record({
  type: Literal('hello'),
  version: String,
  agent: String
})
export type HelloMessageType = Static<typeof HelloMessage>

/* Error */
const ErrorChoices = Union(
  Literal('INTERNAL_ERROR'),
  Literal('INVALID_FORMAT'),
  Literal('INVALID_HANDSHAKE')
)

export const ErrorMessage = Record({
  type: Literal('error'),
  name: ErrorChoices,
  description: String
})
export type ErrorMessageType = Static<typeof ErrorMessage>
export type ErrorChoice = Static<typeof ErrorChoices>

export class AnnotatedError extends Error {
  err = ""
  constructor(name: ErrorChoice, description: string) {
    super(description)
    this.name = name
    Object.setPrototypeOf(this, AnnotatedError.prototype)
  }

  getJSON() {
    const jsonError = {type: "error", name: this.name, description: this.message}
    if (ErrorMessage.guard(jsonError)) {
      return jsonError
    }else {
      return {type: "error", name: "INTERNAL_ERROR", description: "Something went wrong."}
    }
  }
}

/* GetPeers */
export const GetPeersMessage = Record({
  type: Literal('getpeers')
})
export type GetPeersMessageType = Static<typeof GetPeersMessage>

/* Peers */
export const PeersMessage = Record({
  type: Literal('peers'),
  peers: Array(String)
})
export type PeersMessageType = Static<typeof PeersMessage>

/* GetObject */
export const GetObjectMessage = Record({
  type: Literal('getobject'),
  objectid: String
})
export type GetObjectMessageType = Static<typeof GetObjectMessage>

/* IHaveObject */
export const IHaveObjectMessage = Record({
  type: Literal('ihaveobject'),
  objectid: String
})
export type IHaveObjectMessageType = Static<typeof IHaveObjectMessage>

/* Object */
export const NestedObjectMessage = Record({
  type: Literal('block'),
  txids: Array(String),
  nonce: String,
  previd: String,
  created: String,
  T: String 
})
export type NestedObjectMessageType = Static<typeof NestedObjectMessage>

export const ObjectMessage = Record({
  type: Literal('object'),
  object: NestedObjectMessage
})
export type ObjectMessageType = Static<typeof ObjectMessage>

/* GetMempool */
export const GetMempoolMessage = Record({
  type: Literal('getmempool')
})
export type GetMempoolMessageType = Static<typeof GetMempoolMessage>

/* Mempool */
export const MempoolMessage = Record({
  type: Literal('mempool')
})
export type MempoolMessageType = Static<typeof MempoolMessage>

/* Get Chain Tip */
export const GetChainTipMessage = Record({
  type: Literal('getchaintip')
})
export type GetChainTipMessageType = Static<typeof GetChainTipMessage>

/* Chain Tip */
export const ChainTipMessage = Record({
  type: Literal('chaintip'),
  blockid: String
})
export type ChainTipMessageType = Static<typeof ChainTipMessage>

/* All */
export const Message = Union(HelloMessage, 
  GetPeersMessage, PeersMessage, ErrorMessage,
  GetObjectMessage, IHaveObjectMessage, ObjectMessage, 
  GetMempoolMessage, MempoolMessage, GetChainTipMessage, 
  ChainTipMessage)
export type MessageType = Static<typeof Message>

export const Messages = [HelloMessage, 
  GetPeersMessage, PeersMessage, ErrorMessage,
  GetObjectMessage, IHaveObjectMessage, ObjectMessage, 
  GetMempoolMessage, MempoolMessage, GetChainTipMessage, 
  ChainTipMessage]