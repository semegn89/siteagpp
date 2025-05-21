import {
  checkAuthStatus,
  handleLoginForm,
  handleRegisterForm,
  handleLogout
} from './auth.js';



/* === перехватываем querySelector, но сначала сохраняем оригинал === */
const _origQuery = Document.prototype.querySelector;

function ensureDetailsContainer () {
  let el = _origQuery.call(document, '.details');
  if (el) return el;

  const host = _origQuery.call(document, '#content') || document.body;
  el = host.appendChild(Object.assign(
        document.createElement('div'),
        { className: 'details', style: 'flex:1;' }));
  return el;
}

Document.prototype.querySelector = function (sel) {
  if (sel === '.details') return ensureDetailsContainer();
  return _origQuery.call(this, sel);
};

const APP_CONFIG = {
  dbName: "AgentAppDB",
  dbVersion: 3,
  darkModeKey: "darkMode",
  authKey: "isLoggedIn",
  userKey: "currentUser",
};

// ===== Состояние приложения =====
const AppState = {
  db: null,
  isAdmin: false,
  darkMode: false,
  currentPage: null,
};

// ===== Утилиты =====
const debounce = (fn, delay = 300) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), delay);
  };
};

const throttle = (fn, limit = 200) => {
  let waiting;
  return (...args) => {
    if (!waiting) {
      fn.apply(this, args);
      waiting = true;
      setTimeout(() => (waiting = false), limit);
    }
  };
};

function showToast(message, type = "info", duration = 4000) {
  const container =
    document.getElementById("toastContainer") ||
    document.body.appendChild(
      Object.assign(document.createElement("div"), {
        id: "toastContainer",
        style:
          "position:fixed;top:1rem;right:1rem;z-index:99999;display:flex;flex-direction:column;align-items:flex-end;gap:.5rem;",
      })
    );

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon"><i class="fas fa-info-circle"></i></span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => toast.classList.add("fade-out"), duration - 300);
  setTimeout(() => toast.remove(), duration);
}
function toggleLoggedInUI(isLogged) {
  // 1. класс на <body>
  document.body.classList.toggle('logged-in', isLogged);

  // 2. сам кабинет (main#content)
  const content = document.getElementById('content');
  if (content) content.style.display = isLogged ? 'flex' : 'none';

  // 3. кнопки входа / выхода
  ['loginBtn','registerBtn','loginBtnMobile','registerBtnMobile'].forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.style.display = isLogged ? 'none' : 'flex';
  });
  ['logoutBtn','logoutBtnMobile','logoutSidebar'].forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.style.display = isLogged ? 'flex' : 'none';
  });
}
// ===== Инициализация приложения =====
async function initializeApplication() {
  let logged = false; /* NEW */

  try {
    AppState.db = await initDB(APP_CONFIG.dbName, APP_CONFIG.dbVersion);
    await clearOldData(AppState.db);

    await loadSettings();
    initUI();

    logged = await checkAuthStatus();        /* NEW */
    await updateAuthUI();
    if (logged) {
      document.body.classList.add("logged-in");
      renderMainSiteContent();
    } else {
      document.body.classList.remove("logged-in");
      renderLandingPageContent();
    }
    hidePreloader();
  }
  catch (err) {
    console.error("Ошибка инициализации приложения:", err);
    renderErrorPage(err);
  }
}


/* ========================================================================
 /* ========================================================================
 *  IndexedDB — рабочая реализация
 * ====================================================================== */

// ─────────── единственная (!) версия initDB ───────────
function initDB(dbName, version = 4) {          // ← поднял версию на 4
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, version);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      // settings – ключ-значение
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }

      // logs – с авто-ID и индексом по времени
      if (!db.objectStoreNames.contains('logs')) {
        const store = db.createObjectStore('logs', {
          keyPath: 'id',
          autoIncrement: true
        });
        store.createIndex('by_time', 'ts');
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error ||
                       new Error('Ошибка открытия IndexedDB'));
  });
}

// ─────────── безопасная очистка старых логов ───────────
function clearOldData(db) {
  return new Promise((resolve, reject) => {
    // если базы нет или в ней ещё нет store «logs» — просто выходим
    if (!db || !db.objectStoreNames.contains('logs')) {
      return resolve();
    }

    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;      // 30 дней
    const tx   = db.transaction('logs', 'readwrite');
    const idx  = tx.objectStore('logs').index('by_time');

    idx.openCursor(IDBKeyRange.upperBound(cutoff)).onsuccess = e => {
      const cur = e.target.result;
      if (cur) {
        cur.delete();      // удаляем запись
        cur.continue();    // переходим к следующей
      }
    };

    tx.oncomplete = () => resolve();       // всё прошло успешно
    tx.onerror    = () => reject(tx.error);
  });
}
// ─────────── чтение/запись в IndexedDB или localStorage ───────────
function setItem(key, value) {
  return new Promise((resolve, reject) => {
    // 1) есть открытая БД и store "settings"
    if (AppState.db && AppState.db.objectStoreNames.contains('settings')) {
      const tx  = AppState.db.transaction('settings', 'readwrite');
      tx.objectStore('settings').put({ key, value });
      tx.oncomplete = resolve;
      tx.onerror    = () => reject(tx.error);
    } else {
      // 2) fallback → localStorage
      try {
        localStorage.setItem(key, value);
        resolve();
      } catch (e) {
        reject(e);
      }
    }
  });
}

/**
 * Читает значение по ключу: сначала IndexedDB, затем localStorage.
 * Возвращает `null`, если ничего не найдено.
 */
function getItem(key) {
  return new Promise((resolve, reject) => {
    // 1) пытаемся из IndexedDB
    if (AppState.db && AppState.db.objectStoreNames.contains('settings')) {
      const tx  = AppState.db.transaction('settings', 'readonly');
      const req = tx.objectStore('settings').get(key);
      req.onsuccess = () => {
        if (req.result)            return resolve(req.result.value);
        // 2) не найдено в IDB → пробуем localStorage
        const ls = localStorage.getItem(key);
        resolve(ls !== null ? ls : null);
      };
      req.onerror = () => reject(req.error);
    } else {
      // fallback сразу в localStorage
      const ls = localStorage.getItem(key);
      resolve(ls !== null ? ls : null);
    }
  });
}
/* ===== Авторизация: кнопки «Войти / Выйти» ===================== */
function initAuthButtons () {
  [
    'logoutBtn',            // верх-меню (десктоп)
    'logoutBtnMobile',      // бургер-меню
    'logoutSidebar'         // кнопка в сайдбаре кабинета
  ].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    el.addEventListener('click', async () => {
      await handleLogout();             // выход
      toggleLoggedInUI(false);          // переключили интерфейс
      showLandingElements();            // показали лендинг
      window.dispatchEvent(new CustomEvent('authChanged'));
    });
  });
}


// ===== UI-инициализация ===== 
function initUI() {
  initAuthButtons();
  initAuthForms();
  initModals();
  initMobileMenu();
  initThemeSwitcher();
  initNavigation();
  initGlobalListeners();
  initCounters();
}
/* ===== Авторизационные формы (НОВАЯ версия) ===================== */
function initAuthForms() {
  /* --- логин --- */
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      await handleLoginForm(e);       // записываем флаги isLoggedIn / currentUser
      toggleLoggedInUI(true);         // включаем кабинет-UI
      loadPage('userCabinet');        // первая страница в кабинете
      closeAllModals();

      window.dispatchEvent(new CustomEvent('authChanged'));
    });
  }

  /* --- регистрация --- */
  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      await handleRegisterForm(e);    // создаём нового пользователя + логиним
      toggleLoggedInUI(true);
      loadPage('userCabinet');
      closeAllModals();
      showToast('Регистрация успешна!', 'success');

      window.dispatchEvent(new CustomEvent('authChanged'));
    });
  }
}



/* ---------- ВАШ loadSettings (исправляем самый конец) ---------- */
async function loadSettings() {
  // 1) dark-mode
  const dark = await getItem(APP_CONFIG.darkModeKey);
  AppState.darkMode =
    (dark ?? localStorage.getItem(APP_CONFIG.darkModeKey)) === 'true';
  setTheme(AppState.darkMode);

  // 2) текущий пользователь
  let userJSON = await getItem(APP_CONFIG.userKey);
  if (!userJSON) userJSON = localStorage.getItem(APP_CONFIG.userKey);
  if (userJSON) AppState.currentUser = JSON.parse(userJSON);

  /* ↓↓↓ ВОТ ЭТА СТРОКА ДОЛЖНА БЫТЬ ТОЛЬКО ОДНА, с **AppState** ↓↓↓ */
  AppState.isAdmin = AppState.currentUser?.role === 'admin';
}            // ← фигурная скобка закрывает функцию
/* ---------------------------------------------------------------- */

/* ---------- глобальная util-функция setTheme (верните её!) ------ */
function setTheme(isDark) {
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  document.body.classList.toggle('dark-mode', isDark);
}



/* --------------------------------------------------------------------
 *  showLandingElements – гарантированно показывает все секции лендинга
 * ------------------------------------------------------------------ */
function showLandingElements () {
  document.querySelectorAll(
    '.landing-section, .hero, header.header, footer.footer, section'
  ).forEach(el => (el.style.display = ''));
}
/* ===== Основной / лендинговый контент ===== */
function renderMainSiteContent() {
  document.getElementById("content")?.style.removeProperty("display");
  document.getElementById("cabinetCss")?.removeAttribute("disabled");
  loadPage("userCabinet");
}
function renderLandingPageContent() {
  document.querySelectorAll(".landing-section, section, .hero, header.header, footer.footer").forEach((el) => {
    el.style.display = "block";
  });
  initLandingFeatures();
  showLandingElements();
}
/* ============ sync auth widgets ============ */
async function updateAuthUI() {
  const logged = await checkAuthStatus();
  toggleLoggedInUI(logged);

  /* new */
  const u = JSON.parse(localStorage.getItem('currentUser') || 'null');
  AppState.isAdmin = (u?.role === 'admin');
  /* если пользователь – не админ, прячем пункт меню */
  document.querySelector('[data-page="adminPanel"]')
   ?.classList.toggle('hidden', !AppState.isAdmin);
}

/* прячем лендинг при входе */
const _legacyRenderMainSiteContent = renderMainSiteContent;
renderMainSiteContent = function () {
  document.querySelectorAll(".landing-section,.hero,header.header,footer.footer")
          .forEach((el) => (el.style.display = "none"));
  _legacyRenderMainSiteContent();
};
/* показываем лендинг при выходе */
const _legacyRenderLanding = renderLandingPageContent;
renderLandingPageContent = function () {
  document.querySelectorAll(".landing-section,.hero,header.header,footer.footer")
          .forEach((el) => (el.style.display = ""));
  _legacyRenderLanding();
  document.body.classList.remove("logged-in");
  document.getElementById("content")?.style.setProperty("display", "none");
  document.body.style.overflow = "";
};

// ===== Ленд-пейдж фичи (анимации, FAQ и т.д.) =====
function initLandingFeatures() {
  initServiceCardsAnimation();
  initTestimonialAnimation();
  initFAQAccordion();
}
function initServiceCardsAnimation() {
  const services = document.querySelectorAll(".service-card");
  const observer = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => e.isIntersecting && e.target.classList.add("visible")),
    { threshold: 0.1 }
  );
  services.forEach((el) => observer.observe(el));
}
function initTestimonialAnimation() {
  const testimonials = document.querySelectorAll(".testimonial-card");
  const observer = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => e.isIntersecting && e.target.classList.add("visible")),
    { threshold: 0.1 }
  );
  testimonials.forEach((el) => observer.observe(el));
}
function initFAQAccordion() {
  document.querySelectorAll(".faq-item").forEach((item) => {
    const q = item.querySelector(".faq-question");
    if (q) q.addEventListener("click", () => item.classList.toggle("active"));
  });
}
function initCounters() {
  const counters = document.querySelectorAll(".counter");
  if (!counters.length) return;
  const observer = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (e.isIntersecting) {
          animateCounter(e.target);
          observer.unobserve(e.target);
        }
      }),
    { threshold: 0.5 }
  );
  counters.forEach((el) => observer.observe(el));
}
function animateCounter(el) {
  const target = +el.getAttribute("data-count");
  const duration = 2000;
  const step = target / (duration / 16);
  let current = 0;
  const timer = setInterval(() => {
    current += step;
    if (current >= target) {
      clearInterval(timer);
      current = target;
    }
    el.textContent = Math.floor(current).toString();
  }, 16);
}

// ===== Модальные окна =====
function initModals() {
  document.querySelectorAll("[data-modal]").forEach((trigger) => {
    const modal = document.getElementById(trigger.dataset.modal);
    const closeBtn = modal?.querySelector(".modal-close");

    trigger.addEventListener("click", (e) => {
      e.preventDefault();
      openModal(modal);
    });
    closeBtn?.addEventListener("click", () => closeModal(modal));
    modal?.addEventListener("click", (e) => e.target === modal && closeModal(modal));
  });
}
function openModal(modal) {
  if (!modal) return;
  modal.style.display = "flex";
  modal.classList.add("active");
  document.body.classList.add("no-scroll");
}
function closeModal(modal) {
  if (!modal) return;
  modal.style.display = "none";
  modal.classList.remove("active");
  document.body.classList.remove("no-scroll");
}
function closeAllModals() {
  document.querySelectorAll(".modal.active").forEach((m) => closeModal(m));
}

// ===== Мобильное меню =====
function initMobileMenu() {
  const btn = document.getElementById("hamburgerBtn");
  const nav = document.getElementById("mobileNav");
  if (!btn || !nav) return;

  btn.addEventListener("click", () => {
    btn.classList.toggle("active");
    nav.classList.toggle("active");
    document.body.classList.toggle("no-scroll");
  });
}

// ===== Переключатель темы =====
function initThemeSwitcher() {
  const btn = document.getElementById("toggleDarkMode");
  if (!btn) return;
  const icon = btn.querySelector("i");

  const updateIcon = () => {
    if (icon) icon.className = AppState.darkMode ? "fas fa-sun" : "fas fa-moon";
  };
  updateIcon();
  btn.addEventListener("click", () => {
    AppState.darkMode = !AppState.darkMode;
    setTheme(AppState.darkMode);
    setItem(APP_CONFIG.darkModeKey, AppState.darkMode);
    updateIcon();
  });
}

// ===== Навигация =====
function initNavigation() {
  // Smooth scroll
  document
    .querySelectorAll('header .nav-item[href^="#"]')
    .forEach((a) => {
      a.addEventListener("click", (e) => {
        const href = a.getAttribute("href");
        if (href && href !== "#") {
          e.preventDefault();
          const tgt = document.querySelector(href);
          if (tgt) {
            tgt.scrollIntoView({ behavior: "smooth" });
            const nav = document.getElementById("mobileNav");
            if (nav?.classList.contains("active"))
              document.getElementById("hamburgerBtn").click();
          }
        }
      });
    });

  // Icons в кабинете
  document.querySelectorAll(".sidebar .icon").forEach((icon) => {
    icon.addEventListener("click", () => loadPage(icon.dataset.page));
  });
}

// ===== Глобальные слушатели =====
function initGlobalListeners() {
  window.addEventListener("scroll", throttle(handleScroll, 200));
  window.addEventListener("resize", debounce(handleResize, 300));
}
function handleScroll() {
  const backToTop = document.getElementById("backToTop");
  if (backToTop) backToTop.classList.toggle("visible", window.scrollY > 300);

  /* подсветка активного пункта меню на лендинге */
  const sections = document.querySelectorAll("section[id]");
  const pos = window.scrollY + 200;
  sections.forEach((sec) => {
    const top = sec.offsetTop;
    const height = sec.offsetHeight;
    const id = sec.id;
    const links = document.querySelectorAll(`header .nav-item[href="#${id}"]`);
    links.forEach((l) => l.classList.toggle("active", pos >= top && pos < top + height));
  });
}
function handleResize() {
  const nav = document.getElementById("mobileNav");
  if (window.innerWidth > 768 && nav?.classList.contains("active")) {
    document.getElementById("hamburgerBtn").click();
  }
}
// ===== Кабинет =====
async function loadPage(page) {
  const details = ensureDetailsContainer();        // NEW: гарантированно есть
  details.classList.add("fade-out");

  setTimeout(async () => {
    try {
      details.innerHTML = '<div class="loader"></div>';

      switch (page) {
        case "payments":
          await renderPaymentsPage();
          break;
        case "stats":
          await renderStatsPage();
          break;
        case "documents":
          await renderDocumentsPage();
          break;
        case "rates":
          await renderRatesPage();
          break;
        case "templates":
          await renderTemplatesPage();
          break;
        case "adminPanel":
          await renderAdminPanel();
          break;
        case "userCabinet":
        default:
          await renderUserCabinet();
      }

      AppState.currentPage = page;
      updateActiveMenuIcon();
    } catch (e) {
      console.error("Ошибка загрузки страницы:", e);
      details.innerHTML = "<h2>Ошибка загрузки</h2>";
    } finally {
      details.classList.remove("fade-out");
    }
  }, 200);
}

function updateActiveMenuIcon() {
  document.querySelectorAll(".sidebar .icon").forEach((icon) => {
    icon.classList.toggle("active", icon.dataset.page === AppState.currentPage);
  });
}

/* ===== Заглушки страниц кабинета (останутся, если нет real-модуля) ===== */
const pageStub = (title) => {
  const el = document.createElement("div");
  el.innerHTML = `<h2>${title} (в разработке)</h2>`;
  return el;
};
function renderPaymentsPage()   { ensureDetailsContainer().replaceChildren(pageStub("Платежи")); }
function renderStatsPage()      { ensureDetailsContainer().replaceChildren(pageStub("Статистика")); }
function renderDocumentsPage()  { ensureDetailsContainer().replaceChildren(pageStub("Документы")); }
function renderRatesPage()      { ensureDetailsContainer().replaceChildren(pageStub("Тарифы")); }
function renderTemplatesPage()  { ensureDetailsContainer().replaceChildren(pageStub("Шаблоны")); }
function renderAdminPanel()     { ensureDetailsContainer().replaceChildren(pageStub("Админ-панель")); }
function renderUserCabinet()    { ensureDetailsContainer().replaceChildren(pageStub("Личный кабинет")); }

// ===== Прелоадер / ошибки =====
function hidePreloader() {
  const preloader = document.querySelector('.preloader');
  if (!preloader) return;

  // запускаем анимацию исчезновения
  preloader.classList.add('fade-out');

  const remove = () => preloader.remove();        // либо preloader.style.display='none'

  // 1️⃣ нормальный путь – ждём конца анимации
  preloader.addEventListener('transitionend', () => preloader.remove(), {once:true});

  // 2️⃣ страховка на случай, если Safari «проглотит» transitionend
  setTimeout(remove, 1000);   // чуть больше, чем 0.5 s в CSS
}
function renderErrorPage(err) {
  document.body.innerHTML = `
    <div class="error-container" style="min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:1rem;font-family:Inter,sans-serif;">
      <h1 style="font-size:2rem;color:#EF4444;">Произошла ошибка</h1>
      <p>${err.message}</p>
      <button style="padding:.75rem 1.5rem;border:none;border-radius:6px;background:#2563EB;color:#fff;font-weight:600;cursor:pointer;" onclick="location.reload()">Перезагрузить страницу</button>
    </div>`;
}

/* ========================================================================
 * === динамический импорт реальных модулей кабинета                     ===
 * ======================================================================*/
const CABINET_MODULES = {
  payments:    "./payments.js",
  stats:        "./stats.js",
  documents:   "./documents.js",
  rates:       "./rates.js",
  templates:   "./templates.js",
  adminPanel:  "./adminPanel.js",
  userCabinet: "./userCabinet.js",
};

async function importCabinetPage(pageKey) {
  const path = CABINET_MODULES[pageKey];
  if (!path) return null;
  try {
    return await import(path /* webpackIgnore: true */);
  } catch (e) {
    console.warn(`[importCabinetPage] Не удалось загрузить ${pageKey}:`, e);
    return null;
  }
}

async function tryRenderRealPage(pageKey) {
  const mod = await importCabinetPage(pageKey);
  if (!mod) return false;
  const Camel = pageKey.charAt(0).toUpperCase() + pageKey.slice(1);
  const candidates = [`render${Camel}Page`, `render${Camel}`, "render"];
  for (const fn of candidates)
    if (typeof mod[fn] === "function") {
      await mod[fn]();
      return true;
    }
  for (const k of Object.keys(mod))
    if (k.startsWith("render") && typeof mod[k] === "function") {
      await mod[k]();
      return true;
    }
  return false;
}

/* ===== Переопределяем loadPage, добавляя динамический импорт ===== */
(function overrideLoadPage() {
  const _legacyLoadPage = loadPage; // сохраняем старую версию
  loadPage = async function (pageKey) {
    const ok = await tryRenderRealPage(pageKey);
    if (!ok) _legacyLoadPage(pageKey); // fallback на stub
    AppState.currentPage = pageKey;
    updateActiveMenuIcon();
    if (await checkAuthStatus()) document.body.classList.add("logged-in");
  };
  window.loadPage = loadPage; // экспорт наружу
})();

// ===== Запуск =====
document.addEventListener("DOMContentLoaded", () =>
  initializeApplication().catch((err) => console.error("Ошибка при запуске:", err))
);

// ===== Экпорт глобальных функций (если нужны где-то ещё) =====
window.showToast = showToast;
/* === файл main.js завершён === */