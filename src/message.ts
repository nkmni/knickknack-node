import {Literal, Record, String, Array, Union, Static, Number} from 'runtypes';

/* Hello */
export const HelloMessage = Record({
    type: Literal('hello'),
    version: String,
    agent: String,
});
export type HelloMessageType = Static<typeof HelloMessage>;

/* Error */
const ErrorChoices = Union(
    Literal('INTERNAL_ERROR'),
    Literal('INVALID_FORMAT'),
    Literal('INVALID_HANDSHAKE'),
    Literal('INVALID_TX_OUTPOINT'),
    Literal('INVALID_TX_SIGNATURE'),
    Literal('INVALID_TX_CONSERVATION'),
    Literal('UNKNOWN_OBJECT'),
    Literal('UNFINDABLE_OBJECT'),
);

export const ErrorMessage = Record({
    type: Literal('error'),
    name: ErrorChoices,
    description: String,
});
export type ErrorMessageType = Static<typeof ErrorMessage>;
export type ErrorChoice = Static<typeof ErrorChoices>;

export class AnnotatedError extends Error {
    err = '';
    constructor(name: ErrorChoice, description: string) {
        super(description);
        this.name = name;
        Object.setPrototypeOf(this, AnnotatedError.prototype);
    }

    getJSON() {
        const jsonError = {
            type: 'error',
            name: this.name,
            description: this.message,
        };
        if (ErrorMessage.guard(jsonError)) {
            return jsonError;
        } else {
            return {
                type: 'error',
                name: 'INTERNAL_ERROR',
                description: 'Something went wrong.',
            };
        }
    }
}

/* GetPeers */
export const GetPeersMessage = Record({
    type: Literal('getpeers'),
});
export type GetPeersMessageType = Static<typeof GetPeersMessage>;

/* Peers */
export const PeersMessage = Record({
    type: Literal('peers'),
    peers: Array(String),
});
export type PeersMessageType = Static<typeof PeersMessage>;

/* GetObject */
export const GetObjectMessage = Record({
    type: Literal('getobject'),
    objectid: String,
});
export type GetObjectMessageType = Static<typeof GetObjectMessage>;

/* IHaveObject */
export const IHaveObjectMessage = Record({
    type: Literal('ihaveobject'),
    objectid: String,
});
export type IHaveObjectMessageType = Static<typeof IHaveObjectMessage>;

/* Object */
export const NestedObjectMessage = Record({
    type: Literal('block'),
    txids: Array(String),
    nonce: String,
    previd: String,
    created: String,
    T: String,
});
export type NestedObjectMessageType = Static<typeof NestedObjectMessage>;

export const ObjectMessage = Record({
    type: Literal('object'),
    object: NestedObjectMessage,
});
export type ObjectMessageType = Static<typeof ObjectMessage>;

/* GetMempool */
export const GetMempoolMessage = Record({
    type: Literal('getmempool'),
});
export type GetMempoolMessageType = Static<typeof GetMempoolMessage>;

/* Mempool */
export const MempoolMessage = Record({
    type: Literal('mempool'),
});
export type MempoolMessageType = Static<typeof MempoolMessage>;

/* Get Chain Tip */
export const GetChainTipMessage = Record({
    type: Literal('getchaintip'),
});
export type GetChainTipMessageType = Static<typeof GetChainTipMessage>;

/* Chain Tip */
export const ChainTipMessage = Record({
    type: Literal('chaintip'),
    blockid: String,
});
export type ChainTipMessageType = Static<typeof ChainTipMessage>;

/* Definitions for Transactions */

/* Outpoint */
export const OutPoint = Record({
    txid: String,
    index: Number,
});
export type OutPointType = Static<typeof OutPoint>;

/* Input */
export const Input = Record({
    outpoint: OutPoint,
    sig: String,
});
export type InputType = Static<typeof Input>;

/* Output */
export const Output = Record({
    pubkey: String,
    value: Number,
});
export type OutputType = Static<typeof Output>;

/* Transaction */
export const Transaction = Record({
    type: Literal('transaction'),
    inputs: Array(Input),
    outputs: Array(Output),
});
export type TransactionType = Static<typeof Transaction>;

/* Coinbase Transaction */
export const CoinbaseTransaction = Record({
    type: Literal('transaction'),
    height: Number,
    outputs: Array(Output),
});
export type CoinbaseTransactionType = Static<typeof CoinbaseTransaction>;

/* All */
export const Message = Union(
    HelloMessage,
    GetPeersMessage,
    PeersMessage,
    ErrorMessage,
    GetObjectMessage,
    IHaveObjectMessage,
    ObjectMessage,
    GetMempoolMessage,
    MempoolMessage,
    GetChainTipMessage,
    ChainTipMessage,
    Transaction,
    CoinbaseTransaction,
);
export type MessageType = Static<typeof Message>;

export const Messages = [
    HelloMessage,
    GetPeersMessage,
    PeersMessage,
    ErrorMessage,
    GetObjectMessage,
    IHaveObjectMessage,
    ObjectMessage,
    GetMempoolMessage,
    MempoolMessage,
    GetChainTipMessage,
    ChainTipMessage,
    Transaction,
    CoinbaseTransaction,
];
