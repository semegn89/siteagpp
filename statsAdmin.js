/* statsAdmin.js */
import { showToast } from './utils.js';
import { getItem, setItem } from './dbStorage.js';

export async function renderAdminStats(){
  const adminContent = document.getElementById('adminContent');
  if(!adminContent)return;

  adminContent.innerHTML=`
    <h3>Статистика платежей и расчёт маржи</h3>
    <div style="margin-bottom:10px;">
      <label>Период с:</label>
      <input type="date" id="statsStartDate" />
      <label style="margin-left:10px;">по:</label>
      <input type="date" id="statsEndDate" />
      <button id="applyStatsFilter" class="button button-sm" style="margin-left:10px;">Применить фильтр</button>
    </div>

    <h4>Архив данных по покупке валюты</h4>
    <div id="purchaseArchive" style="margin-bottom:20px;"></div>

    <h4>Статистика по платежам (маржа)</h4>
    <table class="stats-table" style="width:100%; border-collapse: collapse;">
      <thead>
        <tr>
          <th style="border:1px solid #ccc; padding:5px;">Валюта</th>
          <th style="border:1px solid #ccc; padding:5px;">Общая сумма (вал.)</th>
          <th style="border:1px solid #ccc; padding:5px;">Курс Агента</th>
          <th style="border:1px solid #ccc; padding:5px;">Ожидаемая сумма (руб.)</th>
          <th style="border:1px solid #ccc; padding:5px;">Фактическая стоимость (руб.)</th>
          <th style="border:1px solid #ccc; padding:5px;">Маржа (руб.)</th>
        </tr>
      </thead>
      <tbody id="statsTbody"></tbody>
    </table>
  `;

  const applyStatsFilter = adminContent.querySelector('#applyStatsFilter');
  applyStatsFilter.addEventListener('click', async ()=>{
    await calculateStats();
  });

  await renderPurchaseArchive();
  await calculateStats();

  async function renderPurchaseArchive(){
    const purchaseArchiveDiv = document.getElementById('purchaseArchive');
    const purchaseDataRaw= await getItem('purchaseData');
    let purchaseData = purchaseDataRaw ? JSON.parse(purchaseDataRaw):[];
    if(!purchaseData.length){
      purchaseArchiveDiv.innerHTML='<p>Архив пуст.</p>';
      return;
    }
    let html='<ul>';
    purchaseData.forEach(r=>{
      html += `<li><strong>${r.date}</strong> — ${r.currency}: ${r.purchasedAmount} по курсу ${r.purchaseRate}</li>`;
    });
    html+='</ul>';
    purchaseArchiveDiv.innerHTML=html;
  }

  async function calculateStats(){
    const startDateStr = adminContent.querySelector('#statsStartDate').value;
    const endDateStr   = adminContent.querySelector('#statsEndDate').value;
    let startDate = startDateStr ? new Date(startDateStr):null;
    let endDate   = endDateStr   ? new Date(endDateStr):null;

    const paymentsData = await getItem('payments');
    let payments = paymentsData ? JSON.parse(paymentsData):[];
    if(startDate && endDate){
      payments = payments.filter(p=>{
        const [dStr] = p.date.split(',');
        const [day, mon, year] = dStr.trim().split('.');
        if(!year)return true;
        const payDate = new Date(+year, +mon-1, +day);
        return payDate>=startDate && payDate<=endDate;
      });
    }

    const statsByCurrency={};
    payments.forEach(p=>{
      const cur = p.currency||'RUB';
      if(!statsByCurrency[cur]){
        statsByCurrency[cur]={ totalAmount:0, totalExpected:0, totalActual:0 };
      }
      statsByCurrency[cur].totalAmount += p.amount;
    });

    const adminRatesData = await getItem('adminRates2');
    const defaultRates = {
      RUB: { cb:1, agent:1 },
      AED: { cb:22, agent:22 },
      USD: { cb:76, agent:88 },
      EUR: { cb:80, agent:94 },
      CNY: { cb:12, agent:14 },
      GBP: { cb:115, agent:122 }
    };
    const rates = adminRatesData ? JSON.parse(adminRatesData) : defaultRates;

    payments.forEach(p=>{
      const cur = p.currency||'RUB';
      const agentRate = rates[cur] ? rates[cur].agent :1;
      const expected = p.amount*agentRate;
      let actual=0;
      if(p.purchaseRate && p.purchaseRate>0){
        actual= p.amount * p.purchaseRate * (1 + (p.feePercent||0)/100);
      } else {
        actual= expected;
      }
      if(statsByCurrency[cur]){
        statsByCurrency[cur].totalExpected += expected;
        statsByCurrency[cur].totalActual   += actual;
      }
    });

    const statsTbody = adminContent.querySelector('#statsTbody');
    statsTbody.innerHTML='';
    for(let cur in statsByCurrency){
      const obj = statsByCurrency[cur];
      const totalAmount   = obj.totalAmount;
      const totalExpected = obj.totalExpected;
      const totalActual   = obj.totalActual;
      const agentRate     = rates[cur] ? rates[cur].agent :1;
      const margin = totalExpected - totalActual;

      const tr = document.createElement('tr');
      tr.innerHTML=`
        <td style="border:1px solid #ccc; padding:5px;">${cur}</td>
        <td style="border:1px solid #ccc; padding:5px; text-align:right;">${totalAmount.toFixed(2)}</td>
        <td style="border:1px solid #ccc; padding:5px; text-align:right;">${agentRate.toFixed(2)}</td>
        <td style="border:1px solid #ccc; padding:5px; text-align:right;">${totalExpected.toFixed(2)}</td>
        <td style="border:1px solid #ccc; padding:5px; text-align:right;">${totalActual.toFixed(2)}</td>
        <td style="border:1px solid #ccc; padding:5px; text-align:right;">${margin.toFixed(2)}</td>
      `;
      statsTbody.appendChild(tr);
    }
  }
}