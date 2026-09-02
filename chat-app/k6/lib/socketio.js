import ws from 'k6/ws';

/**
 * Minimal Socket.IO v4 (engine.io v4) client built on k6's raw WebSocket API.
 *
 * Connects using the websocket-only transport (no polling upgrade needed),
 * completes the namespace handshake, answers engine.io pings automatically,
 * and surfaces application-level events to the caller.
 *
 * Frame cheat-sheet (engine.io v4 / Socket.IO v4):
 *   '0{json}'  open            → we answer '40' (connect to default namespace)
 *   '40{json}' namespace ack   → caller's onConnected() fires
 *   '2'        server PING     → we answer '3' (PONG)
 *   '42[...]'  application event → parsed and handed to onEvent(name, payload)
 */
export function socketIoConnect(url, handlers = {}) {
  const {
    timeoutMs = 30000,
    onConnected = () => {},
    onEvent = () => {},
    onPing = () => {}
  } = handlers;

  ws.connect(url, {}, function (socket) {
    const emit = (event, data) => socket.send(`42${JSON.stringify([event, data])}`);

    socket.on('open', () => {});

    socket.on('message', (raw) => {
      if (raw === '2') {
        socket.send('3'); // PONG
        onPing();
        return;
      }
      if (typeof raw !== 'string' || raw.length === 0) return;

      if (raw.charAt(0) === '0') {
        socket.send('40');
        return;
      }
      if (raw.startsWith('40')) {
        onConnected(emit, socket);
        return;
      }
      if (raw.startsWith('42')) {
        try {
          const [event, payload] = JSON.parse(raw.substring(2));
          onEvent(event, payload);
        } catch (_) {
          /* ignore malformed frames */
        }
      }
    });

    socket.setTimeout(() => socket.close(), timeoutMs);
  });
}