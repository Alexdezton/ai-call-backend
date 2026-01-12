import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import http from 'http';
import { URL } from 'url';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Store active sessions
const sessions = new Map();

wss.on('connection', (ws, req) => {
  console.log("client connected");

  // Parse session ID from query parameter
  const parsedUrl = new URL(`http://localhost${req.url}`);
  const sessionId = parsedUrl.searchParams.get('sessionId');

  if (!sessionId) {
    console.log("Connection rejected: no sessionId provided");
    ws.close(4001, "sessionId is required");
    return;
  }

  // Store the WebSocket connection
  sessions.set(sessionId, ws);

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'openai_auth') {
        // Handle authentication to OpenAI Realtime API
        const openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'OpenAI-Beta': 'realtime=v1'
          }
        });

        openAiWs.on('open', () => {
          console.log("Connected to OpenAI Realtime API");
          // Forward initial session configuration
          if (message.sessionConfig) {
            openAiWs.send(JSON.stringify(message.sessionConfig));
          }
        });

        openAiWs.on('message', (openAiData) => {
          // Forward messages from OpenAI back to the client
          ws.send(openAiData);
        });

        openAiWs.on('close', (code, reason) => {
          console.log(`OpenAI WebSocket closed: ${code} ${reason}`);
          // Forward close event to client
          ws.close(code, reason);
        });

        openAiWs.on('error', (error) => {
          console.error("OpenAI WebSocket error:", error);
          ws.close(4002, "OpenAI connection error");
        });

        // Forward incoming messages from client to OpenAI
        ws.on('message', (clientData) => {
          if (openAiWs.readyState === WebSocket.OPEN) {
            openAiWs.send(clientData);
          }
        });

      } else {
        // If we're not in auth phase, this might be a message for OpenAI
        // In a full implementation, we'd forward to OpenAI WebSocket
        console.log("Received message from client:", message);
      }
    } catch (error) {
      console.error("Error processing message:", error);
      ws.close(4000, "Invalid message format");
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`client disconnected: ${code} ${reason}`);
    sessions.delete(sessionId);
  });

  ws.on('error', (error) => {
    console.error("WebSocket error:", error);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});