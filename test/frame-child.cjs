// A separate process makes an unhandled ws error an observable test failure.
const assert = require('node:assert/strict')
const { once } = require('node:events')
const { Instance, Context, Binary, BinarySection, defineMessageSchema, NetworkEvent } = require('nengi')
const { WebSocket } = require('ws')
const { WsInstanceAdapter } = require('../build')

async function run() {
    const context = new Context()
    context.register(1, defineMessageSchema({ value: Binary.UInt8 }))
    const instance = new Instance(context, { limits: { maxPacketBytes: 32 } })
    let coreLimitEvents = 0
    instance.onNetworkLimit = () => coreLimitEvents++
    const adapter = new WsInstanceAdapter(instance.network)
    // Isolate transport handling from authentication in this fixture.
    const open = instance.network.onOpen.bind(instance.network)
    instance.network.onOpen = user => {
        open(user)
        user.instance = instance
        instance.network.onConnectionAccepted(user, {})
    }
    await new Promise(resolve => adapter.listen({ port: 0, host: '127.0.0.1' }, resolve))
    const url = `ws://127.0.0.1:${adapter.server.address().port}`
    const bad = new WebSocket(url)
    bad.on('error', () => {})
    await once(bad, 'open')
    const healthy = new WebSocket(url)
    healthy.on('error', () => {})
    await once(healthy, 'open')
    const closed = once(bad, 'close')
    if (process.argv[2] === 'oversize') {
        // Each fragment is below the limit; the assembled message exceeds it.
        bad.send(Buffer.alloc(20), { fin: false })
        bad.send(Buffer.alloc(20), { fin: true })
    } else {
        bad._socket.write(Buffer.from([0x83, 0x80, 0, 0, 0, 0]))
    }
    await closed
    // The inherited native cap must reject the message before core decoding.
    assert.equal(coreLimitEvents, 0)
    assert.equal(instance.users.size, 1)
    healthy.send(Buffer.from([BinarySection.Commands, 1, 1, 42]))
    const deadline = Date.now() + 1000
    let delivered = false
    while (Date.now() < deadline && !delivered) {
        await new Promise(resolve => setTimeout(resolve, 5))
        while (!instance.queue.isEmpty()) {
            const event = instance.queue.next()
            if (event.type === NetworkEvent.CommandSet) {
                assert.equal(event.commands[0].value, 42)
                delivered = true
            }
        }
    }
    assert.equal(delivered, true)
    instance.step()
    assert.equal(instance.users.size, 1)
    const healthyClosed = once(healthy, 'close')
    healthy.terminate()
    await healthyClosed
    await new Promise(resolve => adapter.server.close(resolve))
    console.log('contained; healthy command and snapshot succeeded')
}
setTimeout(() => process.exit(2), 3000).unref()
run().catch(error => { console.error(error); process.exit(1) })
