# Спецификация клиентской части приложения

## Общее описание

Клиентская часть представляет собой веб-приложение с минимальным UI, которое позволяет пользователям подключаться к другим пользователям и осуществлять перевод голоса в реальном времени. Приложение использует WebRTC для передачи аудио и WebSocket для соединения с сервером.

## Структура файлов

```
public/
├── index.html              # Главная страница приложения
├── css/
│   └── style.css           # Стили интерфейса
└── js/
    ├── main.js             # Основной клиентский скрипт
    ├── webrtc.js           # Логика WebRTC соединений
    └── websocket.js        # Обработка WebSocket соединений
```

## Основные компоненты

### index.html

Главная страница приложения с минимальным UI:
- Кнопка "Подключиться к собеседнику"
- Индикатор состояния подключения
- Кнопки управления аудио (вкл/выкл микрофон)
- Элементы для воспроизведения аудио
- Индикатор языка перевода

### style.css

Стили для:
- Минималистичного интерфейса
- Адаптивного дизайна
- Индикаторов состояния
- Контрольных элементов

### main.js

Центральная логика приложения:
- Инициализация приложения
- Управление состоянием UI
- Обработка пользовательских действий
- Интеграция WebRTC и WebSocket

### webrtc.js

Логика WebRTC соединений:
- Захват аудио с микрофона
- Создание RTCPeerConnection
- Обработка ICE кандидатов
- Управление медиа потоками

### websocket.js

Обработка WebSocket соединений:
- Подключение к серверу
- Обработка сообщений от сервера
- Отправка данных на сервер
- Управление состоянием соединения

## Пример кода index.html

```html
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Voice Translation App</title>
    <link rel="stylesheet" href="css/style.css">
</head>
<body>
    <div class="container">
        <header>
            <h1>Переводчик голоса</h1>
        </header>
        
        <main>
            <div class="status-indicator" id="statusIndicator">
                Готово к подключению
            </div>
            
            <div class="controls">
                <button id="connectBtn" class="btn btn-primary">Подключиться</button>
                <button id="disconnectBtn" class="btn btn-secondary" disabled>Отключиться</button>
                <button id="toggleMicBtn" class="btn btn-tertiary" disabled>Выключить микрофон</button>
            </div>
            
            <div class="language-info">
                <span id="sourceLang">RU</span> → <span id="targetLang">EN</span>
            </div>
            
            <div class="audio-elements">
                <audio id="localAudio" muted></audio>
                <audio id="remoteAudio"></audio>
            </div>
        </main>
    </div>
    
    <script src="js/websocket.js"></script>
    <script src="js/webrtc.js"></script>
    <script src="js/main.js"></script>
</body>
</html>
```

## Пример кода style.css

```css
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background-color: #f5f5f5;
    color: #333;
    line-height: 1.6;
}

.container {
    max-width: 600px;
    margin: 0 auto;
    padding: 20px;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
}

header {
    text-align: center;
    margin-bottom: 30px;
}

h1 {
    font-size: 2rem;
    color: #2c3e50;
}

.status-indicator {
    background-color: #ecf0f1;
    border-radius: 8px;
    padding: 15px;
    text-align: center;
    margin-bottom: 20px;
    font-weight: bold;
    color: #2c3e50;
}

.controls {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    justify-content: center;
    margin-bottom: 20px;
}

.btn {
    padding: 12px 24px;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    cursor: pointer;
    transition: background-color 0.3s;
}

.btn-primary {
    background-color: #3498db;
    color: white;
}

.btn-primary:hover:not(:disabled) {
    background-color: #2980b9;
}

.btn-secondary {
    background-color: #e74c3c;
    color: white;
}

.btn-secondary:hover:not(:disabled) {
    background-color: #c0392b;
}

.btn-tertiary {
    background-color: #95a5a6;
    color: white;
}

.btn-tertiary:hover:not(:disabled) {
    background-color: #7f8c8d;
}

.btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.language-info {
    text-align: center;
    font-size: 1.2rem;
    margin-bottom: 20px;
    color: #7f8c8d;
}

.audio-elements {
    display: none; /* Скрыты, но необходимы для работы аудио */
}

@media (max-width: 600px) {
    .container {
        padding: 10px;
    }
    
    h1 {
        font-size: 1.5rem;
    }
    
    .controls {
        flex-direction: column;
        align-items: center;
    }
    
    .btn {
        width: 100%;
        max-width: 300px;
    }
}
```

## Пример кода webrtc.js

```javascript
class WebRTCClient {
  constructor() {
    this.localStream = null;
    this.remoteStream = null;
    this.peerConnection = null;
    this.isMicEnabled = true;
    
    // STUN сервер для WebRTC
    this.iceServers = [
      { urls: 'stun:stun.l.google.com:19302' }
    ];
  }
  
  // Инициализация захвата аудио
  async initAudio() {
    try {
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      };
      
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Привязываем локальный стрим к аудио элементу
      const localAudio = document.getElementById('localAudio');
      if (localAudio) {
        localAudio.srcObject = this.localStream;
      }
      
      return true;
    } catch (error) {
      console.error('Ошибка при доступе к микрофону:', error);
      return false;
    }
  }
  
  // Создание RTCPeerConnection
  createPeerConnection() {
    this.peerConnection = new RTCPeerConnection({
      iceServers: this.iceServers
    });
    
    // Добавляем локальный стрим к соединению
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });
    }
    
    // Обработка удаленного стрима
    this.peerConnection.ontrack = (event) => {
      this.remoteStream = event.streams[0];
      const remoteAudio = document.getElementById('remoteAudio');
      if (remoteAudio) {
        remoteAudio.srcObject = this.remoteStream;
      }
    };
    
    // Обработка ICE кандидатов
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        // Отправляем кандидат на сервер
        window.wsClient.sendIceCandidate(event.candidate);
      }
    };
    
    // Обработка состояния соединения
    this.peerConnection.onconnectionstatechange = () => {
      console.log('Состояние соединения:', this.peerConnection.connectionState);
    };
    
    return this.peerConnection;
  }
  
  // Создание предложения
  async createOffer() {
    if (!this.peerConnection) {
      this.createPeerConnection();
    }
    
    try {
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      return offer;
    } catch (error) {
      console.error('Ошибка при создании предложения:', error);
      throw error;
    }
  }
  
  // Установка удаленного описания
  async setRemoteDescription(description) {
    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(description));
    } catch (error) {
      console.error('Ошибка при установке удаленного описания:', error);
      throw error;
    }
  }
  
  // Добавление ICE кандидата
  async addIceCandidate(candidate) {
    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('Ошибка при добавлении ICE кандидата:', error);
      throw error;
    }
  }
  
  // Переключение состояния микрофона
  toggleMicrophone() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        if (track.kind === 'audio') {
          track.enabled = !track.enabled;
          this.isMicEnabled = track.enabled;
        }
      });
    }
    return this.isMicEnabled;
  }
  
  // Закрытие соединения
  closeConnection() {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    
    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach(track => track.stop());
      this.remoteStream = null;
    }
  }
}

// Экспортируем как глобальный объект для использования в других модулях
window.WebRTCClient = WebRTCClient;
```

## Пример кода websocket.js

```javascript
class WebSocketClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.onMessageCallback = null;
    this.onConnectCallback = null;
    this.onDisconnectCallback = null;
  }
  
  connect() {
    this.ws = new WebSocket(this.url);
    
    this.ws.onopen = () => {
      console.log('Соединение с сервером установлено');
      if (this.onConnectCallback) {
        this.onConnectCallback();
      }
    };
    
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (this.onMessageCallback) {
        this.onMessageCallback(data);
      }
    };
    
    this.ws.onclose = () => {
      console.log('Соединение с сервером закрыто');
      if (this.onDisconnectCallback) {
        this.onDisconnectCallback();
      }
    };
    
    this.ws.onerror = (error) => {
      console.error('Ошибка WebSocket соединения:', error);
    };
  }
  
  sendMessage(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket соединение не установлено');
    }
  }
  
  sendIceCandidate(candidate) {
    this.sendMessage({
      type: 'ice_candidate',
      candidate: candidate
    });
  }
  
  sendOffer(offer) {
    this.sendMessage({
      type: 'offer',
      offer: offer
    });
  }
  
  sendAnswer(answer) {
    this.sendMessage({
      type: 'answer',
      answer: answer
    });
  }
  
  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// Экспортируем как глобальный объект для использования в других модулях
window.WebSocketClient = WebSocketClient;
```

## Пример кода main.js

```javascript
class VoiceTranslationApp {
  constructor() {
    this.webRTCClient = null;
    this.wsClient = null;
    this.isConnected = false;
    this.isInCall = false;
    
    this.initializeElements();
    this.setupEventListeners();
 }
  
  initializeElements() {
    this.connectBtn = document.getElementById('connectBtn');
    this.disconnectBtn = document.getElementById('disconnectBtn');
    this.toggleMicBtn = document.getElementById('toggleMicBtn');
    this.statusIndicator = document.getElementById('statusIndicator');
    this.sourceLangEl = document.getElementById('sourceLang');
    this.targetLangEl = document.getElementById('targetLang');
  }
  
  setupEventListeners() {
    this.connectBtn.addEventListener('click', () => this.connectToServer());
    this.disconnectBtn.addEventListener('click', () => this.disconnectFromServer());
    this.toggleMicBtn.addEventListener('click', () => this.toggleMicrophone());
 }
  
  async connectToServer() {
    try {
      // Инициализируем WebRTC
      this.webRTCClient = new WebRTCClient();
      const audioAccess = await this.webRTCClient.initAudio();
      
      if (!audioAccess) {
        alert('Не удалось получить доступ к микрофону');
        return;
      }
      
      // Подключаемся к WebSocket серверу
      this.wsClient = new WebSocketClient('ws://localhost:3000');
      this.setupWebSocketHandlers();
      this.wsClient.connect();
      
      this.updateUI();
    } catch (error) {
      console.error('Ошибка при подключении:', error);
      this.statusIndicator.textContent = 'Ошибка подключения';
    }
  }
  
  setupWebSocketHandlers() {
    this.wsClient.onConnectCallback = () => {
      this.isConnected = true;
      this.statusIndicator.textContent = 'Подключено к серверу, ищу собеседника...';
      this.updateUI();
    };
    
    this.wsClient.onDisconnectCallback = () => {
      this.isConnected = false;
      this.isInCall = false;
      this.statusIndicator.textContent = 'Отключено от сервера';
      this.updateUI();
    };
    
    this.wsClient.onMessageCallback = (data) => {
      this.handleMessage(data);
    };
  }
  
  handleMessage(data) {
    switch (data.type) {
      case 'partner_found':
        this.statusIndicator.textContent = 'Найден собеседник! Установка соединения...';
        break;
        
      case 'offer':
        this.handleOffer(data.offer);
        break;
        
      case 'answer':
        this.handleAnswer(data.answer);
        break;
        
      case 'ice_candidate':
        this.handleIceCandidate(data.candidate);
        break;
        
      case 'call_started':
        this.isInCall = true;
        this.statusIndicator.textContent = 'Разговор активен';
        this.updateUI();
        break;
        
      case 'partner_disconnected':
        this.isInCall = false;
        this.statusIndicator.textContent = 'Собеседник отключился';
        this.updateUI();
        break;
    }
  }
  
  async handleOffer(offer) {
    try {
      await this.webRTCClient.setRemoteDescription(offer);
      
      const answer = await this.webRTCClient.createPeerConnection()
        .createAnswer();
      await this.webRTCClient.peerConnection.setLocalDescription(answer);
      
      this.wsClient.sendAnswer(answer);
    } catch (error) {
      console.error('Ошибка при обработке предложения:', error);
    }
  }
  
  async handleAnswer(answer) {
    try {
      await this.webRTCClient.setRemoteDescription(answer);
    } catch (error) {
      console.error('Ошибка при обработке ответа:', error);
    }
  }
  
  async handleIceCandidate(candidate) {
    try {
      await this.webRTCClient.addIceCandidate(candidate);
    } catch (error) {
      console.error('Ошибка при обработке ICE кандидата:', error);
    }
  }
  
  disconnectFromServer() {
    if (this.wsClient) {
      this.wsClient.disconnect();
    }
    
    if (this.webRTCClient) {
      this.webRTCClient.closeConnection();
    }
    
    this.isConnected = false;
    this.isInCall = false;
    this.statusIndicator.textContent = 'Отключено';
    this.updateUI();
  }
  
  toggleMicrophone() {
    if (this.webRTCClient) {
      const isEnabled = this.webRTCClient.toggleMicrophone();
      this.toggleMicBtn.textContent = isEnabled ? 'Выключить микрофон' : 'Включить микрофон';
    }
  }
  
  updateUI() {
    this.connectBtn.disabled = this.isConnected || this.isInCall;
    this.disconnectBtn.disabled = !this.isConnected && !this.isInCall;
    this.toggleMicBtn.disabled = !(this.isConnected && this.isInCall);
  }
}

// Инициализация приложения после загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
  window.app = new VoiceTranslationApp();
});
```

## Безопасность на клиенте

- Минимальный UI без регистрации
- Все чувствительные операции происходят на сервере
- Никаких API ключей не передается на клиент

## Совместимость

- Поддержка современных браузеров (Chrome, Firefox, Safari, Edge)
- Проверка поддержки WebRTC API
- Обработка ошибок доступа к микрофону