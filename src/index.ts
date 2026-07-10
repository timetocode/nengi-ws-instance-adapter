
import { Buffer } from 'buffer'

import {
    User
} from 'nengi'
import type { BinaryAdapter, IServerNetworkAdapter, InstanceNetwork } from 'nengi'

import { bufferBinary } from 'nengi-buffers'

import { WebSocketServer } from 'ws'
import type { RawData } from 'ws'

const ALWAYS_BINARY = { binary: true }

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

    constructor(network: InstanceNetwork, config: any = {}) {
        this.network = network
        this.binary = config.binary ?? bufferBinary
    }

    listen(options: WsListenOptions, ready?: () => void) {
        const listenOptions = typeof options === 'number' ? { port: options } : options
        const wss = new WebSocketServer(listenOptions, ready)
        this.server = wss

        wss.on('connection', (ws, req) => {
            const user = new User(ws, this)
            this.network.onOpen(user)

            user.remoteAddress = req.socket.remoteAddress ?? null
            if (req.headers['x-forwarded-for']) {
                const forwardedFor = Array.isArray(req.headers['x-forwarded-for'])
                    ? req.headers['x-forwarded-for'][0]
                    : req.headers['x-forwarded-for']
                user.remoteAddress = forwardedFor.split(',')[0].trim()
            }

            ws.on('message', (data) => {
                this.network.onMessage(user, toBuffer(data))
            })

            ws.on('close', () => {
                this.network.onClose(user)
            })
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
        user.socket.send(buffer, ALWAYS_BINARY)
    }
}

export { WsInstanceAdapter, WsListenOptions }
