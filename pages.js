// «Рендерящие» модули
export { renderPaymentsPage  } from './payments.js';
export { renderDocumentsPage } from './documents.js';
export { renderRatesPage     } from './rates.js';
export { renderTemplatesPage } from './templates.js';
export { renderStatsPage     } from './stats.js';
export { renderAdminPanel    } from './adminPanel.js';
export { renderUserCabinet   } from './userCabinet.js';



export function loadPage(page) {
    console.log('[loadPage] page = ', page);
  }
export async function renderMainSite() {
  // 1) Скрыть все лендинговые секции и шапку
  ['.hero', '.about', '.services', '.advantages',
    '.testimonials', '.faq', '.contact']
    .forEach(sel =>
        document.querySelectorAll(sel)
                .forEach(el => (el.style.display = 'none')));

  // 2) Показать контейнер «content»
  const content = document.getElementById('content');
  if (!content) return;
  content.style.display = 'flex';
  content.innerHTML = '';

  // 3) Собрать и вставить верстку sidebar + детали
  const layout = document.createElement('div');
  layout.className = 'main-layout';
  layout.innerHTML = `
    <aside class="sidebar">
      <div class="icon" data-page="payments"><div class="icon-img">💳</div><span>Платежи</span></div>
      <div class="icon" data-page="stats"><div class="icon-img">📊</div><span>Статистика</span></div>
      <div class="icon" data-page="documents"><div class="icon-img">📁</div><span>Документы</span></div>
      <div class="icon" data-page="rates"><div class="icon-img">💱</div><span>Курсы валют</span></div>
      <div class="icon" data-page="templates"><div class="icon-img">📄</div><span>Шаблоны</span></div>
      ${window.AppState.isAdmin
        ? `<div class="icon" data-page="adminPanel"><div class="icon-img">👑</div><span>Админ-панель</span></div>`
        : `<div class="icon" data-page="userCabinet"><div class="icon-img">👤</div><span>Личный кабинет</span></div>`}
    </aside>
    <section class="details"></section>
  `;
  content.appendChild(layout);

  // 4) Навесить клики по пунктам меню
  layout.querySelectorAll('.sidebar .icon').forEach(icon => {
    icon.addEventListener('click', () => window.loadPage(icon.dataset.page));
  });

  // 5) Открыть дефолтную страницу
  const defaultPage = window.AppState.isAdmin ? 'adminPanel' : 'payments';
  window.loadPage(defaultPage);
}