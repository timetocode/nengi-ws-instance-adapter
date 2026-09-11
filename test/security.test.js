const { execFileSync } = require('node:child_process')
const { once } = require('node:events')
const path = require('node:path')
const { Instance, Context, User, UserConnectionState, Channel } = require('nengi')
const { WebSocket } = require('ws')
const { WsInstanceAdapter } = require('../build')

function fixture(config = {}) {
    const instance = new Instance(new Context())
    const adapter = new WsInstanceAdapter(instance.network, config)
    return { instance, adapter }
}

it.each(['invalid-opcode', 'oversize'])('contains a native %s frame and preserves a healthy connection', mode => {
    expect(execFileSync(process.execPath, [path.join(__dirname, 'frame-child.cjs'), mode], { encoding: 'utf8' }))
        .toContain('healthy command and snapshot succeeded')
})

it.each([
    ['default', undefined, '127.0.0.1'],
    ['untrusted peer', () => false, '127.0.0.1'],
    ['trusted proxy', peer => peer === '127.0.0.1', '203.0.113.7']
])('uses the correct remote address for %s', async (_name, trustProxy, address) => {
    const { instance, adapter } = fixture({ trustProxy })
    await new Promise(resolve => adapter.listen({ port: 0, host: '127.0.0.1' }, resolve))
    const client = new WebSocket(`ws://127.0.0.1:${adapter.server.address().port}`, {
        headers: { 'X-Forwarded-For': '203.0.113.7, 192.0.2.8' }
    })
    try {
        await once(client, 'open')
        expect([...instance.network.pendingUsers][0].remoteAddress).toBe(address)
    } finally {
        const closed = once(client, 'close')
        client.terminate()
        await closed
        await new Promise(resolve => adapter.server.close(resolve))
    }
})

it('rejects a send that would exceed the buffer budget and cleans up immediately', () => {
    const { instance, adapter } = fixture({ maxBufferedBytes: 8 })
    const socket = { readyState: 1, bufferedAmount: 4, send: jest.fn(), terminate: jest.fn() }
    const user = new User(socket, adapter)
    user.instance = instance
    instance.network.onConnectionAccepted(user, {})
    const channel = new Channel(instance.localState)
    channel.subscribe(user)
    expect(() => adapter.send(user, Buffer.alloc(5))).toThrow(/backpressure/)
    expect(socket.send).not.toHaveBeenCalled()
    expect(socket.terminate).toHaveBeenCalledTimes(1)
    expect(user.connectionState).toBe(UserConnectionState.Closed)
    expect(instance.users.size).toBe(0)
    expect(user.subscriptions.size).toBe(0)
})

it('accepts the exact budget and handles an asynchronous send failure', () => {
    const { instance, adapter } = fixture({ maxBufferedBytes: 8 })
    let complete
    const socket = { readyState: 1, bufferedAmount: 4, send: jest.fn((_data, _options, callback) => { complete = callback }), terminate: jest.fn() }
    const user = new User(socket, adapter)
    user.instance = instance
    instance.network.onConnectionAccepted(user, {})
    adapter.send(user, Buffer.alloc(4))
    complete()
    expect(instance.users.size).toBe(1)
    adapter.send(user, Buffer.alloc(4))
    complete(new Error('late write failure'))
    expect(instance.users.size).toBe(0)
    expect(socket.terminate).toHaveBeenCalledTimes(1)
})

it('rejects a closed socket before ws can silently discard the send', () => {
    const { adapter } = fixture()
    const socket = { readyState: 3, send: jest.fn() }
    expect(() => adapter.send(new User(socket, adapter), Buffer.alloc(1))).toThrow(/closed/)
    expect(socket.send).not.toHaveBeenCalled()
})

it.each([0, -1, NaN, Infinity, 1.5])('rejects invalid byte limits: %s', value => {
    expect(() => fixture({ maxPayloadLength: value })).toThrow()
    expect(() => fixture({ maxBufferedBytes: value })).toThrow()
})

it.each(['text', 'ping', 'pong'])('contains native %s traffic outside the binary decoder', async mode => {
    const instance = new Instance(new Context(), { now: () => 100, limits: { packetBurst: 2, packetsPerSecond: 1 } })
    const adapter = new WsInstanceAdapter(instance.network)
    const failures = []
    instance.onInboundMessageError = event => failures.push(event.error.message)
    const limits = []
    instance.onNetworkLimit = event => limits.push(event.limit)
    await new Promise(resolve => adapter.listen({ port: 0, host: '127.0.0.1' }, resolve))
    const client = new WebSocket(`ws://127.0.0.1:${adapter.server.address().port}`)
    client.on('error', () => {})
    try {
        await once(client, 'open')
        const closed = once(client, 'close')
        if (mode === 'text') client.send('not binary')
        else for (let i = 0; i < 3; i++) client[mode]('x')
        await closed
        expect(instance.network.pendingUsers.size).toBe(0)
        if (mode === 'text') expect(failures[0]).toMatch(/binary/)
        else expect(limits).toEqual(['packetBurst'])
    } finally {
        if (client.readyState !== WebSocket.CLOSED) {
            const closed = once(client, 'close')
            client.terminate()
            await closed
        }
        await new Promise(resolve => adapter.server.close(resolve))
    }
})
