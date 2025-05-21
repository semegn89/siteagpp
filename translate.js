// translate.js

const translations = {
    ru: {
      about: "О компании",
      services: "Услуги",
      testimonials: "Отзывы",
      faq: "FAQ",
      contact: "Контакты",
      heroTitle: "Международные переводы быстро и безопасно",
      heroDesc: "AgentAPP — ваш надежный платёжный агент в любой точке мира.",
      heroBtn1: "Подробнее",
      heroBtn2: "Начать сейчас"
    },
    en: {
      about: "About Us",
      services: "Services",
      testimonials: "Testimonials",
      faq: "FAQ",
      contact: "Contact",
      heroTitle: "Fast and Secure International Transfers",
      heroDesc: "AgentAPP — your trusted payment agent worldwide.",
      heroBtn1: "Learn More",
      heroBtn2: "Get Started"
    }
  };
  
  function switchLanguage(lang) {
    const t = translations[lang];
  
    if (!t) return;
  
    document.querySelector('a[href="#about"]').innerText = t.about;
    document.querySelector('a[href="#services"]').innerText = t.services;
    document.querySelector('a[href="#testimonials"]').innerText = t.testimonials;
    document.querySelector('a[href="#faq"]').innerText = t.faq;
    document.querySelector('a[href="#contact"]').innerText = t.contact;
  
    document.querySelector('.hero-content h1').innerText = t.heroTitle;
    document.querySelector('.hero-content p').innerText = t.heroDesc;
  
    const buttons = document.querySelectorAll('.hero-buttons a');
    if (buttons.length >= 2) {
      buttons[0].innerText = t.heroBtn1;
      buttons[1].innerText = t.heroBtn2;
    }
  
    // Переключение активной кнопки
    document.getElementById('ruBtn').classList.toggle('active', lang === 'ru');
    document.getElementById('enBtn').classList.toggle('active', lang === 'en');
  
    // Сохраняем выбранный язык
    localStorage.setItem('selectedLanguage', lang);
  }
  
  // Назначение событий на кнопки переключателя
  document.getElementById('ruBtn').addEventListener('click', () => switchLanguage('ru'));
  document.getElementById('enBtn').addEventListener('click', () => switchLanguage('en'));
  
  // При загрузке страницы читаем выбранный язык
  const savedLang = localStorage.getItem('selectedLanguage') || 'ru';
  switchLanguage(savedLang);