/* userCabinet.js */
import { showToast } from './utils.js';
import { getItem, setItem } from './dbStorage.js';

export async function renderUserCabinet() {
  const details = document.querySelector('.details');
  const curUserData = await getItem('currentUser');
  const curUser = curUserData ? JSON.parse(curUserData) : {};

  // Если пользователь не user — нет доступа
  if (!curUser || curUser.role !== 'user') {
    details.innerHTML = '<h1>Доступно только для пользователей.</h1>';
    return;
  }

  // Берём баланс (если нет, ставим 0)
  const currentBalance = curUser.currentBalance || 0;

  // Остальные поля для "Мои данные", "Уведомления" и т.д.
  const {
    email,
    companyName,
    inn,
    address,
    bankName,
    bik,
    accountNumber,
    feePercent,
    agreementNo,
    agreementDate,
    notifications = []
  } = curUser;

  // Генерация HTML для уведомлений
  let notificationsHtml = '';
  if (!notifications.length) {
    notificationsHtml = '<p>Нет уведомлений.</p>';
  } else {
    notificationsHtml = '<ul>';
    notifications.forEach(ntf => {
      notificationsHtml += `<li><strong>${ntf.date || ''}</strong> — ${ntf.text}</li>`;
    });
    notificationsHtml += '</ul>';
  }

  // Собираем итоговый HTML
  details.innerHTML = `
    <!-- Вместо Личный кабинет показываем “Мой баланс: ...” -->
    <h1>Мой баланс: ${currentBalance.toFixed(2)} руб.</h1>

    <hr>
    <!-- Блок “Мои данные” -->
    <div class="user-info-card" style="margin-bottom:20px;">
      <h3>Мои данные</h3>
      <div class="info-row"><label>Email:</label> <span>${email}</span></div>
      <div class="info-row"><label>Компания:</label> <span>${companyName || ''}</span></div>
      <div class="info-row"><label>ИНН:</label> <span>${inn || ''}</span></div>
      <div class="info-row"><label>Адрес:</label> <span>${address || ''}</span></div>
      <div class="info-row"><label>Банк:</label> <span>${bankName || ''}</span></div>
      <div class="info-row"><label>БИК:</label> <span>${bik || ''}</span></div>
      <div class="info-row"><label>Счёт:</label> <span>${accountNumber || ''}</span></div>
      <div class="info-row"><label>Ставка %:</label> <span>${feePercent || 0}%</span></div>
      <div class="info-row"><label>Договор №:</label> <span>${agreementNo || ''}</span></div>
      <div class="info-row"><label>Дата дог.:</label> <span>${agreementDate || ''}</span></div>
    </div>

    <!-- Блок “Уведомления” -->
    <div class="user-notifications" style="margin-bottom:20px;">
      <h3>Мои уведомления</h3>
      ${notificationsHtml}
    </div>

    <!-- Чат с администратором -->
    <h3>Чат с администратором</h3>
    <div class="chat-header" style="margin-bottom:10px;">
      <span>Статус: <span id="userChatStatus">Онлайн</span></span>
    </div>
    <div id="userChatBox" style="
      position:relative;
      border:1px solid #ccc;
      border-radius:8px;
      height:300px;
      overflow-y:auto;
      margin-bottom:10px;
      padding:10px;
    "></div>
    <div class="scroll-to-bottom-btn" id="scrollToBottomUser">↓</div>

    <div style="display:flex; gap:5px; margin-top:10px;">
      <input type="file" id="userChatFile" style="display:none;">
      <button id="userAttachFileBtn" class="button button-sm">📎</button>
      <!-- Имя выбранного файла -->
      <div id="userSelectedFileName" style="
        width:120px;
        font-size:0.9em;
        color:#555;
        overflow:hidden;
        white-space:nowrap;
        text-overflow:ellipsis;
      "></div>

      <input type="text" id="userChatInput" placeholder="Написать администратору..." style="flex:1;">
      <button id="userChatSendBtn" class="button button-sm">Отправить</button>
    </div>

    <div style="margin-top:10px;">
      <button id="userFontMinusBtn" class="button button-sm button-outline">A-</button>
      <button id="userFontPlusBtn" class="button button-sm button-outline">A+</button>
    </div>
  `;

  // Инициализируем логику чата
  initUserAdminChat(curUser);
}

async function initUserAdminChat(curUser) {
  const chatBox           = document.getElementById('userChatBox');
  const chatFile          = document.getElementById('userChatFile');
  const userAttachFileBtn = document.getElementById('userAttachFileBtn');
  const chatInput         = document.getElementById('userChatInput');
  const chatSendBtn       = document.getElementById('userChatSendBtn');
  const scrollToBottomBtn = document.getElementById('scrollToBottomUser');
  const userFontMinusBtn  = document.getElementById('userFontMinusBtn');
  const userFontPlusBtn   = document.getElementById('userFontPlusBtn');
  const userSelectedFile  = document.getElementById('userSelectedFileName');

  let currentFontSize = 14;
  let chatIntervalId  = null;

  // Кнопки изменения шрифта
  userFontMinusBtn.addEventListener('click', () => {
    currentFontSize = Math.max(12, currentFontSize - 1);
    chatBox.style.fontSize = currentFontSize + 'px';
  });
  userFontPlusBtn.addEventListener('click', () => {
    currentFontSize = Math.min(24, currentFontSize + 1);
    chatBox.style.fontSize = currentFontSize + 'px';
  });

  // Прокрутка вниз
  scrollToBottomBtn.addEventListener('click', () => {
    chatBox.scrollTop = chatBox.scrollHeight;
  });
  function checkScrollBtnVisibility() {
    const distFromBottom = chatBox.scrollHeight - chatBox.scrollTop - chatBox.clientHeight;
    if (distFromBottom > 50) {
      scrollToBottomBtn.classList.add('show');
    } else {
      scrollToBottomBtn.classList.remove('show');
    }
  }
  chatBox.addEventListener('scroll', checkScrollBtnVisibility);

  // Чтение чатов из IndexedDB
  const userEmail = curUser.email;
  const chatsData = await getItem('adminChats');
  let allChats    = chatsData ? JSON.parse(chatsData) : {};
  if (!allChats[userEmail]) {
    allChats[userEmail] = [];
  }
  let chatArr = allChats[userEmail];

  // Рендер сообщений
  function renderChat() {
    chatBox.innerHTML = '';
    chatArr.forEach(msg => {
      const msgDiv = document.createElement('div');
      msgDiv.classList.add('chat-message');
      if (msg.from === 'user') {
        msgDiv.classList.add('user-message');
      } else if (msg.from === 'admin') {
        msgDiv.classList.add('admin-message');
      } else {
        msgDiv.classList.add('system-message');
      }

      const avatar = document.createElement('img');
      avatar.classList.add('chat-avatar');
      if (msg.from === 'user') {
        avatar.src = 'src/images/user_avatar.png';
      } else if (msg.from === 'admin') {
        avatar.src = 'src/images/admin_avatar.png';
      } else {
        avatar.src = 'src/images/system_avatar.png';
      }

      const contentDiv = document.createElement('div');
      contentDiv.classList.add('message-content');

      let contentHtml = '';
      if (msg.fileName) {
        contentHtml = `<a href="${msg.fileData}" download="${msg.fileName}">${msg.fileName}</a>`;
      } else {
        contentHtml = msg.text;
      }
      const dateHtml = `<div class="chat-date">${msg.date}</div>`;

      contentDiv.innerHTML = contentHtml + dateHtml;
      msgDiv.appendChild(avatar);
      msgDiv.appendChild(contentDiv);
      chatBox.appendChild(msgDiv);
    });
    allChats[userEmail] = chatArr;
    setItem('adminChats', JSON.stringify(allChats));

    // Автопрокрутка в конец
    chatBox.scrollTop = chatBox.scrollHeight;
    checkScrollBtnVisibility();
  }
  renderChat();

  // Показываем имя выбранного файла
  chatFile.addEventListener('change', () => {
    if (chatFile.files[0]) {
      userSelectedFile.textContent = chatFile.files[0].name;
    } else {
      userSelectedFile.textContent = '';
    }
  });

  // Логика отправки
  userAttachFileBtn.addEventListener('click', () => chatFile.click());
  chatSendBtn.addEventListener('click', sendMsg);
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendMsg();
    }
  });

  function sendMsg() {
    const file = chatFile.files[0];
    const txt  = chatInput.value.trim();
    if (!file && !txt) {
      showToast('Введите сообщение или выберите файл', 'error');
      return;
    }
    // Формируем объект сообщения
    let msgObj = {
      userEmail,
      from: 'user',
      text: '',
      fileName: '',
      fileData: '',
      date: new Date().toLocaleString()
    };
    if (file) {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        msgObj.fileName = file.name;
        msgObj.fileData = ev.target.result;
        chatArr.push(msgObj);
        allChats[userEmail] = chatArr;
        await setItem('adminChats', JSON.stringify(allChats));

        // Сброс
        chatFile.value = '';
        userSelectedFile.textContent = '';
        chatInput.value = '';
        renderChat();
      };
      reader.readAsDataURL(file);
    } else {
      msgObj.text = txt;
      chatArr.push(msgObj);
      allChats[userEmail] = chatArr;
      setItem('adminChats', JSON.stringify(allChats));

      chatInput.value = '';
      renderChat();
    }
  }

  // Автообновление чата
  function startChatInterval() {
    if (chatIntervalId) clearInterval(chatIntervalId);
    chatIntervalId = setInterval(async () => {
      const updatedData = await getItem('adminChats');
      const updatedAll  = updatedData ? JSON.parse(updatedData) : {};
      chatArr = updatedAll[userEmail] || [];
      renderChat();
    }, 5000);
  }
  startChatInterval();
}