import {
    Literal,
    Record,
    String,
    Array,
    Union,
    Static,
    Number,
    Null,
} from 'runtypes';

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
export const BlockObject = Record({
    type: Literal('block'),
    txids: Array(String),
    nonce: String,
    previd: String,
    created: Number,
    T: String,
});
export type BlockObjectType = Static<typeof BlockObject>;

/* Definitions for Transactions */

/* Outpoint */
export const TxOutpoint = Record({
    txid: String,
    index: Number,
});
export type TxOutpointType = Static<typeof TxOutpoint>;

/* Input */
export const TxInput = Record({
    outpoint: TxOutpoint,
    sig: Union(String, Null),
});
export type TxInputType = Static<typeof TxInput>;

/* Output */
export const TxOutput = Record({
    pubkey: String,
    value: Number,
});
export type TxOutputType = Static<typeof TxOutput>;

/* Transaction */
export const StandardTxObject = Record({
    type: Literal('transaction'),
    inputs: Array(TxInput),
    outputs: Array(TxOutput),
});
export type StandardTxObjectType = Static<typeof StandardTxObject>;

/* Coinbase Transaction */
export const CoinbaseTxObject = Record({
    type: Literal('transaction'),
    height: Number,
    outputs: Array(TxOutput),
});
export type CoinbaseTxObjectType = Static<typeof CoinbaseTxObject>;

export const TxObject = Union(StandardTxObject, CoinbaseTxObject);
export type TxObjectType = Static<typeof TxObject>;

export const BlockTxObject = Union(BlockObject, TxObject);
export type BlockTxObjectType = Static<typeof BlockTxObject>;

export const ObjectMessage = Record({
    type: Literal('object'),
    object: BlockTxObject,
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
];
