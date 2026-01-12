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

  // Generate a simple sessionId if none provided for testing
  const finalSessionId = sessionId || `user${Math.floor(Math.random() * 100) + 1}`;
  
  if (!sessionId) {
    console.log("No sessionId provided, generated:", finalSessionId);
  }
  
  console.log(`New connection: ${finalSessionId}`);

  // Store the WebSocket connection
  sessions.set(finalSessionId, ws);

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'session_info') {
        // Обработка информации о сессии от клиента
        console.log(`New session: ${message.sessionId} - My language: ${message.myLanguage}, Partner language: ${message.partnerLanguage}`);
        // Сохраняем информацию о сессии
        sessions.set(message.sessionId, {
          ws: ws,
          myLanguage: message.myLanguage,
          partnerLanguage: message.partnerLanguage
        });
      } else if (message.type === 'openai_auth') {
        // Mock OpenAI Realtime API for testing
        console.log("OpenAI auth requested, using mock API");
        // Send a mock response back to simulate successful auth
        ws.send(JSON.stringify({
          type: 'session.updated',
          session: {
            id: 'mock-session-id',
            model: 'gpt-4o-realtime-preview-2024-10-01',
            voice: 'alloy',
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            instructions: '',
            turn_detection: { type: 'server_vad' },
            tools: [],
            tool_choice: 'auto',
            temperature: 0.8,
          }
        }));
      } else {
        // Log all other incoming messages
        console.log("Received message from client:", message);
        
        // Mock responses for various OpenAI Realtime API events
        if (message.type === 'response.create') {
          // Mock a response from OpenAI
          ws.send(JSON.stringify({
            type: 'response.done',
            response: {
              id: 'mock-response-id',
              status: 'completed',
              status_details: null,
              output: [{
                id: 'mock-output-id',
                type: 'message',
                role: 'assistant',
                content: [{
                  type: 'text',
                  text: 'Mock response for testing purposes'
                }]
              }],
              usage: {
                total_tokens: 10,
                input_tokens: 5,
                output_tokens: 5
              }
            }
          }));
        } else if (message.type === 'conversation.item.created') {
          // Mock response for item creation
          ws.send(JSON.stringify({
            type: 'conversation.item.created',
            previous_item_id: null,
            item: {
              id: 'mock-item-id',
              type: 'message',
              role: 'assistant',
              content: [{
                type: 'text',
                text: 'Mock item created'
              }]
            }
          }));
        } else {
          // Echo back other messages for testing
          ws.send(JSON.stringify({
            type: 'mock_response',
            original_type: message.type,
            status: 'received'
          }));
        }
      }
    } catch (error) {
      console.error("Error processing message:", error);
      // Don't close connection on error, just log it
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`Client disconnected: ${finalSessionId}, code: ${code}, reason: ${reason}`);
    sessions.delete(finalSessionId);
  });

  ws.on('error', (error) => {
    console.error("WebSocket error:", error);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});