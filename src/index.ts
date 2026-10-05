
import { Buffer } from 'buffer'

import type { BinaryAdapter, IServerNetworkAdapter, ServerAdapterHost, ServerConnection } from 'nengi'

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
    network: ServerAdapterHost
    binary: BinaryAdapter<Buffer>
    server: WebSocketServer | null = null
    private config: WsInstanceAdapterConfig
    private maxPayloadLength: number
    private maxBufferedBytes: number
    private shutdownPromise?: Promise<void>

    readonly serverAdapterVersion = 1 as const

    constructor(network: ServerAdapterHost, config: WsInstanceAdapterConfig = {}) {
        if (network?.serverAdapterVersion !== this.serverAdapterVersion) {
            throw new Error('This adapter requires nengi server adapter contract version 1. Pass instance.adapterHost from a compatible core.')
        }
        this.network = network
        this.binary = config.binary ?? bufferBinary
        this.config = config
        this.maxPayloadLength = config.maxPayloadLength ?? network.limits.maxPacketBytes
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
        if (this.shutdownPromise) throw new Error('WsInstanceAdapter has shut down. Create a new adapter to listen again.')
        if (this.server) throw new Error('WsInstanceAdapter is already listening.')
        const listenOptions = typeof options === 'number' ? { port: options } : options
        const wss = new WebSocketServer({
            ...listenOptions,
            maxPayload: this.maxPayloadLength,
            perMessageDeflate: false
        }, ready)
        this.server = wss

        wss.on('connection', (ws, req) => {
            const user = this.network.createConnection(ws, this)
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
                if (user.isClosed) return
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

    shutdown(reason?: any): Promise<void> {
        if (this.shutdownPromise) return this.shutdownPromise
        let finish!: () => void
        let fail!: (error: unknown) => void
        this.shutdownPromise = new Promise<void>((resolve, reject) => {
            finish = resolve
            fail = reject
        })
        const server = this.server
        this.server = null
        try {
            // Core immediately refuses admissions and owns both accepted users
            // and pending asynchronous handshakes.
            this.network.shutdownAdapter(this, reason)
            if (server) server.close(error => error ? fail(error) : finish())
            for (const socket of server?.clients ?? []) socket.terminate()
            if (!server) finish()
        } catch (error) {
            fail(error)
        }
        return this.shutdownPromise
    }

    disconnect(user: ServerConnection<WebSocket>, reason: any): void {
        const payload = typeof reason === 'string' ? reason : JSON.stringify(reason ?? 'closed')
        user.socket.close(1000, payload)
    }

    terminate(user: ServerConnection<WebSocket>, reason: any): void {
        user.socket.terminate()
    }

    send(user: ServerConnection<WebSocket>, buffer: Buffer): void {
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
