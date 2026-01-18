// Генерация простого ID сессии для пользователя (user1, user2 и т.д.)
function generateSessionId() {
  return `user${Math.floor(1 + Math.random() * 10)}`;
}

class VoiceTranslationApp {
  constructor() {
    this.roomId = '';
    this.localStream = null;
    this.remoteStream = null;
    this.peerConnection = null;
    this.ws = null;
    this.isConnected = false;
    this.isInCall = false;
    this.isInRoom = false;
    this.hasPartner = false;
    this.isMicEnabled = true;
    this.audioContext = null;
    this.audioProcessor = null;
    this.microphone = null;
    this.mediaRecorder = null;
    this.latencyInterval = null;
    
    // STUN сервер для WebRTC
    this.iceServers = [
      { urls: 'stun:stun.l.google.com:19302' }
    ];
    
    // Генерируем случайный User ID при создании экземпляра
    this.userId = `user${Math.floor(1 + Math.random() * 1000)}`;
    
    this.initializeElements();
    this.setupEventListeners();
    this.updateUI();
  }
  
  initializeElements() {
    this.connectBtn = document.getElementById('connectBtn');
    this.disconnectBtn = document.getElementById('disconnectBtn');
    this.startCallBtn = document.getElementById('startCallBtn');
    this.stopCallBtn = document.getElementById('stopCallBtn');
    this.micStatusText = document.getElementById('micStatusText');
    this.connectionStatusText = document.getElementById('connectionStatusText');
    this.roomStatusText = document.getElementById('roomStatusText');
    this.latencyValue = document.getElementById('latencyValue');
    this.userIdDisplay = document.getElementById('userIdDisplay');
    this.roomInputId = document.getElementById('roomInputId');
    this.localAudio = document.getElementById('localAudio');
    this.remoteAudio = document.getElementById('remoteAudio');
    
    // Устанавливаем сгенерированный User ID в отображение
    if (this.userIdDisplay) {
      this.userIdDisplay.textContent = this.userId;
    }
    
    // Добавляем обработчики событий
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    this.connectBtn.addEventListener('click', () => this.connectToServer());
    this.disconnectBtn.addEventListener('click', () => this.disconnectFromServer());
    this.startCallBtn.addEventListener('click', () => this.startCall());
    this.stopCallBtn.addEventListener('click', () => this.stopCall());
  }
  
  async connectToServer() {
    try {
      // Получаем Room ID из поля ввода
      this.roomId = this.roomInputId.value.trim();
      
      if (!this.roomId) {
        alert('Please enter Room ID');
        return;
      }
      
      // Инициализируем WebRTC и получаем доступ к аудио
      const audioAccess = await this.initAudio();
      
      if (!audioAccess) {
        alert('Не удалось получить доступ к микрофону');
        return;
      }
      
      // Подключаемся к WebSocket серверу с User ID и Room ID в URL
      const url = `wss://ai-call-backend-esj7.onrender.com?userId=${encodeURIComponent(this.userId)}&roomId=${encodeURIComponent(this.roomId)}`;
      this.ws = new WebSocket(url);
      
      this.ws.onopen = () => {
        console.log('WS OPEN');
        this.log('WS OPEN');
        this.isConnected = true;
        this.connectionStatusText.textContent = 'Connected';
        this.updateUI();
        
        // Запускаем измерение latency
        this.startLatencyMeasurement();
      };
      
      this.ws.onmessage = (event) => {
        // Check if the received data is text (JSON) or binary (audio/data)
        if (typeof event.data === 'string') {
          try {
            const message = JSON.parse(event.data);
            
            console.log('WS MESSAGE', message);
            this.log(`WS MESSAGE: ${JSON.stringify(message)}`);
            
            // Handle pong for latency measurement
            if (message.type === 'pong') {
              const latency = Date.now() - message.timestamp;
              this.latencyValue.textContent = `${latency} ms`;
              return;
            }
            
            // Process other message types
            this.handleMessage(message);
          } catch (error) {
            console.error("Invalid JSON received:", error.message);
            this.log(`ERROR: Invalid JSON received - ${error.message}`);
          }
        } else {
          // This is binary data (audio or other) for processing
          console.log('Received binary data from WebSocket');
          this.playReceivedAudio(event.data);
        }
      };
      
      this.ws.onclose = (event) => {
        console.log('WS CLOSE', event.code, event.reason);
        this.log(`WS CLOSE: code=${event.code} reason=${event.reason}`);
        this.isConnected = false;
        this.isInCall = false;
        this.isInRoom = false;
        this.hasPartner = false;
        this.connectionStatusText.textContent = 'Disconnected';
        this.updateUI();
        
        // Останавливаем измерение latency
        this.stopLatencyMeasurement();
      };
      
      this.ws.onerror = (error) => {
        console.error('Ошибка WebSocket соединения:', error);
        this.connectionStatusText.textContent = 'Error';
        this.updateUI();
      };
    } catch (error) {
      console.error('Ошибка при подключении:', error);
      this.connectionStatusText.textContent = 'Connection Error';
      this.updateUI();
    }
  }
  
  disconnectFromServer() {
    if (this.ws) {
      this.ws.close(1000, "User disconnected");
    }
    
    // Reset state
    this.isConnected = false;
    this.isInCall = false;
    this.isInRoom = false;
    this.hasPartner = false;
    this.connectionStatusText.textContent = 'Disconnected';
    this.updateUI();
  }
  
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
      if (this.localAudio) {
        this.localAudio.srcObject = this.localStream;
      }
      
      // Инициализируем Web Audio API для обработки аудио
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.microphone = this.audioContext.createMediaStreamSource(this.localStream);
      
      // Обновляем статус микрофона
      this.micStatusText.textContent = 'Active';
      this.updateUI();
      
      return true;
    } catch (error) {
      console.error('Ошибка при доступе к микрофону:', error);
      this.micStatusText.textContent = 'Error';
      this.updateUI();
      return false;
    }
  }
  
   // Начало отправки аудио на сервер через WebSocket
   startSendingAudio() {
     try {
       // Используем MediaRecorder для захвата аудио и отправки через WebSocket
       this.mediaRecorder = new MediaRecorder(this.localStream, { mimeType: 'audio/webm' });
       
       // Когда доступны данные аудио, отправляем их на сервер
       this.mediaRecorder.ondataavailable = (event) => {
         if (event.data.size > 0 && this.ws && this.ws.readyState === WebSocket.OPEN) {
           // Отправляем аудио данные на сервер
           this.ws.send(event.data);
         }
       };
       
       // Начинаем запись с коротким интервалом для непрерывной передачи
       this.mediaRecorder.start(250); // каждые 250мс
     } catch (error) {
       console.error('Ошибка при начале отправки аудио:', error);
     }
   }
   
   // Остановка отправки аудио
   stopSendingAudio() {
     if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
       this.mediaRecorder.stop();
     }
   }
  
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
      
      // Привязываем удаленный стрим к аудио элементу для воспроизведения
      if (this.remoteAudio) {
        this.remoteAudio.srcObject = this.remoteStream;
      }
    };
    
    // Обработка ICE кандидатов
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendToServer({
          type: 'ice_candidate',
          candidate: event.candidate
        });
      }
    };
    
    // Обработка состояния соединения
    this.peerConnection.onconnectionstatechange = () => {
      console.log('Состояние WebRTC соединения:', this.peerConnection.connectionState);
    };
    
    // Обработка сигнальных сообщений
    this.peerConnection.onsignalingstatechange = () => {
      console.log('Состояние сигнализации WebRTC:', this.peerConnection.signalingState);
    };
    
    return this.peerConnection;
  }
  
  async startCall() {
    if (!this.isConnected || !this.hasPartner) {
      alert('You must be connected and have a partner in the room to start a call');
      return;
    }
    
    try {
      // Create peer connection
      this.createPeerConnection();
      
      // Create offer with proper constraints
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      });
      
      await this.peerConnection.setLocalDescription(offer);
      
      // Send offer to server with proper format
      this.sendToServer({
        type: 'offer',
        sdp: offer.sdp,
        sessionId: this.sessionId
      });
      
      this.isInCall = true;
      
      // Start sending audio
      this.startSendingAudio();
      
      this.updateUI();
    } catch (error) {
      console.error('Error starting call:', error);
    }
  }
  
  stopCall() {
    // Останавливаем отправку аудио
    this.stopSendingAudio();
    
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
    
    this.isInCall = false;
    this.updateUI();
  }
  
  toggleMicrophone() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        if (track.kind === 'audio') {
          track.enabled = !track.enabled;
          this.isMicEnabled = track.enabled;
        }
      });
    }
    
    this.micStatusText.textContent = this.isMicEnabled ? 'Active' : 'Muted';
    this.updateUI();
  }
  
  handleMessage(data) {
    switch (data.type) {
      case 'partner_found':
        console.log(`Partner found: ${data.partnerId} in room ${data.roomId}`);
        this.hasPartner = true;
        this.isInRoom = true;
        this.updateUI();
        break;
        
      case 'waiting_for_partner':
        console.log(`Waiting for partner in room ${data.roomId}...`);
        this.isInRoom = true;
        this.hasPartner = false;
        this.updateUI();
        break;
        
      case 'offer':
        this.handleOffer(data);
        break;
        
      case 'answer':
        this.handleAnswer(data);
        break;
        
      case 'ice_candidate':
        this.handleIceCandidate(data);
        break;
        
      case 'call_started':
        this.isInCall = true;
        this.updateUI();
        break;
        
      case 'partner_disconnected':
        console.log(`Partner ${data.partnerId} disconnected from room ${data.roomId}`);
        this.hasPartner = false;
        this.isInRoom = false;
        this.isInCall = false;
        this.updateUI();
        break;
        
      case 'warning':
        console.warn('Warning:', data.message);
        this.log(`WARNING: ${data.message}`);
        break;
        
      default:
        console.log('Received unknown message:', data);
        break;
    }
  }
  
  // Воспроизведение полученного аудио
  async playReceivedAudio(audioData) {
    try {
      // Определяем тип данных и создаем соответствующий blob
      let audioBlob;
      
      if (audioData instanceof Blob) {
        // Если это уже Blob
        audioBlob = audioData;
      } else if (audioData instanceof ArrayBuffer) {
        // Если это ArrayBuffer
        audioBlob = new Blob([audioData], { type: 'audio/webm' });
      } else {
        // Если это что-то другое (например, Uint8Array)
        audioBlob = new Blob([audioData], { type: 'audio/webm' });
      }
      
      const audioUrl = URL.createObjectURL(audioBlob);
      
      if (this.remoteAudio) {
        this.remoteAudio.src = audioUrl;
        // Автоматически начинаем воспроизведение
        const playPromise = this.remoteAudio.play();
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            console.error('Ошибка при воспроизведении аудио:', error);
            // Пытаемся снова после взаимодействия пользователя
            this.remoteAudio.addEventListener('load', () => {
              this.remoteAudio.play().catch(e => {
                console.error('Повторная ошибка при воспроизведении аудио:', e);
              });
            });
          });
        }
      }
    } catch (error) {
      console.error('Ошибка при воспроизведении полученного аудио:', error);
    }
  }
  
  async handleOffer(offer) {
    try {
      if (!this.peerConnection) {
        this.createPeerConnection();
      }
      
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      
      this.sendToServer({
        type: 'answer',
        answer: answer
      });
    } catch (error) {
      console.error('Ошибка при обработке предложения:', error);
    }
  }
  
  async handleAnswer(answer) {
    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
      console.error('Ошибка при обработке ответа:', error);
    }
  }
  
  async handleIceCandidate(candidate) {
    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('Ошибка при обработке ICE кандидата:', error);
    }
  }
  
  sendToServer(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket соединение не установлено');
    }
  }
  
  updateUI() {
    // Обновляем состояние кнопок
    this.connectBtn.disabled = this.isConnected && this.isInCall;
    this.disconnectBtn.disabled = !this.isConnected;
    this.startCallBtn.disabled = !this.isConnected || this.isInCall || !this.hasPartner;
    this.stopCallBtn.disabled = !this.isInCall;
    
    // Обновляем стили индикаторов
    const micStatus = document.getElementById('micStatus');
    const connectionStatus = document.getElementById('connectionStatus');
    
    if (micStatus) {
      micStatus.classList.remove('active', 'inactive');
      micStatus.classList.add(this.isMicEnabled ? 'active' : 'inactive');
    }
    
    if (connectionStatus) {
      connectionStatus.classList.remove('active', 'inactive');
      connectionStatus.classList.add(this.isConnected ? 'active' : 'inactive');
    }
    
    // Обновляем статус комнаты
    this.updateRoomStatus();
  }
  
  updateRoomStatus() {
    const roomStatusElement = document.getElementById('roomStatus');
    if (roomStatusElement) {
      if (this.isInRoom) {
        if (this.hasPartner) {
          roomStatusElement.textContent = 'В комнате с партнёром';
          roomStatusElement.className = 'status-indicator connected';
        } else {
          roomStatusElement.textContent = 'Ожидание партнёра...';
          roomStatusElement.className = 'status-indicator waiting';
        }
      } else {
        roomStatusElement.textContent = 'Не в комнате';
        roomStatusElement.className = 'status-indicator disconnected';
      }
    }
  }
  
  // Функция для вывода логов
  log(message) {
    const logElement = document.getElementById('logOutput');
    if (logElement) {
      const timestamp = new Date().toLocaleTimeString();
      const logEntry = document.createElement('p');
      logEntry.textContent = `[${timestamp}] ${message}`;
      logElement.appendChild(logEntry);
      
      // Прокручиваем вниз, чтобы видеть последние логи
      logElement.scrollTop = logElement.scrollHeight;
    }
    console.log(`[${new Date().toLocaleTimeString()}]`, message);
    
    // Также обновляем статус комнаты при необходимости
    if (message.includes('partner_found') || message.includes('waiting_for_partner') || message.includes('partner_disconnected')) {
      this.updateRoomStatus();
    }
  }
  
  // Запуск измерения latency
  startLatencyMeasurement() {
    // Останавливаем предыдущий интервал, если он был
    this.stopLatencyMeasurement();
    
    // Запускаем новый интервал для измерения latency
    this.latencyInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendToServer({
          type: 'ping',
          timestamp: Date.now()
        });
      }
    }, 1000);
  }
  
  // Остановка измерения latency
  stopLatencyMeasurement() {
    if (this.latencyInterval) {
      clearInterval(this.latencyInterval);
      this.latencyInterval = null;
    }
  }
}

// Инициализация приложения после загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
  window.app = new VoiceTranslationApp();
  
 // Добавляем тестовое подключение
  const testBtn = document.getElementById('connectTestBtn');
  if (testBtn) {
    testBtn.addEventListener('click', () => {
      const testWs = new WebSocket('wss://ai-call-backend-esj7.onrender.com');
      testWs.onopen = () => console.log('Connection OK');
      testWs.onerror = (err) => console.error('Connection Failed', err);
    });
  }
});

// Функция для копирования ID пользователя
function copyUserId() {
  const userId = document.getElementById('userIdDisplay').textContent;
  navigator.clipboard.writeText(userId).then(function() {
    alert('User ID copied to clipboard!');
  }).catch(function(err) {
    console.error('Could not copy text: ', err);
  });
}