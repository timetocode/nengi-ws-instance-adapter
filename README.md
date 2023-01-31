# nengi-ws-instance-adapter
nengi instance adapter for ws [https://github.com/websockets/ws](https://github.com/websockets/ws) and node.js buffers

this adapter allows creating a nengi instance in node.js (or any environment with Buffers) that listens for connections using ws

useful if you want to run a nengi instance but do not have the option to use [https://github.com/timetocode/nengi-uws-instance-adapter](https://github.com/timetocode/nengi-uws-instance-adapter) which requires a compiler and binaries

may allow running nengi instances from electron.js (maybe? probably?)