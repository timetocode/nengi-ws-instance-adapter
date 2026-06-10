"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WsInstanceAdapter = void 0;
const buffer_1 = require("buffer");
const nengi_1 = require("nengi");
const nengi_buffers_1 = require("nengi-buffers");
const ws_1 = require("ws");
const ALWAYS_BINARY = { binary: true };
function toBuffer(data) {
    if (buffer_1.Buffer.isBuffer(data)) {
        return data;
    }
    if (Array.isArray(data)) {
        return buffer_1.Buffer.concat(data);
    }
    if (data instanceof ArrayBuffer) {
        return buffer_1.Buffer.from(data);
    }
    const view = data;
    return buffer_1.Buffer.from(view.buffer, view.byteOffset, view.byteLength);
}
class WsInstanceAdapter {
    constructor(network, config = {}) {
        var _a;
        this.server = null;
        this.network = network;
        this.binary = (_a = config.binary) !== null && _a !== void 0 ? _a : nengi_buffers_1.bufferBinary;
    }
    listen(options, ready) {
        const listenOptions = typeof options === 'number' ? { port: options } : options;
        const wss = new ws_1.WebSocketServer(listenOptions, ready);
        this.server = wss;
        wss.on('connection', (ws, req) => {
            var _a;
            const user = new nengi_1.User(ws, this);
            this.network.onOpen(user);
            user.remoteAddress = (_a = req.socket.remoteAddress) !== null && _a !== void 0 ? _a : null;
            if (req.headers['x-forwarded-for']) {
                const forwardedFor = Array.isArray(req.headers['x-forwarded-for'])
                    ? req.headers['x-forwarded-for'][0]
                    : req.headers['x-forwarded-for'];
                user.remoteAddress = forwardedFor.split(',')[0].trim();
            }
            ws.on('message', (data) => {
                this.network.onMessage(user, toBuffer(data));
            });
            ws.on('close', () => {
                this.network.onClose(user);
            });
        });
    }
    disconnect(user, reason) {
        const payload = typeof reason === 'string' ? reason : JSON.stringify(reason !== null && reason !== void 0 ? reason : 'closed');
        user.socket.close(1000, payload);
    }
    send(user, buffer) {
        user.socket.send(buffer, ALWAYS_BINARY);
    }
}
exports.WsInstanceAdapter = WsInstanceAdapter;
