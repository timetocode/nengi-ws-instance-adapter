import { Buffer } from 'buffer';
import type { BinaryAdapter, IServerNetworkAdapter, ServerAdapterHost, ServerConnection } from 'nengi';
import { WebSocket, WebSocketServer } from 'ws';
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
    network: ServerAdapterHost;
    binary: BinaryAdapter<Buffer>;
    server: WebSocketServer | null;
    private config;
    private maxPayloadLength;
    private maxBufferedBytes;
    private shutdownPromise?;
    readonly serverAdapterVersion: 1;
    constructor(network: ServerAdapterHost, config?: WsInstanceAdapterConfig);
    listen(options: WsListenOptions, ready?: () => void): void;
    shutdown(reason?: any): Promise<void>;
    disconnect(user: ServerConnection<WebSocket>, reason: any): void;
    terminate(user: ServerConnection<WebSocket>, reason: any): void;
    send(user: ServerConnection<WebSocket>, buffer: Buffer): void;
}
export { WsInstanceAdapter, WsListenOptions, WsInstanceAdapterConfig };
