import { showToast, showPreview } from './utils.js';
import { getItem, setItem } from './dbStorage.js';

export async function renderStatsPage() {
  const details = document.querySelector('.details');
  // Загружаем платежи из IndexedDB
  const paymentsData = await getItem('payments');
  let payments = paymentsData ? JSON.parse(paymentsData) : [];
  
  // Загружаем текущего пользователя из IndexedDB
  const curUserData = await getItem('currentUser');
  const curUser = curUserData ? JSON.parse(curUserData) : {};
  const isAdmin = (curUser.role === 'admin');

  // Если не админ, оставляем только платежи этого пользователя
  if (!isAdmin) {
    payments = payments.filter(x => x.ownerEmail === curUser.email);
  }

  details.style.background = 'rgba(255,255,255,1)';

  // Формируем основное содержимое страницы статистики
  details.innerHTML = `
    <h1>Статистика платежей</h1>

    <!-- Выбор периода -->
    <div style="
      display: flex;
      align-items: center;
      justify-content: flex-start;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 10px;
    ">
      <div>
        <label>С:</label>
        <input type="date" id="startDate">
      </div>
      <div>
        <label>По:</label>
        <input type="date" id="endDate">
      </div>
      <button id="applyDateFilter" class="button">Фильтр по периоду</button>
      <!-- Опционально: Экспорт -->
      <button id="exportPdfBtn" class="button button-outline">Экспорт PDF</button>
    </div>

    <div class="stats-container" style="display:flex; flex-wrap:wrap; gap:20px;">
      <div>
        <div class="stats-item">
          <strong>Всего платежей:</strong> <span id="statTotalCount"></span>
        </div>
        <div class="stats-item">
          <strong>Сумма всех платежей (без конвертации):</strong> 
          <span id="statTotalAmount"></span>
        </div>
        <div class="stats-item">
          <strong>Средняя сумма (без конвертации):</strong> 
          <span id="statAvgAmount"></span>
        </div>
        
        <!-- Общая сумма в рублях -->
        <div class="stats-item" style="margin-top:10px;">
          <strong>Общая сумма в рублях (конвертация):</strong>
          <span id="statTotalRub"></span>
        </div>
        
        <!-- Разбивка по валютам -->
        <div class="stats-item" style="margin-top:10px;">
          <strong>Разбивка по валютам:</strong>
          <div id="statsByCurrency"></div>
        </div>
      </div>

      <div style="width:300px; height:300px;">
        <canvas id="currencyChart"></canvas>
      </div>

      <!-- График по месяцам -->
      <div style="width:400px; height:300px;">
        <canvas id="monthlyChart"></canvas>
      </div>
    </div>
  `;

  // Получаем элементы управления
  const startDateInput = details.querySelector('#startDate');
  const endDateInput   = details.querySelector('#endDate');
  const applyDateBtn   = details.querySelector('#applyDateFilter');
  const exportPdfBtn   = details.querySelector('#exportPdfBtn');

  const statTotalCountEl  = details.querySelector('#statTotalCount');
  const statTotalAmountEl = details.querySelector('#statTotalAmount');
  const statAvgAmountEl   = details.querySelector('#statAvgAmount');
  const statTotalRubEl    = details.querySelector('#statTotalRub');
  const statsByCurrencyEl = details.querySelector('#statsByCurrency');

  // Для конвертации берём курсы из IndexedDB (используем ключ adminRates2)
  const ratesData = await getItem('adminRates2');
  let defRates = { RUB: 1, AED: 22, USD: 88, EUR: 94, CNY: 14, GBP: 122 };
  let rates = ratesData ? JSON.parse(ratesData) : defRates;

  // Обработчики кнопок фильтрации и экспорта PDF
  applyDateBtn.addEventListener('click', () => {
    renderCharts();
  });
  exportPdfBtn.addEventListener('click', () => {
    exportPdfForPeriod();
  });

  // Функция отрисовки графиков и статистики
  function renderCharts(){
    let filteredPays = [...payments];
    // Фильтрация по дате
    const sVal = startDateInput.value;
    const eVal = endDateInput.value;
    if(sVal && eVal){
      const startDate = new Date(sVal);
      const endDate   = new Date(eVal);
      filteredPays = filteredPays.filter(p => {
        // Ожидаемый формат p.date: "24.03.2025, 09:19:58"
        const [dStr] = p.date.split(',');
        const [day, mon, year] = dStr.trim().split('.');
        const payDate = new Date(+year, +mon - 1, +day);
        return (payDate >= startDate && payDate <= endDate);
      });
    }

    const totalCount = filteredPays.length;
    let totalAmount = 0;
    let totalRub = 0;
    const currencyStats = {};

    filteredPays.forEach(p => {
      totalAmount += p.amount;
      const rate = rates[p.currency] || 1;
      totalRub += p.amount * rate;
      if(!currencyStats[p.currency]){
        currencyStats[p.currency] = 0;
      }
      currencyStats[p.currency] += p.amount;
    });
    const avg = totalCount > 0 ? (totalAmount / totalCount).toFixed(2) : 0;

    // Заполнение статистических данных
    statTotalCountEl.textContent  = totalCount;
    statTotalAmountEl.textContent = totalAmount.toFixed(2);
    statAvgAmountEl.textContent   = avg;
    statTotalRubEl.textContent    = totalRub.toFixed(2);

    let breakdown = '';
    for(let cur in currencyStats){
      breakdown += `<p>${cur}: ${currencyStats[cur].toFixed(2)}</p>`;
    }
    if(!breakdown) breakdown = '<p>Нет данных</p>';
    statsByCurrencyEl.innerHTML = breakdown;

    // Круговая диаграмма
    const currencyCanvas = details.querySelector('#currencyChart');
    if(currencyCanvas){
      const labels = Object.keys(currencyStats);
      const dataVals = Object.values(currencyStats);
      new Chart(currencyCanvas.getContext('2d'), {
        type: 'pie',
        data: {
          labels,
          datasets: [{
            data: dataVals,
            backgroundColor: ['#FF6384','#36A2EB','#FFCE56','#4BC0C0','#9966FF','#FF9F40'],
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false
        }
      });
    }
    // сдлеаем проверку на наличие элемента monthlyCanvas
    // и только потом отрисовываем график
      

    // График по месяцам
    const monthlyCanvas = details.querySelector('#monthlyChart');
    if(monthlyCanvas){
      const monthlyMap = {};
      filteredPays.forEach(p => {
        const [dStr] = p.date.split(',');
        const [day, mon, year] = dStr.trim().split('.');
        const key = `${year}-${mon.padStart(2, '0')}`;
        monthlyMap[key] = (monthlyMap[key] || 0) + p.amount;
      });
      const sortedKeys = Object.keys(monthlyMap).sort();
      const barLabels = sortedKeys;
      const barData = sortedKeys.map(k => monthlyMap[k]);
      new Chart(monthlyCanvas.getContext('2d'), {
        type: 'bar',
        data: {
          labels: barLabels,
          datasets: [{
            label: 'Сумма (ед.вал)',
            data: barData,
            backgroundColor: '#36A2EB'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { beginAtZero: true }
          }
        }
      });
    }
  }

  // Функция экспорта PDF за выбранный период
  function exportPdfForPeriod() {
    let filteredPays = [...payments];
    const sVal = startDateInput.value;
    const eVal = endDateInput.value;
    if(sVal && eVal){
      const startDate = new Date(sVal);
      const endDate = new Date(eVal);
      filteredPays = filteredPays.filter(p => {
        const [dStr] = p.date.split(',');
        const [day, mon, year] = dStr.trim().split('.');
        const payDate = new Date(+year, +mon - 1, +day);
        return (payDate >= startDate && payDate <= endDate);
      });
    }
    if(!filteredPays.length){
      showToast('Нет данных за указанный период', 'info');
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(12);
    doc.text('Отчёт за период', 10, 10);
    let head = [['ID','Date','Receiver','Amount','Currency','Status']];
    let body = filteredPays.map(p => [
      p.id, p.date, p.receiverName, p.amount, p.currency, p.status
    ]);
    doc.autoTable({ head, body, startY: 20 });
    doc.save('report.pdf');
  }

  // Первичная отрисовка статистики
  renderCharts();
}