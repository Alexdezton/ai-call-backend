module.exports = {
  port: process.env.PORT || 3000,
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
  },
  logging: {
    level: 'info',
    format: 'combined'
  },
  limits: {
    fileSize: '5mb',
    requestTimeout: 30000
  },
  websocket: {
    pingInterval: 30000,
    maxPayload: '10mb'
  }
};