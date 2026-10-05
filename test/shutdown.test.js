const { once } = require('node:events')
const { Context, Instance, Channel, NetworkEvent, UserConnectionState } = require('nengi')
const { WebSocket } = require('ws')
const { WsInstanceAdapter } = require('../build')

async function listen(adapter) {
    await new Promise(resolve => adapter.listen({ port: 0, host: '127.0.0.1' }, resolve))
    return adapter.server.address().port
}

async function connect(port) {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`)
    socket.on('error', () => {})
    await once(socket, 'open')
    return socket
}

it('closes its listener, pending sockets and accepted users without stopping another adapter', async () => {
    const instance = new Instance(new Context())
    const adapter = new WsInstanceAdapter(instance.adapterHost)
    const other = new WsInstanceAdapter(instance.adapterHost)
    const port = await listen(adapter)
    const otherPort = await listen(other)
    const sockets = []
    try {
        sockets.push(await connect(port), await connect(port), await connect(otherPort))
        const [accepted, pending, survivor] = [...instance.network.pendingUsers]
        instance.network.onConnectionAccepted(accepted, {})
        instance.network.onConnectionAccepted(survivor, {})
        const channel = new Channel(instance.localState)
        channel.subscribe(accepted)
        channel.subscribe(survivor)
        const closed = sockets.slice(0, 2).map(socket => once(socket, 'close'))
        const closing = adapter.shutdown('Maintenance')
        expect(adapter.shutdown()).toBe(closing)
        expect(accepted.connectionState).toBe(UserConnectionState.Closed)
        expect(pending.connectionState).toBe(UserConnectionState.Closed)
        expect(instance.network.pendingUsers.size).toBe(0)
        expect(instance.users.size).toBe(1)
        expect(accepted.subscriptions.size).toBe(0)
        expect(survivor.subscriptions.size).toBe(1)
        expect(() => adapter.listen(0)).toThrow(/shut down/)
        await closing
        await Promise.all(closed)
        const refused = new WebSocket(`ws://127.0.0.1:${port}`)
        const [error] = await once(refused, 'error')
        expect(error.code).toBe('ECONNREFUSED')
        const newConnection = await connect(otherPort)
        sockets.push(newConnection)
        const events = []
        while (!instance.queue.isEmpty()) events.push(instance.queue.next())
        expect(events.filter(event => event.type === NetworkEvent.UserDisconnected)).toHaveLength(1)
    } finally {
        await Promise.all([adapter.shutdown(), other.shutdown()])
        for (const socket of sockets) socket.terminate()
    }
})

it('supports terminal shutdown before listening', async () => {
    const adapter = new WsInstanceAdapter(new Instance(new Context()).adapterHost)
    const closing = adapter.shutdown()
    expect(adapter.shutdown()).toBe(closing)
    await closing
    expect(() => adapter.listen(0)).toThrow(/shut down/)
})
