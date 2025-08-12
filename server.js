const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const WebSocket = require('ws');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = process.env.PORT || 3000;
const wsPort = 3001; // Separate port for WebSocket server

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  // Next.js server (separate from WebSocket server)
  const nodeServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  nodeServer.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Next.js Ready on http://${hostname}:${port}`);
  });

  // Separate WebSocket server
  const wsServer = createServer();
  const wss = new WebSocket.Server({ server: wsServer });
  const clients = new Map(); // Map to store client connections with usernames

  wss.on('connection', (ws) => {
    console.log('Client connected:', ws._socket.remoteAddress);

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        const timestamp = new Date().toISOString();
        
        switch (message.type) {
          case 'join':
            clients.set(ws, message.username);
            // Broadcast user joined to all other clients
            wss.clients.forEach((client) => {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'userJoined',
                  id: Date.now() + Math.random(),
                  username: message.username,
                  message: `${message.username} has joined the chat`,
                  timestamp: timestamp
                }));
              }
            });
            console.log(`${message.username} joined the chat`);
            break;
            
          case 'message':
            const username = clients.get(ws) || 'Anonymous';
            const messageData = {
              type: 'message',
              id: Date.now(),
              username,
              message: message.message,
              timestamp: timestamp,
            };
            
            // Broadcast message to all clients
            wss.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(messageData));
              }
            });
            console.log(`${username}: ${message.message}`);
            break;
        }
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    });

    ws.on('close', () => {
      const username = clients.get(ws) || 'Anonymous';
      clients.delete(ws);
      
      // Broadcast user left to all other clients
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'userLeft',
            id: Date.now() + Math.random(),
            username: username,
            message: `${username} has left the chat`,
            timestamp: new Date().toISOString()
          }));
        }
      });
      console.log(`${username} disconnected`);
    });
  });

  wsServer.listen(wsPort, (err) => {
    if (err) throw err;
    console.log(`> WebSocket Server Ready on ws://${hostname}:${wsPort}`);
  });
}); 