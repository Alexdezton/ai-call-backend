// Генерация случайного ID пользователя
function generateUserId() {
  return 'user_' + Math.random().toString(36).substr(2, 9);
}

class VoiceTranslationApp {
  constructor() {
    this.userId = generateUserId();
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
    this.isConnecting = false; // Флаг для предотвращения повторного подключения
    
    // STUN сервер для WebRTC
    this.iceServers = [
      { urls: 'stun:stun.l.google.com:19302' }
    ];
    
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
    this.roomInputId = document.getElementById('roomId');
    this.localAudio = document.getElementById('localAudio');
    this.remoteAudio = document.getElementById('remoteAudio');
    
    // Устанавливаем сгенерированный ID пользователя в UI
    this.userIdDisplay.textContent = this.userId;
  }
  
  setupEventListeners() {
    this.connectBtn.addEventListener('click', () => this.connectToServer());
    this.disconnectBtn.addEventListener('click', () => this.disconnectFromServer());
    this.startCallBtn.addEventListener('click', () => this.startCall());
    this.stopCallBtn.addEventListener('click', () => this.stopCall());
  }
  
  async connectToServer() {
    // Проверяем, не выполняется ли уже подключение
    if (this.isConnecting) {
      return; // Предотвращаем повторное подключение
    }
    
    this.isConnecting = true; // Устанавливаем флаг подключения
    
    try {
      // Инициализируем WebRTC и получаем доступ к аудио
      const audioAccess = await this.initAudio();
      
      if (!audioAccess) {
        alert('Не удалось получить доступ к микрофону');
        this.isConnecting = false; // Сбрасываем флаг
        return;
      }
      
      // Получаем Room ID из поля ввода
      const roomIdInput = document.getElementById('roomId');
      const roomId = roomIdInput.value.trim();
      
      if (!roomId) {
        // Показываем ошибку в интерфейсе вместо alert
        const errorElement = document.getElementById('roomIdError');
        if (errorElement) {
          errorElement.style.display = 'block';
          
          // Скрываем сообщение об ошибке через 3 секунды
          setTimeout(() => {
            errorElement.style.display = 'none';
          }, 3000);
        }
        // НЕ сбрасываем флаг isConnecting здесь, чтобы предотвратить повторный вызов до завершения обработки
        setTimeout(() => {
          this.isConnecting = false; // Сбрасываем флаг через небольшой промежуток времени
        }, 100); // 100 миллисекунд достаточно, чтобы предотвратить повторный вызов
        return;
      }
      
      // Подключаемся к WebSocket серверу с параметрами userId и roomId
      const wsUrl = `ws://localhost:3000?userId=${encodeURIComponent(this.userId)}&roomId=${encodeURIComponent(roomId)}`;
      this.ws = new WebSocket(wsUrl);
      
      // Сбрасываем флаг подключения при успешном открытии соединения
      this.ws.onopen = () => {
        console.log('Соединение с сервером установлено');
        this.isConnected = true;
        this.isConnecting = false; // Сбрасываем флаг подключения
        this.connectionStatusText.textContent = 'Connected';
        this.updateUI();
        
        // Отправляем информацию о пользователе на сервер
        this.sendToServer({
          type: 'user_info',
          userId: this.userId,
          myLanguage: document.getElementById('myLanguage').value,
          partnerLanguage: document.getElementById('partnerLanguage').value
        });
        
        // Запускаем измерение latency
        this.startLatencyMeasurement();
      };
      
      this.ws.onmessage = (event) => {
        // Проверяем тип полученных данных (текст или бинарные)
        if (typeof event.data === 'string') {
          // Это JSON строка сообщением
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } else {
          // Это бинарные аудио данные для воспроизведения
          this.playReceivedAudio(event.data);
        }
      };
      
      this.ws.onclose = () => {
        console.log('Соединение с сервером закрыто');
        this.isConnected = false;
        this.isInCall = false;
        this.isInRoom = false;
        this.hasPartner = false;
        this.isConnecting = false; // Сбрасываем флаг подключения
        this.connectionStatusText.textContent = 'Disconnected';
        this.roomStatusText.textContent = 'Not in room';
        this.updateUI();
      };
      
      this.ws.onerror = (error) => {
        console.error('Ошибка WebSocket соединения:', error);
        this.isConnecting = false; // Сбрасываем флаг подключения
        this.connectionStatusText.textContent = 'Error';
        this.updateUI();
      };
    } catch (error) {
      console.error('Ошибка при подключении:', error);
      this.isConnecting = false; // Сбрасываем флаг подключения
      this.connectionStatusText.textContent = 'Connection Error';
      this.updateUI();
    }
  }
  
  disconnectFromServer() {
    if (this.ws) {
      this.ws.close();
    }
    
    this.isConnected = false;
    this.isInRoom = false;
    this.hasPartner = false;
    this.isConnecting = false; // Сбрасываем флаг подключения
    this.connectionStatusText.textContent = 'Disconnected';
    this.roomStatusText.textContent = 'Not in room';
    
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
      this.isConnecting = false; // Сбрасываем флаг подключения
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
    if (!this.isConnected) {
      alert('Сначала подключитесь к серверу');
      return;
    }
    
    try {
      this.createPeerConnection();
      
      // Создаем предложение
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      
      // Отправляем предложение на сервер
      this.sendToServer({
        type: 'offer',
        offer: offer
      });
      
      this.isInCall = true;
      
      // Начинаем отправку аудио
      this.startSendingAudio();
      
      this.updateUI();
    } catch (error) {
      console.error('Ошибка при начале звонка:', error);
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
        
      case 'pong':
        // Обработка ответа на ping для измерения задержки
        const latency = Date.now() - data.timestamp;
        this.latencyValue.textContent = `${latency} ms`;
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