import { WebSocket, WebSocketServer } from 'ws';
import http from 'http';
import { URL } from 'url';

const server = http.createServer();
const wss = new WebSocketServer({ server });

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
    oldWs.close(4005, "User reconnected from another device");
    console.log(`Closed old connection for user: ${userId}`);
  }

  // Store the new connection
  userConnections.set(userId, ws);

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
      // Room is full
      console.log(`Room ${roomId} is full, rejecting connection for ${userId}`);
      ws.close(4003, "Room full");
      // Clean up user connection from map
      userConnections.delete(userId);
      return;
    }
    
    if (existingUserIds.includes(userId)) {
      // User already in room - this shouldn't happen if we handled reconnection properly above
      console.log(`User ${userId} already exists in room ${roomId}`);
      ws.close(4004, "User already in room");
      // Clean up user connection from map
      userConnections.delete(userId);
      return;
    }
    
    // Add second user to room
    room.users.set(userId, ws);
    console.log(`Added user ${userId} to existing room: ${roomId}`);
    
    // Get the other user in the room
    const otherUser = existingUserIds.find(u => u !== userId);
    
    // Notify both users that they are connected
    const otherWs = room.users.get(otherUser);
    otherWs.send(JSON.stringify({
      type: 'partner_found',
      userId: otherUser,
      partnerId: userId,
      roomId: roomId
    }));
    
    ws.send(JSON.stringify({
      type: 'partner_found',
      userId: userId,
      partnerId: otherUser,
      roomId: roomId
    }));
    
    console.log(`Users paired in room ${roomId}: ${otherUser} and ${userId}`);
  }

  // Store references to userId and roomId for later use
  ws.userId = userId;
  ws.roomId = roomId;

   ws.on('message', (data) => {
     try {
       // Проверяем, является ли сообщение строкой (JSON) или бинарными данными
       if (typeof data === 'string') {
         const message = JSON.parse(data);
         
         // Log the message
         console.log(`Received message from ${userId} in room ${roomId}:`, message);
         
         // Проверяем, является ли сообщение WebRTC сообщением
         if (message.type === 'offer' || message.type === 'answer' || message.type === 'ice_candidate') {
           // Проверяем формат сообщения
           if (typeof message !== 'object' || message === null) {
             console.log(`Invalid WebRTC message format from ${userId}:`, message);
             if (ws.readyState === WebSocket.OPEN) {
               ws.send(JSON.stringify({
                 type: 'warning',
                 message: 'Invalid WebRTC message format'
               }));
             }
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
           // Отвечаем pong с тем же timestamp для измерения задержки
           if (ws.readyState === WebSocket.OPEN) {
             ws.send(JSON.stringify({
               type: 'pong',
               timestamp: message.timestamp
             }));
           }
         } else {
           // Handle other message types if needed
           console.log(`Received non-WebRTC message from ${userId}:`, message);
         }
       } else {
         // Это бинарные данные (например, аудио), логируем как служебное сообщение
         console.log(`Received binary data from ${userId} in room ${roomId}, size: ${data.length} bytes`);
       }
     } catch (error) {
       console.error("Invalid JSON received:", error.message);
       // Don't close connection on error, just log it and continue
       if (ws.readyState === WebSocket.OPEN) {
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
          remainingWs.send(JSON.stringify({
            type: 'partner_disconnected',
            userId: remainingUser,
            partnerId: userId,
            roomId: roomId
          }));
          console.log(`Notified ${remainingUser} that partner ${userId} disconnected from room ${roomId}`);
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
    
    // Don't close connection on error, just log it
    // Send warning to frontend
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'warning',
        message: 'WebSocket error occurred',
        error: error.message
      }));
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});