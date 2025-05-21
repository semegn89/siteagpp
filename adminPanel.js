/* adminPanel.js */
import { showToast, readFileAndStore } from './utils.js';
import { getItem, setItem } from './dbStorage.js';
import { renderAdminStats } from './statsAdmin.js';

/**
 * Рендер админ-панели. Доступно только для пользователей с role==='admin'.
 */
export async function renderAdminPanel() {
  const details = document.querySelector('.details');
  // Проверяем роль
  const currentUserData = await getItem('currentUser');
  const currentUser = currentUserData ? JSON.parse(currentUserData) : {};

  if (!currentUser || currentUser.role !== 'admin') {
    details.innerHTML = '<h1>Доступ запрещён. Вы не админ.</h1>';
    return;
  }

  details.innerHTML = `
    <h1>Админ-панель</h1>
    <p>Управляйте пользователями, платежами, документами, шаблонами, а также просматривайте чаты.</p>
    <div style="margin-top:20px;" id="adminActions"></div>
  `;

  const adminActions = details.querySelector('#adminActions');
  adminActions.innerHTML = `
    <button id="manageChatsBtn" class="button">Чаты</button>
    <button id="manageUsersBtn" class="button" style="margin-left:10px;">Пользователи</button>
    <button id="manageRatesBtn" class="button" style="margin-left:10px;">Редактировать курсы</button>
    <button id="manageStatsBtn" class="button" style="margin-left:10px;">Статистика (маржа)</button>
    <div id="adminContent" style="margin-top:30px;"></div>
  `;

  const manageChatsBtn = adminActions.querySelector('#manageChatsBtn');
  const manageUsersBtn = adminActions.querySelector('#manageUsersBtn');
  const manageRatesBtn = adminActions.querySelector('#manageRatesBtn');
  const manageStatsBtn = adminActions.querySelector('#manageStatsBtn');
  const adminContent   = adminActions.querySelector('#adminContent');

  manageChatsBtn.addEventListener('click', renderAdminChats);
  manageUsersBtn.addEventListener('click', renderAdminUsers);
  manageRatesBtn.addEventListener('click', renderAdminRates);
  manageStatsBtn.addEventListener('click', renderAdminStats);

  // --- Чаты с пользователями ---
  async function renderAdminChats() {
    const chatsData = await getItem('adminChats');
    let allChats = chatsData ? JSON.parse(chatsData) : {};
    let userEmails = Object.keys(allChats);

    adminContent.innerHTML = `
      <h3>Чаты с пользователями</h3>
      <div style="margin-bottom:10px;">
        <input type="text" id="chatSearchInput" placeholder="Поиск по email..." style="padding:5px;">
        <button id="chatSearchBtn" class="button button-sm" style="margin-left:5px;">Поиск</button>
      </div>
      <div id="chatCardsContainer" style="display:flex; flex-wrap:wrap; gap:20px;"></div>
    `;
    const chatSearchInput    = adminContent.querySelector('#chatSearchInput');
    const chatSearchBtn      = adminContent.querySelector('#chatSearchBtn');
    const chatCardsContainer = adminContent.querySelector('#chatCardsContainer');

    chatSearchBtn.addEventListener('click', () => {
      const term = chatSearchInput.value.trim().toLowerCase();
      renderChatCards(term);
    });

    function renderChatCards(searchTerm='') {
      chatCardsContainer.innerHTML = '';
      let filtered = userEmails;
      if (searchTerm) {
        filtered = userEmails.filter(em => em.toLowerCase().includes(searchTerm));
      }
      if (!filtered.length) {
        chatCardsContainer.innerHTML = '<p>Нет чатов с таким запросом.</p>';
        return;
      }

      filtered.forEach(email => {
        const chatArr = allChats[email] || [];
        const hasUnread = chatArr.some(m => m.from === 'user' && !m.readByAdmin);

        const card = document.createElement('div');
        card.style.width = '7cm';
        card.style.height= '7cm';
        card.style.border= '1px solid #ccc';
        card.style.borderRadius= '8px';
        card.style.padding= '10px';
        card.style.display= 'flex';
        card.style.flexDirection= 'column';
        card.style.justifyContent= 'space-between';

        card.innerHTML = `
          <div>
            <h4 style="margin-bottom:5px;">${email}</h4>
            ${
              hasUnread
                ? `<p style="color:red;">Непрочитанные сообщения</p>`
                : `<p style="color:green;">Все прочитано</p>`
            }
          </div>
          <button class="openChatBtn button button-sm">Открыть чат</button>
        `;
        card.querySelector('.openChatBtn').addEventListener('click', () => {
          showAdminChatDetail(email);
        });
        chatCardsContainer.appendChild(card);
      });
    }

    renderChatCards();
  }

  let chatIntervalId = null;
  async function showAdminChatDetail(userEmail) {
    adminContent.innerHTML = `
      <h4>Чат с ${userEmail}</h4>
      <div id="adminChatHistory" style="margin-bottom:10px; height:300px; overflow-y:auto; border:1px solid #ccc; padding:10px;"></div>
      <div style="display:flex; gap:5px;">
        <input type="file" id="adminChatFile" style="width:160px; display:none;" />
        <button id="adminAttachFileBtn" class="button button-sm">📎</button>
        <input type="text" id="adminMsgInput" placeholder="Ответ пользователю..." style="flex:1;">
        <button id="adminSendBtn" class="button button-sm">Отправить</button>
      </div>
    `;

    const adminChatHistory   = document.getElementById('adminChatHistory');
    const adminMsgInput      = document.getElementById('adminMsgInput');
    const adminChatFile      = document.getElementById('adminChatFile');
    const adminAttachFileBtn = document.getElementById('adminAttachFileBtn');
    const adminSendBtn       = document.getElementById('adminSendBtn');

    let chatsData = await getItem('adminChats');
    let allChats  = chatsData ? JSON.parse(chatsData) : {};
    let userChat  = allChats[userEmail] || [];

    function renderAdminMessages() {
      adminChatHistory.innerHTML = '';
      userChat.forEach(msg => {
        if (msg.from === 'user') {
          msg.readByAdmin = true;
        }
        const wrap = document.createElement('div');
        wrap.className = `chat-message ${msg.from==='user' ? 'user-message' : 'admin-message'}`;

        let avatarSrc = (msg.from==='user')
          ? 'src/images/user_avatar.png'
          : 'src/images/admin_avatar.png';

        let contentHtml = msg.text || '';
        if (msg.fileName) {
          contentHtml = `<a href="${msg.fileData}" download="${msg.fileName}">${msg.fileName}</a>`;
        }
        wrap.innerHTML = `
          <img class="chat-avatar" src="${avatarSrc}" alt="avatar">
          <div>
            <div class="message-content">${contentHtml}</div>
            <div class="chat-date">${msg.date}</div>
          </div>
        `;
        adminChatHistory.appendChild(wrap);
      });
      adminChatHistory.scrollTop = adminChatHistory.scrollHeight;
      allChats[userEmail] = userChat;
      setItem('adminChats', JSON.stringify(allChats));
    }

    renderAdminMessages();

    if (chatIntervalId) clearInterval(chatIntervalId);
    chatIntervalId = setInterval(async () => {
      const cData = await getItem('adminChats');
      let newAll = cData ? JSON.parse(cData) : {};
      userChat = newAll[userEmail] || [];
      renderAdminMessages();
    }, 5000);

    adminAttachFileBtn.addEventListener('click', () => {
      adminChatFile.click();
    });
    adminSendBtn.addEventListener('click', sendAdminMsg);
    adminMsgInput.addEventListener('keypress', (e)=>{
      if (e.key==='Enter') sendAdminMsg();
    });

    async function sendAdminMsg() {
      const txt = adminMsgInput.value.trim();
      const file = adminChatFile.files[0];

      if (!txt && !file) {
        showToast('Введите текст или выберите файл', 'error');
        return;
      }

      if (file) {
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const dataURL = ev.target.result;
          const msgObj = {
            userEmail,
            from: 'admin',
            text: '',
            fileName: file.name,
            fileData: dataURL,
            date: new Date().toLocaleString()
          };
          userChat.push(msgObj);
          allChats[userEmail] = userChat;
          await setItem('adminChats', JSON.stringify(allChats));
          adminChatFile.value = '';
          adminMsgInput.value = '';
          renderAdminMessages();
        };
        reader.readAsDataURL(file);
      } else {
        const msgObj = {
          userEmail,
          from: 'admin',
          text: txt,
          fileName: '',
          fileData: '',
          date: new Date().toLocaleString()
        };
        userChat.push(msgObj);
        allChats[userEmail] = userChat;
        await setItem('adminChats', JSON.stringify(allChats));
        adminMsgInput.value = '';
        renderAdminMessages();
      }
    }
  }

  /* ---------------------------------------------
     2) УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ
  --------------------------------------------- */
  async function renderAdminUsers() {
    const usersData = await getItem('users');
    const users = usersData ? JSON.parse(usersData) : [];
    const filtered = users.filter(u => u.role !== 'admin');

    adminContent.innerHTML = `
      <h3>Список пользователей</h3>
      <div style="margin-bottom:10px;">
        <input type="text" id="userSearchInput" placeholder="Поиск по email или ИНН..." style="padding:5px;">
        <button id="userSearchBtn" class="button button-sm" style="margin-left:5px;">Искать</button>
      </div>
      <div id="usersCardsContainer" style="display:flex; flex-wrap:wrap; gap:20px;"></div>
    `;

    const userSearchInput = adminContent.querySelector('#userSearchInput');
    const userSearchBtn   = adminContent.querySelector('#userSearchBtn');
    const usersCardsContainer = adminContent.querySelector('#usersCardsContainer');

    userSearchBtn.addEventListener('click', () => {
      const val = userSearchInput.value.trim().toLowerCase();
      renderUsersCards(val);
    });

    function renderUsersCards(searchTerm='') {
      usersCardsContainer.innerHTML = '';

      let data = filtered;
      if (searchTerm) {
        data = data.filter(u =>
          (u.email.toLowerCase().includes(searchTerm)) ||
          ((u.inn||'').toLowerCase().includes(searchTerm))
        );
      }
      if (!data.length) {
        usersCardsContainer.innerHTML = '<p>Нет пользователей с таким запросом.</p>';
        return;
      }

      data.forEach(u => {
        const card = document.createElement('div');
        card.style.width = '7cm';
        card.style.height= '7cm';
        card.style.border= '1px solid #ccc';
        card.style.borderRadius= '8px';
        card.style.padding= '10px';
        card.style.display= 'flex';
        card.style.flexDirection= 'column';
        card.style.justifyContent= 'space-between';

        card.innerHTML = `
          <div style="margin-bottom:5px;">
            <h4 style="margin:0;">${u.email}</h4>
            <p style="font-size:14px;">ИНН: ${u.inn || '—'}</p>
            <p style="font-size:14px;">Ставка в %: ${u.feePercent}%</p>
          </div>
          <button class="editUserBtn button button-sm">Редактировать</button>
        `;

        card.querySelector('.editUserBtn').addEventListener('click', ()=>{
          showEditUserForm(u.email);
        });
        usersCardsContainer.appendChild(card);
      });
    }

    renderUsersCards();
  }

  // В adminPanel.js, внутри showEditUserForm(userEmail):
// Внутри adminPanel.js, функция showEditUserForm обновлена:

async function showEditUserForm(userEmail) {
  const usersData = await getItem('users');
  let users = usersData ? JSON.parse(usersData) : [];
  let userObj = users.find(u => u.email === userEmail);
  if (!userObj) {
    showToast('Пользователь не найден', 'error');
    return;
  }
  const adminContent = document.getElementById('adminContent');
  adminContent.innerHTML = `
    <h4>Редактировать пользователя: ${userObj.email}</h4>
    <form id="adminEditUserForm">
      <div class="form-row">
        <label>Компания:</label>
        <input type="text" name="companyName" value="${userObj.companyName || ''}">
      </div>
      <div class="form-row">
        <label>ИНН:</label>
        <input type="text" name="inn" value="${userObj.inn || ''}">
      </div>
      <div class="form-row">
        <label>Адрес:</label>
        <input type="text" name="address" value="${userObj.address || ''}">
      </div>
      <div class="form-row">
        <label>Название банка:</label>
        <input type="text" name="bankName" value="${userObj.bankName || ''}">
      </div>
      <div class="form-row">
        <label>БИК:</label>
        <input type="text" name="bik" value="${userObj.bik || ''}">
      </div>
      <div class="form-row">
        <label>Номер счёта:</label>
        <input type="text" name="accountNumber" value="${userObj.accountNumber || ''}">
      </div>
      <div class="form-row">
        <label>Ставка в %:</label>
        <input type="number" step="0.01" name="feePercent" value="${userObj.feePercent || 0}">
      </div>
      <div class="form-row">
        <label>Баланс (руб):</label>
        <input type="number" step="0.01" name="currentBalance" value="${userObj.currentBalance || 0}">
      </div>
      <div class="form-row">
        <label>Договор №:</label>
        <input type="text" name="agreementNo" value="${userObj.agreementNo || ''}">
      </div>
      <div class="form-row">
        <label>Дата договора:</label>
        <input type="text" name="agreementDate" value="${userObj.agreementDate || ''}">
      </div>
      <div class="form-row">
        <label>Генеральный директор:</label>
        <input type="text" name="directorName" value="${userObj.directorName || ''}">
      </div>
      <button type="submit" class="button">Сохранить</button>
    </form>
    <hr>
    <h4>Отправить уведомление этому пользователю</h4>
    <input type="text" id="adminNotifyText" style="width:80%;" placeholder="Введите текст...">
    <button id="adminNotifyBtn" class="button button-sm">Отправить уведомление</button>
  `;

  const adminEditUserForm = document.getElementById('adminEditUserForm');
  const adminNotifyText   = document.getElementById('adminNotifyText');
  const adminNotifyBtn    = document.getElementById('adminNotifyBtn');

  adminEditUserForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(adminEditUserForm);
    const newData = {
      companyName: fd.get('companyName') || '',
      inn: fd.get('inn') || '',
      address: fd.get('address') || '',
      bankName: fd.get('bankName') || '',
      bik: fd.get('bik') || '',
      accountNumber: fd.get('accountNumber') || '',
      feePercent: parseFloat(fd.get('feePercent')) || 0,
      currentBalance: parseFloat(fd.get('currentBalance')) || 0,
      agreementNo: fd.get('agreementNo') || '',
      agreementDate: fd.get('agreementDate') || '',
      directorName: fd.get('directorName') || ''
    };

    let idx = users.findIndex(x => x.email === userEmail);
    if (idx !== -1) {
      users[idx] = { ...users[idx], ...newData };
      await setItem('users', JSON.stringify(users));
      showToast('Пользователь обновлён!', 'success');
    }
  });

  adminNotifyBtn.addEventListener('click', async () => {
    const txt = adminNotifyText.value.trim();
    if (!txt) {
      showToast('Введите текст уведомления', 'error');
      return;
    }
    let idx = users.findIndex(x => x.email === userEmail);
    if (idx === -1) return;
    if (!users[idx].notifications) {
      users[idx].notifications = [];
    }
    users[idx].notifications.push({
      date: new Date().toLocaleString(),
      text: txt
    });
    await setItem('users', JSON.stringify(users));
    showToast('Уведомление добавлено!', 'success');
    adminNotifyText.value = '';
  });
}

  /* ---------------------------------------------
     3) РЕДАКТИРОВАНИЕ КУРСОВ ВАЛЮТ
  --------------------------------------------- */
  const flagsMap = {
    RUB: 'src/images/flags/ru.png',
    USD: 'src/images/flags/us.png',
    EUR: 'src/images/flags/eu.png',
    AED: 'src/images/flags/ae.png',
    CNY: 'src/images/flags/cn.png',
    GBP: 'src/images/flags/gb.png'
  };

  async function renderAdminRates() {
    // Значения по умолчанию
    let defRates = { RUB: 1, AED: 22, USD: 88, EUR: 94, CNY: 14, GBP: 122 };

    // Текущие курсы
    const ratesData = await getItem('adminRates');
    let rates = ratesData ? JSON.parse(ratesData) : defRates;

    // История курсов
    const ratesHistoryData = await getItem('adminRatesHistory');
    let ratesHistory = ratesHistoryData ? JSON.parse(ratesHistoryData) : [];
    if (!ratesHistory.length) {
      ratesHistory.push({
        date: new Date().toLocaleString(),
        rates: { ...rates }
      });
    }
    // отображаем историю курсов в виде списка
    const ratesHistoryList = document.getElementById('ratesHistoryList');
    ratesHistoryList.innerHTML = '';
    ratesHistory.forEach(item => {
      const listItem = document.createElement('li');
      listItem.textContent = `${item.date}: ${JSON.stringify(item.rates)}`;
      ratesHistoryList.appendChild(listItem);
    }
    );
    // Отображаем флаги валют
    const details = document.querySelector('.details');
    details.style.background = 'rgba(255,255,255,1)';
    const adminContent = document.getElementById('adminContent');
    adminContent.innerHTML = `
      <h1>Редактирование курсов валют</h1>
      <p>Здесь вы можете редактировать курсы валют для пользователей.</p>
    `;
    const ratesTable = document.createElement('table');
    ratesTable.className = 'rates-table';
    ratesTable.innerHTML = `
      <thead>
        <tr>
          <th>Валюта</th>
          <th style="padding: 0 30px;">Курс ЦБ</th>
          <th style="padding: 0 30px;">Курс Агента</th>
        </tr>
      </thead>
      <tbody>
    `;
    for (let cur in rates) {
      const cbRate = rates[cur].cb;
      const agentRate = rates[cur].agent;
      const flagSrc = flagsMap[cur] || 'src/images/flags/default.png';
      ratesTable.innerHTML += `
        <tr>
          <td>
            <img src="${flagSrc}" alt="${cur}" class="flag-icon">
            <span>${cur}</span>
          </td>
          <td style="text-align:right;">${cbRate.toFixed(2)}</td>
          <td style="text-align:right;">${agentRate.toFixed(2)}</td>
        </tr>
      `;
    }
    ratesTable.innerHTML += `
      </tbody>
    </table>
    `;
    adminContent.appendChild(ratesTable);
    // Если админ, показываем форму редактирования
    const isAdmin = (currentUser.role === 'admin');
    if (isAdmin) {
      // Добавляем кнопку "Редактировать"
      const editBtn = document.createElement('button');
      editBtn.textContent = 'Редактировать курсы';
      editBtn.className = 'button';
      editBtn.style.marginTop = '20px';
      adminContent.appendChild(editBtn);

      // Обработчик клика по кнопке редактирования
      editBtn.addEventListener('click', () => {
        renderEditRatesForm(rates, ratesHistory);
      });
    }
  }
  // Функция для отображения формы редактирования курсов валют
  function renderEditRatesForm(rates, ratesHistory) {
    const adminContent = document.getElementById('adminContent');
    // Очищаем контент
    adminContent.innerHTML = '';

    adminContent.innerHTML = `
      <h3>Редактировать курсы (1 Валюта = X RUB)</h3>
      <form id="ratesForm">
        <table class="rates-edit-table" style="width:100%; border-collapse: collapse;">
          <thead>
            <tr>
              <th style="border:1px solid #ccc; padding:5px;">Валюта</th>
              <th style="border:1px solid #ccc; padding:5px;">Курс ЦБ</th>
              <th style="border:1px solid #ccc; padding:5px;">Курс Агента</th>
            </tr>
          </thead>
          <tbody>
            ${Object.keys(rates).map(cur => {
              if (typeof rates[cur] === 'number') {
                rates[cur] = { cb: rates[cur], agent: rates[cur] };
              }
              const flagSrc = flagsMap[cur] || 'src/images/flags/default.png';
              return `
                <tr>
                  <td style="border:1px solid #ccc; padding:5px;">
                    <img src="${flagSrc}" alt="${cur}" class="flag-icon" style="width:24px; vertical-align:middle; margin-right:5px;">
                    <span>${cur}</span>
                  </td>
                  <td style="border:1px solid #ccc; padding:5px; text-align:right;">
                    <input type="number" step="0.01" name="cb_${cur}" value="${rates[cur].cb}" style="width:80px;">
                  </td>
                  <td style="border:1px solid #ccc; padding:5px; text-align:right;">
                    <input type="number" step="0.01" name="agent_${cur}" value="${rates[cur].agent}" style="width:80px;">
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        <button type="submit" class="button" style="margin-top:10px;">Сохранить</button>
      </form>

      <h3>Архив курсов</h3>
      <div id="ratesHistoryList"></div>
      <button id="downloadArchiveBtn" class="button" style="margin-top:10px;">Скачать архив</button>
    `;

    const ratesForm        = document.getElementById('ratesForm');
    const ratesHistoryList = document.getElementById('ratesHistoryList');

    // При сохранении
    ratesForm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const fd = new FormData(ratesForm);

      Object.keys(rates).forEach(cur => {
        const cbVal    = parseFloat(fd.get(`cb_${cur}`)) || 1;
        const agentVal = parseFloat(fd.get(`agent_${cur}`)) || cbVal;
        rates[cur].cb    = cbVal;
        rates[cur].agent = agentVal;
      });

      // Архивируем предыдущую версию
      ratesHistory.push({
        date: new Date().toLocaleString(),
        rates: { ...rates } // сохраняем старые значения
      });

      await setItem('adminRatesHistory', JSON.stringify(ratesHistory));
      await setItem('adminRates', JSON.stringify(rates));
      showToast('Курсы валют обновлены!', 'success');
      renderAdminRates();
    });

    // Показ архива
    function renderRatesHistory() {
      if (!ratesHistory.length) {
        ratesHistoryList.innerHTML = '<p>Архив пуст.</p>';
        return;
      }
      let html = '<ul>';
      ratesHistory.forEach(item => {
        html += `<li style="margin-bottom:5px;"><strong>${item.date}</strong>: `;
        for (let c in item.rates) {
          html += `${c} => ЦБ=${item.rates[c].cb}, Агента=${item.rates[c].agent}; `;
        }
        html += `</li>`;
      });
      html += '</ul>';
      ratesHistoryList.innerHTML = html;
    }
    renderRatesHistory();

    const downloadBtn = document.getElementById('downloadArchiveBtn');
    downloadBtn.addEventListener('click', ()=>{
      const archiveStr = JSON.stringify(ratesHistory, null, 2);
      const blob       = new Blob([archiveStr], { type:'application/json' });
      const url        = URL.createObjectURL(blob);
      const a          = document.createElement('a');
      a.href           = url;
      a.download       = 'rates_archive.json';
      a.click();
      URL.revokeObjectURL(url);
    });
  }
}