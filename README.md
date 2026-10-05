# nengi-ws-instance-adapter

Node.js server adapter for nengi using the `ws` WebSocket implementation and
the `nengi-buffers` binary backend.

This package is independently versioned. Its `peerDependencies.nengi` declares
compatible core releases. The rc.128 contract baseline installs as:

```sh
npm install nengi@2.0.0-rc.128 \
    nengi-ws-instance-adapter@2.0.0-rc.128 \
    nengi-buffers@2.0.0-rc.128
```

```ts
import { Instance } from 'nengi'
import { WsInstanceAdapter } from 'nengi-ws-instance-adapter'

const instance = new Instance(context)
instance.onConnect = async () => true // Local demo; substitute the game's admission policy.
const adapter = new WsInstanceAdapter(instance.adapterHost)

adapter.listen({ port: 8079, host: '0.0.0.0' })
```

`listen` also accepts a port number. The adapter implements immediate socket
termination for Nengi handshake and Pong deadlines.

Configure transport budgets in the constructor:

```ts
const adapter = new WsInstanceAdapter(instance.adapterHost, {
    maxPayloadLength: instance.limits.maxPacketBytes,
    maxBufferedBytes: 4 * 1024 * 1024
})
```

These are the defaults (64 KiB incoming unless core configuration overrides it).
`maxPayloadLength` is enforced by ws while receiving
messages, including fragmented messages. Before sending, the adapter rejects
queued bytes plus the next payload above `maxBufferedBytes` and terminates the
connection. This also limits a single outgoing payload; raise it deliberately
if initial snapshots need more room. These budgets do not measure total process
memory or kernel socket buffers. Compression is disabled.

Socket errors and asynchronous write failures close the nengi user and terminate
the socket. A successful send means the transport accepted the data; it is not
an application acknowledgment.

`user.remoteAddress` defaults to the direct socket peer. To honor
`X-Forwarded-For`, supply `trustProxy: peerAddress => boolean` for known direct
proxy addresses. A trusted proxy must overwrite/sanitize that header, since the
adapter uses its first address. Do not return true for arbitrary peers. Without
this option, forwarding headers are ignored.

RC-127 migration: the incoming limit was previously the ws default of 100 MiB,
outgoing buffering had no adapter budget, and forwarding headers were trusted
unconditionally. Configure larger budgets or trusted proxies where required.

These snippets show transport setup. The complete browser/Node starter and
connection policy are documented in the installed core package at
`node_modules/nengi/docs/ai/getting-started.md`. An Instance without `onConnect`
denies connections.

Import only from package roots. See the
[nengi manual](https://github.com/timetocode/nengi/tree/rc/2.0.0/docs/ai) for
connection lifecycle, timing, and deployment guidance.

Core connection, traffic and queue budgets also apply. Native receive limits
default to `instance.limits.maxPacketBytes`; an explicit adapter override does
not bypass the core limit. See the manual
[network limits](https://github.com/timetocode/nengi/blob/rc/2.0.0/docs/ai/network-limits.md)
for defaults and migration guidance.

WebSocket text data is rejected. Incoming native Ping/Pong callbacks share the
core packet/byte traffic budget; they do not count as nengi clock replies or
refresh its liveness deadline.

## Server shutdown

`await adapter.shutdown(reason?)` stops admissions, immediately cleans up this
adapter's pending handshakes and connected users, and closes its owned listener.
Repeated calls return the same Promise. Shutdown is terminal; construct a new
adapter to listen again. Other adapters on the Instance remain active. Game code
still stops its timers, processes disconnect events and saves game state. Final
queued message delivery is not guaranteed. See the nengi package's
`docs/ai/adapters.md` for the common contract and custom-server ownership.
