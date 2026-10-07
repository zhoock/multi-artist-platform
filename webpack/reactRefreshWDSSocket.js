/**
 * React Refresh overlay socket — WebSocket-only (matches devServer webSocketTransport: 'ws').
 * Replaces @pmmmwh/react-refresh-webpack-plugin/sockets/WDSSocket.js which always
 * require()s SockJSClient and triggers Permissions-Policy `unload` violations in Chrome.
 */

function initWDSSocket(messageHandler) {
  const { default: WebSocketClient } = require('webpack-dev-server/client/clients/WebSocketClient');
  const { client } = require('webpack-dev-server/client/socket');

  if (!(client instanceof WebSocketClient)) {
    throw new Error(
      'React Refresh overlay expects webpack-dev-server WebSocketClient. ' +
        'Set devServer.client.webSocketTransport and webSocketServer to "ws".'
    );
  }

  const connection = client.client;
  connection.addEventListener('message', function onSocketMessage(message) {
    messageHandler(JSON.parse(message.data));
  });
}

module.exports = { init: initWDSSocket };
