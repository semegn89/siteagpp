/* public/scripts/transferCalc.js
   ──────────────────────────────
   Калькулятор перевода: берёт курсы, заданные админом
   (store/key: adminRates) — если их нет, падает на курсы ЦБ.
*/
import { getItem } from './dbStorage.js';

/* ─── 0) Глобальные переменные ─────────────────────────────────────────── */
let adminRates    = {};   // курсы агента (IndexedDB)
let currencyData  = {};   // объект курсов, с которым работает калькулятор
let allCurrencies = [];
let allCountries  = [];

/* список «плохих» слов ― нужен для быстрой фильтрации Ф. И. */
const badWords = ['хуй','бля','бляд','еба','ебл','пизд','муд','сука','сук','хуе','оху',
                  'нах','еб','ёб','fuck','shit','сволочь','гандон','мразь','охуе','пид'];
const profanityRegex = new RegExp(badWords.join('|'), 'i');

document.addEventListener('DOMContentLoaded', () => {
  /* === 1) DOM-элементы ================================================== */
  const el = {
    valuteTrigger   : document.querySelector('.transfer__valute'),
    countryTrigger  : document.querySelector('.transfer__country'),
    valuteList      : document.querySelector('.transfer__valute-list'),
    countryList     : document.querySelector('.transfer__country-list'),
    valuteDisplay   : document.querySelector('.transfer__valute p'),
    summaInput      : document.getElementById('summa'),
    resultPrice     : document.querySelector('.transfer__price-all p'),
    commissionPrice : document.querySelector('.transfer__price-kom p'),
    phoneInput      : document.getElementById('transfer__phone'),
    checkbox        : document.querySelector('.transfer__itog form .checkbox input'),
    submitBtn       : document.querySelector('.transfer__btn-main'),
    thxModal        : document.querySelector('.thx'),
    nameInput       : document.getElementById('transfer__name'),
    marketingCheckbox: document.querySelector('#transfer-marketing input[type="checkbox"]'),
    nameError       : document.getElementById('error-message'),   // div под ошибку имени
    curLabel        : document.querySelector('.currency-label')   // «USD» справа от ввода
  };

  /* === 2) Инициализация ================================================== */
  init();
  async function init () {
    initPhoneMask(el.phoneInput);
    await buildCurrencyList();             // курсы + список валют
    buildCountryList();
    setupFormValidation();
    setupSubmitHandler();
  }

  /* ──────────────────────────────
     3) Курсы валют + список
  ────────────────────────────── */
  async function buildCurrencyList () {
    const excluded = ['XDR','UAH'];
    const popular  = ['USD','CNY','EUR','AED'];

    /* названия в И. п. — для русской локали */
    const namesNom = { AED:'Дирхам ОАЭ', AMD:'Армянский драм', AUD:'Австралийский доллар',
      AZN:'Азербайджанский манат', BGN:'Болгарский лев',  BRL:'Бразильский реал',
      BYN:'Белорусский рубль',  CAD:'Канадский доллар',   CHF:'Швейцарский франк',
      CNY:'Китайский юань',      CZK:'Чешская крона',     DKK:'Датская крона',
      EGP:'Египетский фунт',     EUR:'Евро',              GBP:'Фунт стерлингов',
      GEL:'Грузинский лари',     HKD:'Гонконгский доллар',HUF:'Венгерский форинт',
      IDR:'Индонезийская рупия', INR:'Индийская рупия',   JPY:'Японская йена',
      KGS:'Киргизский сом',      KRW:'Южнокорейская вона',KZT:'Казахстанский тенге',
      MDL:'Молдавский лей',      NOK:'Норвежская крона',  NZD:'Новозеландский доллар',
      PLN:'Польский злотый',     QAR:'Катарский риал',    RON:'Румынский лей',
      RSD:'Сербский динар',      SEK:'Шведская крона',    SGD:'Сингапурский доллар',
      THB:'Таиландский бат',     TJS:'Таджикский сомони', TMT:'Туркменский манат',
      TRY:'Турецкая лира',       USD:'Доллар США',        UZS:'Узбекский сум',
      VND:'Вьетнамский донг',    ZAR:'Южноафриканский рэнд' };

    /* 3-а) пытаемся взять агентские курсы */
    try {
      const stored = await getItem('adminRates');
      if (stored) adminRates = JSON.parse(stored);       // { USD:{cb,agent}, … }
    } catch (e) { console.warn('[transferCalc] adminRates read:', e); }

    /* 3-б) формируем currencyData */
    if (Object.keys(adminRates).length) {
      currencyData = Object.fromEntries(
        Object.entries(adminRates).map(([code,obj]) => [
          code,
          { CharCode:code,
            Value   : typeof obj === 'number' ? obj : obj.agent,
            Nominal : 1,
            Name    : namesNom[code] || code }
        ])
      );
    } else {
      const daily = await fetch('https://www.cbr-xml-daily.ru/daily_json.js')
                          .then(r=>r.json()).catch(()=>null);
      currencyData = daily ? daily.Valute : {};
    }

    /* 3-в) готовим итоговый массив для списка */
    allCurrencies = Object.values(currencyData)
      .filter(v => !excluded.includes(v.CharCode))
      .map(v   => ({ ...v, Name:namesNom[v.CharCode] || v.Name }))
      .sort((a,b)=>{
        const ap = popular.includes(a.CharCode), bp = popular.includes(b.CharCode);
        if (ap && !bp) return -1;
        if (!ap && bp) return  1;
        return a.Name.localeCompare(b.Name);
      });

    renderCurrencyList();
    calcTotals();
  }

  /* 3-г) рисуем список валют */
  function renderCurrencyList (search = '') {
    const L  = el.valuteList;

    // создаём строку поиска, если ещё нет
    let sEl = L.querySelector('input.valute__search');
    if (!sEl) {
      sEl = document.createElement('input');
      sEl.className   = 'valute__search';
      sEl.placeholder = 'Поиск';
      const li = document.createElement('li');
      li.appendChild(sEl);
      L.prepend(li);
    }

    // фильтрация
    const term = search.toLowerCase();
    const view = allCurrencies.filter(c =>
      c.CharCode.toLowerCase().includes(term) || c.Name.toLowerCase().includes(term)
    );

    // очистить старые пункты
    L.querySelectorAll('li:not(:first-child)').forEach(li=>li.remove());

    // вывод
    view.forEach(c=>{
      const li = document.createElement('li');
      li.textContent = `${c.CharCode} — ${c.Name}`;
      li.onclick = () => {
        el.valuteDisplay.textContent = c.CharCode;
        el.curLabel.textContent      = c.CharCode;
        el.summaInput.dataset.currency = c.CharCode;
        toggleList(L,false);
        sEl.blur();
        calcTotals();
      };
      L.appendChild(li);
    });

    sEl.value    = search;
    sEl.oninput  = e => renderCurrencyList(e.target.value);
  }

  /* ──────────────────────────────
     4) Список стран (минимальные правки)
  ────────────────────────────── */
  async function buildCountryList () {
    const excluded = ['Myanmar','Zimbabwe','Iraq','Iran','Cuba','Liberia','Lebanon',
                      'North Korea','Syria','Sudan','Ukraine'];

    const resp = await fetch('https://restcountries.com/v3.1/all?fields=name,cca2,translations')
                          .then(r=>r.json()).catch(()=>[]);
    allCountries = resp.filter(c=>!excluded.includes(c.name.common))
                       .sort((a,b)=>{
                         const nA = a.translations?.rus?.common || a.name.common;
                         const nB = b.translations?.rus?.common || b.name.common;
                         return nA.localeCompare(nB);
                       });
    renderCountryList();
  }

  function renderCountryList (search = '') {
    const L  = el.countryList;

    let sEl = L.querySelector('input.country__search');
    if (!sEl){
      sEl = document.createElement('input');
      sEl.className='country__search'; sEl.placeholder='Поиск';
      const li = document.createElement('li'); li.appendChild(sEl); L.prepend(li);
    }

    const term = search.toLowerCase();
    const view = allCountries.filter(c=>{
      const n = c.translations?.rus?.common || c.name.common;
      return n.toLowerCase().includes(term) || c.cca2.toLowerCase().includes(term);
    });

    L.querySelectorAll('li:not(:first-child)').forEach(li=>li.remove());

    view.forEach(c=>{
      const li = document.createElement('li');
      li.textContent = c.translations?.rus?.common || c.name.common;
      li.onclick = () => {
        document.querySelector('.transfer__country p').textContent = li.textContent;
        toggleList(L,false);
      };
      L.appendChild(li);
    });

    sEl.value   = search;
    sEl.oninput = e=>renderCountryList(e.target.value);
  }

  /* ──────────────────────────────
     5) Пересчёт
  ────────────────────────────── */
  function calcTotals () {
    const code   = el.summaInput.dataset.currency || el.valuteDisplay.textContent;
    const amount = parseFloat(el.summaInput.value.replace(/\D/g,'')) || 0;

    // курс: приоритетно агентский
    let rate = adminRates[code]?.agent;
    if (!rate && currencyData[code])
      rate = currencyData[code].Value / currencyData[code].Nominal;
    if (!rate) return;                          // нет данных – тихо выходим

    const rub   = amount * rate;
    const fee   = Math.max(Math.round(rub * 0.0036), 60000);
    const total = Math.round(rub + fee);

    if (el.resultPrice && el.commissionPrice){
      el.resultPrice.textContent     = total.toLocaleString('ru-RU') + ' ₽';
      el.commissionPrice.textContent = fee  .toLocaleString('ru-RU') + ' ₽';
    }
  }

  /* пересчёт при вводе суммы */
  el.summaInput.oninput = () => {
    el.summaInput.value = el.summaInput.value.replace(/\D/g,'')
                           .replace(/\B(?=(\d{3})+(?!\d))/g,' ');
    updateCurrencyLabel();
    calcTotals();
  };

  /* позиционирование ярлыка валюты */
  function updateCurrencyLabel(){
    const len = el.summaInput.value.replace(/\D/g,'').length;
    el.curLabel.style.visibility = len ? 'visible':'hidden';
    if (len){
      const w = parseInt(getComputedStyle(el.summaInput).fontSize) * 0.65;
      el.curLabel.style.left = (len * w + 10) + 'px';
    }
  }
  updateCurrencyLabel();

  /* ──────────────────────────────
     6) UI-вспомогательные
  ────────────────────────────── */
  function toggleList (list, show = !list.classList.contains('active')){
    if (show){
      document.querySelectorAll('.active').forEach(x=>x.classList.remove('active'));
      list.classList.add('active');
      const s = list.querySelector('input'); if (s) s.focus();
    } else list.classList.remove('active');
  }

  el.valuteTrigger.onclick  = e => { e.stopPropagation(); toggleList(el.countryList,false); toggleList(el.valuteList);  };
  el.countryTrigger.onclick = e => { e.stopPropagation(); toggleList(el.valuteList,false);  toggleList(el.countryList); };

  document.addEventListener('click', () => {
    toggleList(el.valuteList,false);
    toggleList(el.countryList,false);
  });

  /* ──────────────────────────────
     7) Валидация / submit
  ────────────────────────────── */
  function initPhoneMask (input){
    if (typeof Inputmask === 'undefined'){
      input.addEventListener('input', ()=>{
        input.value = input.value.replace(/\D/g,'');
        if (input.value.length && input.value[0] !== '7')
          input.value = '7' + input.value.slice(1);
        checkFormValidity();
      });
      return;
    }
    new Inputmask({
      mask:'+7 (999) 999-99-99', showMaskOnHover:false, clearIncomplete:true,
      placeholder:'_',
      onBeforePaste(p){
        const d=p.replace(/\D/g,'');
        return d.startsWith('7')||d.startsWith('8') ? '7'+d.slice(1) : '7'+d;
      },
      oncomplete:checkFormValidity, onincomplete:checkFormValidity
    }).mask(input);
  }

  function checkFormValidity(){
    const okPhone = el.phoneInput.inputmask
          ? el.phoneInput.inputmask.isComplete()
          : el.phoneInput.value.replace(/\D/g,'').length === 11;
    const okCheck = el.checkbox ? el.checkbox.checked : true;
    const okName  = !profanityRegex.test(el.nameInput.value.trim());

    const valid = okPhone && okCheck && okName;
    el.submitBtn.disabled        = !valid;
    el.submitBtn.style.opacity   = valid ? '1':'0.5';
    el.submitBtn.style.pointerEvents = valid ? 'auto':'none';
  }

  function setupFormValidation(){
    el.phoneInput.addEventListener('input', ()=>setTimeout(checkFormValidity,50));
    el.phoneInput.addEventListener('change', checkFormValidity);
    if (el.checkbox) el.checkbox.addEventListener('change', checkFormValidity);

    el.nameInput.addEventListener('input', ()=>{
      const v = el.nameInput.value.trim();
      if (profanityRegex.test(v)){
        el.nameError.style.display = 'block';
        el.nameInput.style.borderColor = 'red';
      } else {
        el.nameError.style.display = 'none';
        el.nameInput.style.borderColor = '';
      }
      setTimeout(checkFormValidity,50);
    });
    el.nameInput.addEventListener('keypress', e => { if (/\d/.test(e.key)) e.preventDefault(); });

    checkFormValidity();
  }

  /* отправка */
  let isMarketingChecked = false;
  if (el.marketingCheckbox)
    el.marketingCheckbox.addEventListener('change', e => { isMarketingChecked = e.target.checked; });

  function setupSubmitHandler(){
    el.submitBtn.addEventListener('click', async e=>{
      e.preventDefault();
      if (el.submitBtn.disabled) return;

      const phone = el.phoneInput.inputmask
        ? '+7' + el.phoneInput.inputmask.unmaskedvalue()
        : '+7' + el.phoneInput.value.replace(/\D/g,'');

      const data = {
        Email: '',
        Name : el.nameInput.value.trim(),
        OrganizationName:'',
        PhoneNumber: phone.slice(0,12),
        Placement: 'a7-agent',
        Source  : new URLSearchParams(location.search).get('utm_source')   || '',
        Campaign: new URLSearchParams(location.search).get('utm_campaign') || '',
        TransferCurrency: el.valuteDisplay.textContent.trim(),
        TransferCountry : el.countryTrigger.querySelector('p').textContent.trim(),
        TransferAmount  : el.summaInput.value.replace(/\s/g,''),
        isPersonalDataAccepted: true,
        isMarketingConsentGiven: isMarketingChecked
      };

      el.submitBtn.textContent = 'Отправка…';
      el.submitBtn.disabled    = true;

      try{
        const r = await fetch(getApiUrl(), {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify(data)
        });
        if (!r.ok) throw new Error('network');
        setTimeout(()=>el.thxModal.classList.add('active'),200);
      } catch(err){
        console.error('[transferCalc] submit:', err);
        alert('Не удалось отправить форму. Попробуйте позже.');
      } finally {
        el.submitBtn.textContent = 'Оставить заявку';
        checkFormValidity();
      }
    });
  }

  /* Helper для URL формы */
  function getApiUrl(){
    const { protocol, host, pathname } = location;
    const base = `${protocol}//${host}${pathname}`;
    return base === 'https://a7-agent.ru/'
      ? 'https://form.a7-agent.ru/api/LeadBackA7/SubmitFeedbackCalculator'
      : 'https://vps1.4a-consult.ru:8017/api/LeadBackA7/SubmitFeedbackCalculator';
  }

});