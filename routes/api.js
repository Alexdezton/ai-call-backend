const express = require('express');
const router = express.Router();

// Маршрут для проверки статуса сервера
router.get('/status', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Маршрут для проверки работоспособности
router.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    checks: {
      database: 'ok', // В реальном приложении проверять состояние БД
      openai_api: 'pending', // В реальном приложении проверять доступ к OpenAI API
      websocket: 'ok' // В реальном приложении проверять состояние WebSocket
    }
  });
});

// Маршрут для управления сессиями (опционально)
router.get('/sessions', (req, res) => {
  // В реальном приложении возвращать информацию о сессиях
  res.json({ 
    sessions_count: global.activeSessions ? global.activeSessions.size : 0,
    message: 'Sessions endpoint - implementation depends on application needs'
  });
});

// Маршрут для получения информации о подключенных клиентах
router.get('/clients', (req, res) => {
  res.json({ 
    clients_count: global.connectedClients ? global.connectedClients.size : 0,
    message: 'Connected clients endpoint'
  });
});

module.exports = router;