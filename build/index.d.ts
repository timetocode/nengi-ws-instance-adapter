import { Buffer } from 'buffer';
import { User } from 'nengi';
import type { BinaryAdapter, IServerNetworkAdapter, InstanceNetwork } from 'nengi';
import { WebSocketServer } from 'ws';
type WsInstanceAdapterConfig = {
    binary?: BinaryAdapter<Buffer>;
    maxPayloadLength?: number;
    maxBufferedBytes?: number;
    /** Trust forwarding headers only from a known direct proxy peer. */
    trustProxy?: (remoteAddress: string) => boolean;
};
type WsListenOptions = number | {
    port: number;
    host?: string;
};
declare class WsInstanceAdapter implements IServerNetworkAdapter<Buffer, Buffer, WsListenOptions> {
    network: InstanceNetwork;
    binary: BinaryAdapter<Buffer>;
    server: WebSocketServer | null;
    private config;
    private maxPayloadLength;
    private maxBufferedBytes;
    constructor(network: InstanceNetwork, config?: WsInstanceAdapterConfig);
    listen(options: WsListenOptions, ready?: () => void): void;
    disconnect(user: User, reason: any): void;
    terminate(user: User, reason: any): void;
    send(user: User, buffer: Buffer): void;
}
export { WsInstanceAdapter, WsListenOptions, WsInstanceAdapterConfig };
