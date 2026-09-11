
import { Buffer } from 'buffer'

import {
    User, UserConnectionState
} from 'nengi'
import type { BinaryAdapter, IServerNetworkAdapter, InstanceNetwork } from 'nengi'

import { bufferBinary } from 'nengi-buffers'

import { WebSocket, WebSocketServer } from 'ws'
import type { RawData } from 'ws'

const ALWAYS_BINARY = { binary: true }

type WsInstanceAdapterConfig = {
    binary?: BinaryAdapter<Buffer>
    maxPayloadLength?: number
    maxBufferedBytes?: number
    /** Trust forwarding headers only from a known direct proxy peer. */
    trustProxy?: (remoteAddress: string) => boolean
}

type WsListenOptions = number | {
    port: number
    host?: string
}

function toBuffer(data: RawData): Buffer {
    if (Buffer.isBuffer(data)) {
        return data
    }
    if (Array.isArray(data)) {
        return Buffer.concat(data)
    }
    if (data instanceof ArrayBuffer) {
        return Buffer.from(data)
    }
    const view = data as ArrayBufferView
    return Buffer.from(view.buffer, view.byteOffset, view.byteLength)
}

class WsInstanceAdapter implements IServerNetworkAdapter<Buffer, Buffer, WsListenOptions> {
    network: InstanceNetwork
    binary: BinaryAdapter<Buffer>
    server: WebSocketServer | null = null
    private config: WsInstanceAdapterConfig
    private maxPayloadLength: number
    private maxBufferedBytes: number

    constructor(network: InstanceNetwork, config: WsInstanceAdapterConfig = {}) {
        this.network = network
        this.binary = config.binary ?? bufferBinary
        this.config = config
        this.maxPayloadLength = config.maxPayloadLength ?? network.instance.limits.maxPacketBytes
        this.maxBufferedBytes = config.maxBufferedBytes ?? 4 * 1024 * 1024
        for (const [name, value] of Object.entries({
            maxPayloadLength: this.maxPayloadLength,
            maxBufferedBytes: this.maxBufferedBytes
        })) {
            if (!Number.isSafeInteger(value) || value <= 0) {
                throw new Error(`${name} must be a positive safe integer.`)
            }
        }
    }

    listen(options: WsListenOptions, ready?: () => void) {
        const listenOptions = typeof options === 'number' ? { port: options } : options
        const wss = new WebSocketServer({
            ...listenOptions,
            maxPayload: this.maxPayloadLength,
            perMessageDeflate: false
        }, ready)
        this.server = wss

        wss.on('connection', (ws, req) => {
            const user = new User(ws, this)
            user.remoteAddress = req.socket.remoteAddress ?? null
            if (user.remoteAddress && this.config.trustProxy?.(user.remoteAddress) && req.headers['x-forwarded-for']) {
                const forwardedFor = Array.isArray(req.headers['x-forwarded-for'])
                    ? req.headers['x-forwarded-for'][0]
                    : req.headers['x-forwarded-for']
                user.remoteAddress = forwardedFor.split(',')[0].trim() || user.remoteAddress
            }

            ws.on('error', error => {
                this.network.disconnectUser(user, error, true)
            })
            ws.on('message', (data, isBinary) => {
                if (user.connectionState === UserConnectionState.Closed) return
                const payload = toBuffer(data)
                if (!isBinary) {
                    this.network.notifyInboundMessageError(user, payload, new Error('Nengi requires binary WebSocket messages.'))
                    this.network.disconnectUser(user, { reason: 'text_frame' }, true)
                    return
                }
                this.network.onMessage(user, payload)
            })
            ws.on('ping', data => { this.network.onTransportControl(user, data.byteLength) })
            ws.on('pong', data => { this.network.onTransportControl(user, data.byteLength) })

            ws.on('close', () => {
                this.network.onClose(user)
            })
            this.network.onOpen(user)
        })
    }

    disconnect(user: User, reason: any): void {
        const payload = typeof reason === 'string' ? reason : JSON.stringify(reason ?? 'closed')
        user.socket.close(1000, payload)
    }

    terminate(user: User, reason: any): void {
        user.socket.terminate()
    }

    send(user: User, buffer: Buffer): void {
        const socket = user.socket as WebSocket
        if (socket.readyState !== WebSocket.OPEN) {
            throw new Error('Cannot send a nengi snapshot on a closed ws WebSocket.')
        }
        if (socket.bufferedAmount + buffer.byteLength > this.maxBufferedBytes) {
            this.network.disconnectUser(user, 'WebSocket backpressure limit exceeded.', true)
            throw new Error(`ws WebSocket backpressure exceeded ${this.maxBufferedBytes} bytes.`)
        }
        socket.send(buffer, ALWAYS_BINARY, error => {
            if (error) {
                this.network.disconnectUser(user, error, true)
            }
        })
    }
}

export { WsInstanceAdapter, WsListenOptions, WsInstanceAdapterConfig }
