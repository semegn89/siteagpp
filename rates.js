import { showToast } from './utils.js';
import { getItem, setItem } from './dbStorage.js';

// Объект с флагами для валют
const flagsMap = {
  RUB: 'src/images/flags/ru.png',
  USD: 'src/images/flags/us.png',
  EUR: 'src/images/flags/eu.png',
  AED: 'src/images/flags/ae.png',
  CNY: 'src/images/flags/cn.png',
  GBP: 'src/images/flags/gb.png'
};

export async function renderRatesPage() {
  const defaultRates = {
    RUB: { cb: 1, agent: 1 },
    USD: { cb: 76, agent: 88 },
    EUR: { cb: 80, agent: 94 },
    AED: { cb: 20, agent: 22 },
    CNY: { cb: 12, agent: 14 },
    GBP: { cb: 115, agent: 122 }
  };

  // Загружаем курсы из IndexedDB
  const ratesData = await getItem('adminRates2');
  const rates = ratesData ? JSON.parse(ratesData) : defaultRates;

  // Загружаем архив курсов (если есть)
  const historyData = await getItem('adminRatesHistory');
  let ratesHistory = historyData ? JSON.parse(historyData) : [];
  if (!ratesHistory) {
    ratesHistory = [];
  }
  // Если архив пуст, добавляем текущие курсы в архив
  if (ratesHistory.length === 0) {
    ratesHistory.push({
      date: new Date().toLocaleString(),
      rates: { ...rates }
    });
    await setItem('adminRatesHistory', JSON.stringify(ratesHistory));
  }
  // Если курсы не загружены, используем дефолтные
  if (!rates) {
    rates = defaultRates;
  }

  // Загружаем текущего пользователя (проверка isAdmin)
  const currentUserData = await getItem('currentUser');
  const currentUser = currentUserData ? JSON.parse(currentUserData) : {};
  const isAdmin = (currentUser.role === 'admin');

  const details = document.querySelector('.details');
  details.style.background = 'rgba(255,255,255,1)';

  let html = `<h1>Курсы валют</h1>`;

  if (!isAdmin) {
    html += `
      <table class="rates-table">
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
      html += `
        <tr>
          <td>
            <img src="${flagSrc}" alt="${cur}" class="flag-icon">
            <span>${cur}</span>
          </td>
          <td style="padding: 0 30px;">${cbRate}</td>
          <td style="padding: 0 30px;">${agentRate}</td>
        </tr>
      `;
    }
    html += `
        </tbody>
      </table>
    `;
  }

  // Если админ, показываем форму редактирования
  if (isAdmin) {
    html += `
      <h3>Редактировать курсы (1 Валюта = X RUB)</h3>
      <form id="ratesEditForm" style="margin-bottom:20px;">
        <table class="rates-edit-table">
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
      const flagSrc = flagsMap[cur] || 'src/images/flags/default.png';
      html += `
        <tr>
          <td>
            <img src="${flagSrc}" alt="${cur}" class="flag-icon">
            <span>${cur}</span>
          </td>
          <td style="padding: 0 30px;">
            <input type="number" step="0.01" name="cb_${cur}" value="${rates[cur].cb}" style="width:80px;">
          </td>
          <td style="padding: 0 30px;">
            <input type="number" step="0.01" name="agent_${cur}" value="${rates[cur].agent}" style="width:80px;">
          </td>
        </tr>
      `;
    }
    html += `
          </tbody>
        </table>
        <button type="submit" class="button" style="margin-top:10px;">Сохранить</button>
      </form>
      <h3>Архив курсов</h3>
    `;
    if (ratesHistory.length === 0) {
      html += `<p>Архив пуст.</p>`;
    } else {
      html += `<ul>`;
      ratesHistory.forEach(item => {
        html += `<li><strong>${item.date}</strong>: `;
        for (let c in item.rates) {
          html += `${c} => ЦБ=${item.rates[c].cb}, Агента=${item.rates[c].agent}; `;
        }
        html += `</li>`;
      });
      html += `</ul>`;
    }
    // Кнопка для скачивания архива
    html += `<button id="downloadArchiveBtn" class="button" style="margin-top:10px;">Скачать архив</button>`;
  }

  details.innerHTML = html;

  // Если админ, навешиваем обработчик для формы редактирования
  if (isAdmin) {
    const ratesEditForm = document.getElementById('ratesEditForm');
    ratesEditForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Архивируем текущие курсы
      const historyData = await getItem('adminRatesHistory');
      let ratesHistory = historyData ? JSON.parse(historyData) : [];
      ratesHistory.push({
        date: new Date().toLocaleString(),
        rates: { ...rates }
      });
      await setItem('adminRatesHistory', JSON.stringify(ratesHistory));

      // Собираем новые значения из формы
      const fd = new FormData(ratesEditForm);
      for (let cur in rates) {
        const cbName = `cb_${cur}`;
        const agentName = `agent_${cur}`;
        const newCb = parseFloat(fd.get(cbName)) || 1;
        const newAgent = parseFloat(fd.get(agentName)) || 1;
        rates[cur].cb = newCb;
        rates[cur].agent = newAgent;
      }

      // Сохраняем обновлённые курсы
      await setItem('adminRates2', JSON.stringify(rates));
      showToast('Курсы валют обновлены!', 'success');
      renderRatesPage();
    });

    const downloadBtn = document.getElementById('downloadArchiveBtn');
    downloadBtn.addEventListener('click', () => {
      const archiveStr = JSON.stringify(ratesHistory, null, 2);
      const blob = new Blob([archiveStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'rates_archive.json';
      a.click();
      URL.revokeObjectURL(url);
    });
  }
}
const style = document.createElement('style');
style.textContent = `
  .flag-icon {
    width: 24px;
    height: 14px;
    object-fit: contain;
    border-radius: 2px;
    margin-right: 6px;
    vertical-align: middle;
  }
`;
document.head.appendChild(style);