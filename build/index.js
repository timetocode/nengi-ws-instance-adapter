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
        var _a, _b, _c;
        this.server = null;
        this.network = network;
        this.binary = (_a = config.binary) !== null && _a !== void 0 ? _a : nengi_buffers_1.bufferBinary;
        this.config = config;
        this.maxPayloadLength = (_b = config.maxPayloadLength) !== null && _b !== void 0 ? _b : network.instance.limits.maxPacketBytes;
        this.maxBufferedBytes = (_c = config.maxBufferedBytes) !== null && _c !== void 0 ? _c : 4 * 1024 * 1024;
        for (const [name, value] of Object.entries({
            maxPayloadLength: this.maxPayloadLength,
            maxBufferedBytes: this.maxBufferedBytes
        })) {
            if (!Number.isSafeInteger(value) || value <= 0) {
                throw new Error(`${name} must be a positive safe integer.`);
            }
        }
    }
    listen(options, ready) {
        const listenOptions = typeof options === 'number' ? { port: options } : options;
        const wss = new ws_1.WebSocketServer(Object.assign(Object.assign({}, listenOptions), { maxPayload: this.maxPayloadLength, perMessageDeflate: false }), ready);
        this.server = wss;
        wss.on('connection', (ws, req) => {
            var _a, _b, _c;
            const user = new nengi_1.User(ws, this);
            user.remoteAddress = (_a = req.socket.remoteAddress) !== null && _a !== void 0 ? _a : null;
            if (user.remoteAddress && ((_c = (_b = this.config).trustProxy) === null || _c === void 0 ? void 0 : _c.call(_b, user.remoteAddress)) && req.headers['x-forwarded-for']) {
                const forwardedFor = Array.isArray(req.headers['x-forwarded-for'])
                    ? req.headers['x-forwarded-for'][0]
                    : req.headers['x-forwarded-for'];
                user.remoteAddress = forwardedFor.split(',')[0].trim() || user.remoteAddress;
            }
            ws.on('error', error => {
                this.network.disconnectUser(user, error, true);
            });
            ws.on('message', (data, isBinary) => {
                if (user.connectionState === nengi_1.UserConnectionState.Closed)
                    return;
                const payload = toBuffer(data);
                if (!isBinary) {
                    this.network.notifyInboundMessageError(user, payload, new Error('Nengi requires binary WebSocket messages.'));
                    this.network.disconnectUser(user, { reason: 'text_frame' }, true);
                    return;
                }
                this.network.onMessage(user, payload);
            });
            ws.on('ping', data => { this.network.onTransportControl(user, data.byteLength); });
            ws.on('pong', data => { this.network.onTransportControl(user, data.byteLength); });
            ws.on('close', () => {
                this.network.onClose(user);
            });
            this.network.onOpen(user);
        });
    }
    disconnect(user, reason) {
        const payload = typeof reason === 'string' ? reason : JSON.stringify(reason !== null && reason !== void 0 ? reason : 'closed');
        user.socket.close(1000, payload);
    }
    terminate(user, reason) {
        user.socket.terminate();
    }
    send(user, buffer) {
        const socket = user.socket;
        if (socket.readyState !== ws_1.WebSocket.OPEN) {
            throw new Error('Cannot send a nengi snapshot on a closed ws WebSocket.');
        }
        if (socket.bufferedAmount + buffer.byteLength > this.maxBufferedBytes) {
            this.network.disconnectUser(user, 'WebSocket backpressure limit exceeded.', true);
            throw new Error(`ws WebSocket backpressure exceeded ${this.maxBufferedBytes} bytes.`);
        }
        socket.send(buffer, ALWAYS_BINARY, error => {
            if (error) {
                this.network.disconnectUser(user, error, true);
            }
        });
    }
}
exports.WsInstanceAdapter = WsInstanceAdapter;
