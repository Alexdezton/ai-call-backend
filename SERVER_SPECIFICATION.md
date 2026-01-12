# Спецификация серверной части приложения

## Общее описание

Серверная часть представляет собой Node.js приложение с использованием Express.js и WebSocket. Основные функции:

- Обработка WebSocket соединений между клиентами
- Прокси-сервер для взаимодействия с OpenAI Realtime API
- Управление сессиями пользователей
- Безопасное хранение и использование API ключей OpenAI

## Зависимости

- express: веб-фреймворк
- ws: WebSocket реализация
- dotenv: управление переменными окружения
- openai: официальный SDK OpenAI

## Структура файлов

```
server.js                 # Основной сервер
config/
  └── server.config.js    # Конфигурация сервера
routes/
  └── api.js              # API маршруты
utils/
  ├── openai-proxy.js     # Прокси для OpenAI API
  └── helpers.js          # Вспомогательные функции
```

## Основные компоненты

### server.js

Основной файл сервера, который:
- Запускает HTTP/HTTPS сервер на Express.js
- Создает WebSocket сервер для обмена сообщениями между клиентами
- Обслуживает статические файлы из директории public
- Обрабатывает маршруты API

### WebSocket логика

- Управление соединениями пользователей
- Сопоставление пар пользователей для разговора
- Передача данных между участниками разговора
- Обработка событий подключения/отключения

### OpenAI прокси

Файл `utils/openai-proxy.js` содержит:
- Функции для взаимодействия с OpenAI Realtime API
- Обработка аудио потоков
- Перевод голоса в текст и обратно
- Обработка ошибок и ограничений API

### Конфигурация

Файл `config/server.config.js` содержит:
- Настройки порта сервера
- Настройки CORS
- Настройки безопасности
- Настройки логирования

## Безопасность

- API ключи OpenAI хранятся в переменных окружения
- Все вызовы OpenAI API происходят через серверный прокси
- Валидация входящих данных
- Ограничение частоты запросов

## Пример кода server.js

```javascript
const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const { OpenAIProxy } = require('./utils/openai-proxy');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Настройка middleware
app.use(express.static(path.join(__dirname, 'public')));

// Хранение активных соединений
const clients = new Map();
let waitingClients = [];

// Обработка WebSocket соединений
wss.on('connection', (ws, req) => {
  const clientId = generateClientId();
  
  // Добавляем клиента в список
  clients.set(clientId, ws);
  
  // Пытаемся сопоставить с другим ожидающим клиентом
  if (waitingClients.length > 0) {
    const partnerId = waitingClients.pop();
    const partnerWs = clients.get(partnerId);
    
    // Создаем пару для разговора
    setupCall(ws, partnerWs);
  } else {
    // Добавляем в список ожидания
    waitingClients.push(clientId);
  }
  
  // Обработка закрытия соединения
 ws.on('close', () => {
    clients.delete(clientId);
    const index = waitingClients.indexOf(clientId);
    if (index !== -1) {
      waitingClients.splice(index, 1);
    }
  });
});

// Функция установки соединения между двумя клиентами
function setupCall(client1, client2) {
  // Логика передачи данных между клиентами
  client1.on('message', (data) => {
    // Обработка аудио данных
    // Отправка через OpenAI прокси для перевода
    // Пересылка переведенного аудио второму клиенту
    client2.send(processAudioData(data));
 });
  
  client2.on('message', (data) => {
    // Обработка аудио данных
    // Отправка через OpenAI прокси для перевода
    // Пересылка переведенного аудио первому клиенту
    client1.send(processAudioData(data));
  });
}

// Запуск сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
```

## Пример кода openai-proxy.js

```javascript
const OpenAI = require('openai');

class OpenAIProxy {
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  
  async translateAudio(audioBuffer, targetLanguage) {
    try {
      const response = await this.client.audio.transcriptions.create({
        file: audioBuffer,
        model: 'whisper-1',
        language: targetLanguage === 'en' ? 'ru' : 'en'
      });
      
      // Перевод текста
      const translatedText = await this.translateText(response.text, targetLanguage);
      
      // Преобразование переведенного текста обратно в аудио
      const audioResponse = await this.client.audio.speech.create({
        model: 'tts-1',
        voice: 'alloy',
        input: translatedText
      });
      
      return audioResponse;
    } catch (error) {
      console.error('Ошибка при работе с OpenAI API:', error);
      throw error;
    }
  }
  
  async translateText(text, targetLanguage) {
    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `Translate the following text to ${targetLanguage}. Respond only with the translation.`
          },
          {
            role: 'user',
            content: text
          }
        ]
      });
      
      return response.choices[0].message.content;
    } catch (error) {
      console.error('Ошибка при переводе текста:', error);
      throw error;
    }
  }
}

module.exports = { OpenAIProxy };
```

## API маршруты

Файл `routes/api.js` может содержать:
- `/api/status` - проверка статуса сервера
- `/api/health` - проверка работоспособности
- `/api/sessions` - управление сессиями (опционально)

## Конфигурация сервера

Файл `config/server.config.js`:
```javascript
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
  }
};
```

## Переменные окружения (.env)

```
OPENAI_API_KEY=your_openai_api_key_here
PORT=3000
NODE_ENV=production
```

## Логирование и мониторинг

Сервер должен включать:
- Логирование WebSocket событий
- Логирование запросов к OpenAI API
- Логирование ошибок
- Метрики производительности (опционально)