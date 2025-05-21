import { getItem, setItem } from './dbStorage.js';
import { showToast } from './utils.js';

// Импортируем EmojiButton прямо из CDN как ES-модуль
// chatsClient.js
import { EmojiButton } from 'https://cdn.jsdelivr.net/npm/@joeattardi/emoji-button@4.6.4/dist/index.js';

const picker = new EmojiButton({
  position: 'top-start',
  theme: 'light'
});

/**
 * Рендер списка чатов с пользователями.
 */
export async function renderChatList() {
  const chatsData = await getItem('adminChats');
  const allChats = chatsData ? JSON.parse(chatsData) : {};
  const chatListContainer = document.querySelector('.chat-list-container');
  let html = `<h2>Чаты с пользователями</h2>`;
  
  if (Object.keys(allChats).length === 0) {
    html += `<p>Нет чатов.</p>`;
  } else {
    html += `<ul class="chat-list">`;
    for (const userEmail in allChats) {
      const chat = allChats[userEmail];
      const lastMsg = chat[chat.length - 1];
      const unreadCount = chat.filter(m => m.from === 'user' && !m.readByAdmin).length;
      html += `<li class="chat-item" data-email="${userEmail}">
                <div class="chat-item-header">
                  <span class="chat-user">${userEmail}</span>
                  ${unreadCount > 0 ? `<span class="chat-unread">${unreadCount}</span>` : ''}
                </div>
                <div class="chat-item-last">
                  ${lastMsg ? (lastMsg.text || '[файл]') : ''}
                </div>
              </li>`;
    }
    html += `</ul>`;
  }
  chatListContainer.innerHTML = html;
  
  // Навешиваем обработчик клика на каждый элемент списка
  const chatItems = chatListContainer.querySelectorAll('.chat-item');
  chatItems.forEach(item => {
    item.addEventListener('click', () => {
      const email = item.getAttribute('data-email');
      renderChatWindow(email);
    });
  });
}

/**
 * Открытие окна чата с конкретным пользователем.
 */
export async function renderChatWindow(userEmail) {
  const chatWindowContainer = document.querySelector('.chat-window-container');
  chatWindowContainer.style.display = 'block';
  
  // Создаём разметку окна чата с кнопкой emoji-пикера
  const chatWindow = chatWindowContainer.querySelector('.chat-window');
  chatWindow.innerHTML = `
    <h3>Чат с ${userEmail}</h3>
    <div id="chatHistory" class="chat-history"></div>
    <div class="chat-input-container">
      <input type="file" id="chatFileInput" style="display:none;">
      <button id="attachFileBtn" class="button button-sm">📎</button>
      <button id="emojiPickerBtn" class="button button-sm">😊</button>
      <input type="text" id="chatMessageInput" placeholder="Введите сообщение...">
      <button id="sendChatMessage" class="button button-sm">Отправить</button>
    </div>
  `;
  
  // Прикрепляем emoji-пикер к кнопке
  const emojiPickerBtn = chatWindow.querySelector('#emojiPickerBtn');
  const chatMessageInput = chatWindow.querySelector('#chatMessageInput');
  emojiPickerBtn.addEventListener('click', () => {
    picker.togglePicker(emojiPickerBtn);
  });
  picker.on('emoji', selection => {
    chatMessageInput.value += selection.emoji;
    chatMessageInput.focus();
  });
  
  await renderChatHistory(userEmail);
  
  const attachFileBtn = chatWindow.querySelector('#attachFileBtn');
  const chatFileInput = chatWindow.querySelector('#chatFileInput');
  const sendChatMessageBtn = chatWindow.querySelector('#sendChatMessage');
  
  attachFileBtn.addEventListener('click', () => {
    chatFileInput.click();
  });
  sendChatMessageBtn.addEventListener('click', () => {
    sendMessage(userEmail);
  });
  chatMessageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage(userEmail);
  });
}

/**
 * Отрисовка истории сообщений в окне чата.
 */
async function renderChatHistory(userEmail) {
  const chatHistory = document.getElementById('chatHistory');
  const chatsData = await getItem('adminChats');
  let allChats = chatsData ? JSON.parse(chatsData) : {};
  let userChat = allChats[userEmail] || [];
  let html = '';
  userChat.forEach(msg => {
    // Отмечаем сообщение как прочитанное, если оно от пользователя
    if (msg.from === 'user') msg.readByAdmin = true;
    // Используем "облака" сообщений с закруглением, тенями и анимацией
    if (msg.from === 'user') {
      html += `<div class="chat-message user-message">
                <div class="message-content">
                  ${msg.fileName ? `<a href="${msg.fileData}" download="${msg.fileName}">${msg.fileName}</a>` : msg.text}
                </div>
                <div class="chat-date">${msg.date}</div>
              </div>`;
    } else {
      html += `<div class="chat-message admin-message">
                <div class="message-content">
                  ${msg.fileName ? `<a href="${msg.fileData}" download="${msg.fileName}">${msg.fileName}</a>` : msg.text}
                </div>
                <div class="chat-date">${msg.date}</div>
              </div>`;
    }
  });
  chatHistory.innerHTML = html;
  chatHistory.scrollTop = chatHistory.scrollHeight;
  
  // Сохраняем обновлённые данные чатов
  await setItem('adminChats', JSON.stringify(allChats));
}

/**
 * Отправка сообщения (с вложением или без).
 */
async function sendMessage(userEmail) {
  const chatWindow = document.querySelector('.chat-window');
  const chatMessageInput = chatWindow.querySelector('#chatMessageInput');
  const chatFileInput = chatWindow.querySelector('#chatFileInput');
  const messageText = chatMessageInput.value.trim();
  const file = chatFileInput.files[0];
  if (!messageText && !file) {
    showToast('Введите сообщение или выберите файл', 'error');
    return;
  }
  if (file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataURL = e.target.result;
      await addMessage(userEmail, {
        from: 'admin',
        text: '',
        fileName: file.name,
        fileData: dataURL,
        date: new Date().toLocaleString()
      });
      chatFileInput.value = '';
      chatMessageInput.value = '';
      await renderChatHistory(userEmail);
      triggerNotification(userEmail, 'Новое сообщение с файлом');
    };
    reader.readAsDataURL(file);
  } else {
    await addMessage(userEmail, {
      from: 'admin',
      text: messageText,
      fileName: '',
      fileData: '',
      date: new Date().toLocaleString()
    });
    chatMessageInput.value = '';
    await renderChatHistory(userEmail);
    triggerNotification(userEmail, 'Новое сообщение: ' + messageText);
  }
}

/**
 * Добавление сообщения в чат.
 */
async function addMessage(userEmail, message) {
  const chatsData = await getItem('adminChats');
  let allChats = chatsData ? JSON.parse(chatsData) : {};
  if (!allChats[userEmail]) {
    allChats[userEmail] = [];
  }
  allChats[userEmail].push(message);
  await setItem('adminChats', JSON.stringify(allChats));
  // Если окно не активно, выдаём уведомление
  if (document.hidden) {
    triggerNotification(userEmail, message.text || '[файл]');
  }
}

/**
 * Функция для запуска браузерных уведомлений.
 */
function triggerNotification(userEmail, messageText) {
  if (!("Notification" in window)) {
    console.log("Этот браузер не поддерживает уведомления.");
    return;
  }
  if (Notification.permission === "granted") {
    new Notification("Чат с " + userEmail, { body: messageText });
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then(permission => {
      if (permission === "granted") {
        new Notification("Чат с " + userEmail, { body: messageText });
      }
    });
  }
}

/**
 * Инициализация чатов при загрузке страницы.
 */
export async function initChat() {
  await renderChatList();
}