import { Buffer } from 'buffer';
import { User } from 'nengi';
import type { BinaryAdapter, IServerNetworkAdapter, InstanceNetwork } from 'nengi';
import { WebSocketServer } from 'ws';
type WsListenOptions = number | {
    port: number;
    host?: string;
};
declare class WsInstanceAdapter implements IServerNetworkAdapter<Buffer, Buffer, WsListenOptions> {
    network: InstanceNetwork;
    binary: BinaryAdapter<Buffer>;
    server: WebSocketServer | null;
    constructor(network: InstanceNetwork, config?: any);
    listen(options: WsListenOptions, ready?: () => void): void;
    disconnect(user: User, reason: any): void;
    send(user: User, buffer: Buffer): void;
}
export { WsInstanceAdapter, WsListenOptions };
