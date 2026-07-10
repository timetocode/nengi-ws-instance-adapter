# nengi-ws-instance-adapter

Node.js server adapter for nengi using the `ws` WebSocket implementation and
the `nengi-buffers` binary backend.

Keep the complete Nengi package family on one exact version:

```sh
npm install nengi@2.0.0-rc.125 \
    nengi-ws-instance-adapter@2.0.0-rc.125 \
    nengi-buffers@2.0.0-rc.125
```

```ts
import { Instance } from 'nengi'
import { WsInstanceAdapter } from 'nengi-ws-instance-adapter'

const instance = new Instance(context)
const adapter = new WsInstanceAdapter(instance.network)

adapter.listen({ port: 8079, host: '0.0.0.0' })
```

`listen` also accepts a port number. The adapter implements immediate socket
termination for Nengi handshake and Pong deadlines.

Import only from package roots. See the
[nengi manual](https://github.com/timetocode/nengi/tree/rc/2.0.0/docs/ai) for
connection lifecycle, timing, and deployment guidance.
