"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wsInstanceAdapter = void 0;
const nengi_1 = require("nengi");
const nengi_buffers_1 = require("nengi-buffers");
const ws_1 = require("ws");
const ALWAYS_BINARY = { binary: true };
class wsInstanceAdapter {
    constructor(network, config) {
        this.network = network;
        this.context = this.network.instance.context;
    }
    // consider a promise?
    listen(port, ready) {
        const wss = new ws_1.WebSocketServer({ port });
        wss.on('connection', (ws, req) => {
            const user = new nengi_1.User(ws);
            user.socket = ws;
            this.network.onOpen(user);
            // @ts-ignore
            user.remoteAddress = req.socket.remoteAddress;
            if (req.headers['x-forwarded-for']) {
                // @ts-ignore
                user.remoteAddress = req.headers['x-forwarded-for'].split(',')[0].trim();
            }
            ws.on('message', (data) => {
                // @ts-ignore
                const binaryReader = new nengi_buffers_1.BufferReader(data);
                this.network.onMessage(user, binaryReader, nengi_buffers_1.BufferWriter);
            });
            ws.on('close', () => {
                this.network.onClose(user);
            });
        });
        // is it actually ready though? no time has gone by
        ready();
    }
    disconnect(user, reason) {
        // TODO this doesn't send a reason hmm
        user.socket.terminate();
    }
    send(user, buffer) {
        user.socket.send(buffer, ALWAYS_BINARY);
    }
}
exports.wsInstanceAdapter = wsInstanceAdapter;
