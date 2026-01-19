import { WebSocket, WebSocketServer } from 'ws';
import http from 'http';
import { URL } from 'url';

// Configure server to listen on the port specified by Render environment or default to 3000
const server = http.createServer((req, res) => {
  // Basic health check endpoint for Render to detect that the app is running
  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', message: 'WebSocket server is running' }));
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});
const wss = new WebSocketServer({
  server,
  // Enable necessary options for production
  verifyClient: (info) => {
    // Allow connections from any origin during development
    // In production, you'd want to restrict this to your frontend domain
    console.log('WebSocket connection request from:', info.origin, info.req.url);
    return true;
  }
});

// Store rooms for calls
const rooms = new Map();

// Store user connections separately from rooms
const userConnections = new Map();

wss.on('connection', (ws, req) => {
  console.log("client connected");

  // Parse user ID and room ID from query parameters
  const parsedUrl = new URL(`http://localhost${req.url}`);
  const userId = parsedUrl.searchParams.get('userId');
  const roomId = parsedUrl.searchParams.get('roomId');

  // Both userId and roomId are required
  if (!userId || !roomId) {
    console.log("Connection rejected: userId and roomId are required");
    ws.close(4001, "userId and roomId are required");
    return;
  }

  console.log(`New connection: ${userId} in room ${roomId}`);

  // Check if user already has an active connection
  if (userConnections.has(userId)) {
    // Close the old connection
    const oldWs = userConnections.get(userId);
    if (oldWs && oldWs.readyState === WebSocket.OPEN) {
      oldWs.close(4005, "User reconnected from another device");
    } else if (oldWs && oldWs.readyState === WebSocket.CONNECTING) {
      // If connection is still establishing, close it too
      oldWs.close(4005, "User reconnected from another device");
    }
    console.log(`Closed old connection for user: ${userId}`);
  }

  // Check if room exists
  let room = rooms.get(roomId);
  
  if (!room) {
    // Create new room with first user
    room = {
      users: new Map(),
      createdAt: Date.now()
    };
    room.users.set(userId, ws);
    rooms.set(roomId, room);
    console.log(`Created new room: ${roomId} with user: ${userId}`);
    
    // Notify user they are waiting for a partner
    ws.send(JSON.stringify({
      type: 'waiting_for_partner',
      userId: userId,
      roomId: roomId
    }));
  } else {
    // Room exists, check if there's space
    const existingUserIds = Array.from(room.users.keys());
    
    if (existingUserIds.length >= 2) {
      // Check if the connecting user is already in the room (reconnection scenario)
      if (existingUserIds.includes(userId)) {
        // This is a reconnection - replace the old connection with the new one
        const oldWs = room.users.get(userId);
        if (oldWs && oldWs !== ws) {
          // Close the old connection
          oldWs.close(4005, "User reconnected from another device");
          console.log(`Replaced old connection for user ${userId} in room ${roomId}`);
        }
        
        // Update the connection in the room
        room.users.set(userId, ws);
      } else {
        // Room is full with different users
        console.log(`Room ${roomId} is full, rejecting connection for ${userId}`);
        ws.close(4003, "Room full");
        // Clean up user connection from map
        userConnections.delete(userId);
        return;
      }
    } else {
      // There's space in the room - check if user is reconnecting
      if (existingUserIds.includes(userId)) {
        // User is reconnecting - replace the old connection
        const oldWs = room.users.get(userId);
        if (oldWs && oldWs !== ws) {
          oldWs.close(4005, "User reconnected from another device");
          console.log(`Replaced old connection for user ${userId} in room ${roomId}`);
        }
        
        // Update the connection in the room
        room.users.set(userId, ws);
      } else {
        // Add second user to room
        room.users.set(userId, ws);
        console.log(`Added user ${userId} to existing room: ${roomId}`);
        
        // Get the other user in the room (after adding current user)
        const allUserIds = Array.from(room.users.keys());
        const otherUser = allUserIds.find(u => u !== userId);
        
        // Notify both users that they are connected
        const otherWs = room.users.get(otherUser);
        if (otherWs && otherWs.readyState === WebSocket.OPEN) {
          otherWs.send(JSON.stringify({
            type: 'partner_found',
            userId: otherUser,
            partnerId: userId,
            roomId: roomId
          }));
        }

        ws.send(JSON.stringify({
          type: 'partner_found',
          userId: userId,
          partnerId: otherUser,
          roomId: roomId
        }));

        console.log(`Users paired in room ${roomId}: ${otherUser} and ${userId}`);
      }
    }
  }
  
  // Store references to userId and roomId for later use
  ws.userId = userId;
  ws.roomId = roomId;

  // Update user connection mapping
  userConnections.set(userId, ws);

  ws.on('message', (data) => {
    try {
      // Check if the received data is string (JSON) or binary (audio/data)
      if (typeof data === 'string') {
        const message = JSON.parse(data);
        
        // Log the message
        console.log(`Received message from ${userId} in room ${roomId}:`, message);
        
        // Validate message structure
        if (typeof message !== 'object' || message === null) {
          console.log(`Invalid message format from ${userId}:`, message);
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'warning',
              message: 'Invalid message format'
            }));
          }
          return;
        }
        
        // Check if message is a WebRTC message
        if (message.type === 'offer' || message.type === 'answer' || message.type === 'ice_candidate') {
          // Additional validation for WebRTC messages
          if (message.type === 'offer' && !message.sdp) {
            console.log(`Invalid offer message from ${userId}: missing SDP`, message);
            return;
          }
          
          if (message.type === 'answer' && !message.sdp) {
            console.log(`Invalid answer message from ${userId}: missing SDP`, message);
            return;
          }
          
          if (message.type === 'ice_candidate' && !message.candidate) {
            console.log(`Invalid ice_candidate message from ${userId}: missing candidate`, message);
            return;
          }
          
          const room = rooms.get(roomId);
          if (room) {
            // Find the other user in the room
            const otherUser = Array.from(room.users.keys()).find(u => u !== userId);
            if (otherUser) {
              // Forward the message to the other user
              const recipientWs = room.users.get(otherUser);
              if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
                recipientWs.send(JSON.stringify(message));
                console.log(`Forwarded ${message.type} from ${userId} to ${otherUser} in room ${roomId}`);
              } else {
                console.log(`Recipient ${otherUser} not available or not connected`);
              }
            } else {
              console.log(`No other user found in room ${roomId} for forwarding ${message.type}`);
            }
          } else {
            console.log(`Room ${roomId} not found for forwarding ${message.type}`);
          }
        } else if (message.type === 'ping') {
          // Respond with pong with the same timestamp for latency measurement
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'pong',
              timestamp: message.timestamp
            }));
          }
        } else if (message.type === 'user_info') {
          // Handle user info message
          console.log(`Received user info from ${userId}:`, {
            myLanguage: message.myLanguage,
            partnerLanguage: message.partnerLanguage
          });
        } else {
          // Handle other message types if needed
          console.log(`Received non-WebRTC message from ${userId}:`, message);
        }
      } else {
        // This is binary data (e.g. audio), log as service message
        console.log(`Received binary data from ${userId} in room ${roomId}, size: ${data.length} bytes`);
      }
    } catch (error) {
      console.error("Invalid JSON received:", error.message);
      // Don't close connection on error, just log it and continue
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'warning',
          message: 'Invalid JSON received',
          error: error.message
        }));
      }
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`Client disconnected: ${userId} from room ${roomId}, code: ${code}, reason: ${reason}`);
    console.log('Close event details:', {
      wasClean: 'N/A for server-side',
      code: code,
      reason: reason,
      readyState: ws ? ws.readyState : 'undefined'
    });
    
    // Remove user from room
    const room = rooms.get(roomId);
    if (room) {
      room.users.delete(userId);
      
      // Check if room is now empty or has only one user
      const remainingUserIds = Array.from(room.users.keys());
      
      if (remainingUserIds.length === 0) {
        // Remove empty room
        rooms.delete(roomId);
        console.log(`Removed empty room: ${roomId}`);
      } else if (remainingUserIds.length === 1) {
        // Notify remaining user that their partner left
        const remainingUser = remainingUserIds[0];
        const remainingWs = room.users.get(remainingUser);
        
        if (remainingWs && remainingWs.readyState === WebSocket.OPEN) {
          try {
            remainingWs.send(JSON.stringify({
              type: 'partner_disconnected',
              userId: remainingUser,
              partnerId: userId,
              roomId: roomId
            }));
            console.log(`Notified ${remainingUser} that partner ${userId} disconnected from room ${roomId}`);
          } catch (sendError) {
            console.error(`Failed to notify ${remainingUser} about partner disconnection:`, sendError);
          }
        }
        
        // Update room state (only one user left)
        console.log(`Room ${roomId} now has only one user: ${remainingUser}`);
      }
    }
    
    // Clean up user connection from global map
    userConnections.delete(userId);
    
    // Clean up connection reference
    ws.userId = null;
    ws.roomId = null;
  });

  ws.on('error', (error) => {
    console.error("WebSocket error for user", userId, "in room", roomId, ":", error);
    console.error("WebSocket readyState:", ws ? ws.readyState : 'undefined');
    console.error("WebSocket connection details:", {
      url: req.url,
      headers: req.headers
    });
    
    // Don't close connection on error, just log it
    // Send warning to frontend
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({
          type: 'warning',
          message: 'WebSocket error occurred',
          error: error.message
        }));
      } catch (sendError) {
        console.error("Failed to send error message to client:", sendError);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0'; // Listen on all network interfaces for Render deployment

server.listen(PORT, HOST, () => {
  console.log(`Server listening on ${HOST}:${PORT}`);
});