
import { Buffer } from 'buffer'

import {
    IServerNetworkAdapter,
    User,
    UserConnectionState,
    InstanceNetwork,
    Context
} from 'nengi'

import { BufferReader, BufferWriter } from 'nengi-buffers'

import { WebSocketServer } from 'ws'

const ALWAYS_BINARY = { binary: true }

class wsInstanceAdapter implements IServerNetworkAdapter {
    network: InstanceNetwork
    context: Context

    constructor(network: InstanceNetwork, config: any) {
        this.network = network
        this.context = this.network.instance.context
    }

    // consider a promise?
    listen(port: number, ready: () => void) {
        const wss = new WebSocketServer({ port })

        wss.on('connection', (ws, req) => {
            const user = new User(ws)
            user.socket = ws
            this.network.onOpen(user)

            // @ts-ignore
            user.remoteAddress = req.socket.remoteAddress
            if (req.headers['x-forwarded-for']) {
                // @ts-ignore
                user.remoteAddress = req.headers['x-forwarded-for'].split(',')[0].trim()
            }

            ws.on('message', (data) => {
                // @ts-ignore
                const binaryReader = new BufferReader(data)
                this.network.onMessage(user, binaryReader, BufferWriter)
            })

            ws.on('close', () => {
                this.network.onClose(user)
            })
        })

        // is it actually ready though? no time has gone by
        ready()
    }

    disconnect(user: User, reason: any): void {
        // TODO this doesn't send a reason hmm
        user.socket.terminate()
    }

    send(user: User, buffer: Buffer): void {
        user.socket.send(buffer, ALWAYS_BINARY)
    }
}

export { wsInstanceAdapter }
