/****************************************************************************
 * public/scripts/auth.js
 * --------------------------------------------------------------------------
 * Логика авторизации и регистрации пользователей.
 * Хранение данных — через dbStorage (IndexedDB-wrapper).
 * Экспортируются функции, которые дергаются из main.js:
 *   • checkAuthStatus()
 *   • handleLoginForm(e)
 *   • handleRegisterForm(e)
 *   • handleLogout()
 ****************************************************************************/

import { showToast }      from './utils.js';
import { getItem, setItem } from './dbStorage.js';

/**
 * Проверяет, авторизован ли текущий пользователь.
 * @returns {Promise<boolean>}
 */
export async function checkAuthStatus() {
  return (await getItem('isLoggedIn')) === 'true';
}

/**
 * Обработка сабмита формы логина.
 * @param {SubmitEvent} e
 */
export async function handleLoginForm(e) {
  e.preventDefault();

  const login    = (e.target.modalEmail?.value   || '').trim();
  const password = (e.target.modalPassword?.value|| '').trim();

  if (login === 'admin@mail.ru' && password === '123456') {
    const adminUser = {
      email:          'admin@mail.ru',
      password:       '123456',   // в проде — хэш
      role:           'admin',
      feePercent:     0,
      currentBalance: 0,
      directorName:   '',
      agreementNo:    '',
      agreementDate:  ''
    };
  
    /*  ►►  вот эти две строки  ◄◄  */
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('currentUser', JSON.stringify(adminUser));
  
    /* — если хотите, дублируйте и в IndexedDB — */
    await setItem('isLoggedIn', 'true');
    await setItem('currentUser', JSON.stringify(adminUser));
  
    closeModalById('loginModal');
    showToast('Вход как Админ!', 'success');
    window.dispatchEvent(new CustomEvent('authChanged'));
    return;
  }

  /***** 2) ОБЫЧНЫЙ ПОЛЬЗОВАТЕЛЬ **************************************/
  const usersRaw = await getItem('users');
  const users    = usersRaw ? JSON.parse(usersRaw) : [];

  const user = users.find(
    u => u.email === login && u.password === password
  );

  if (user) {
    if (!user.role) user.role = 'user';  // для старых записей

    await setItem('isLoggedIn', 'true');
    await setItem('currentUser', JSON.stringify(user));
    
    AppState.isAdmin = (user.role === 'admin');
    localStorage.setItem('isLoggedIn','true');
    localStorage.setItem('currentUser', JSON.stringify(user));

    closeModalById('loginModal');
  showToast('Добро пожаловать!', 'success');
  window.dispatchEvent(new CustomEvent('authChanged'));
}

  /***** 3) НЕВЕРНЫЙ ЛОГИН/ПАРОЛЬ *************************************/
  showToast('Неправильный логин или пароль!', 'error');
}

/**
 * Обработка сабмита формы регистрации.
 * @param {SubmitEvent} e
 */
export async function handleRegisterForm(e) {
  e.preventDefault();

  const usersRaw = await getItem('users');
  const users    = usersRaw ? JSON.parse(usersRaw) : [];

  const fd = new FormData(e.target);

  const rEmail        = (fd.get('rEmail')        || '').trim();
  const rPassword     = (fd.get('rPassword')     || '').trim();
  const rPassword2    = (fd.get('rPassword2')    || '').trim();
  const companyName   = (fd.get('companyName')   || '').trim();
  const inn           = (fd.get('inn')           || '').trim();
  const address       = (fd.get('address')       || '').trim();
  const bankName      = (fd.get('bankName')      || '').trim();
  const bik           = (fd.get('bik')           || '').trim();
  const accountNumber = (fd.get('accountNumber') || '').trim();
  const phone         = (fd.get('phone')         || '').trim();
  const directorName  = (fd.get('directorName')  || '').trim();
  const agreementNo   = (fd.get('agreementNo')   || '').trim();
  const agreementDate = (fd.get('agreementDate') || '').trim();

  /* === валидация === */
  if (!rEmail || !rPassword || !rPassword2) {
    showToast('Заполните e-mail и пароль!', 'error');     return;
  }
  if (users.some(u => u.email === rEmail)) {
    showToast('Пользователь с таким e-mail уже существует!', 'error'); return;
  }
  if (rPassword !== rPassword2) {
    showToast('Пароли не совпадают!', 'error');           return;
  }
  if (!companyName || !inn || !address || !bankName || !bik || !accountNumber) {
    showToast('Заполните все обязательные реквизиты!', 'error'); return;
  }

  /* === создание новой записи === */
  const newUser = {
    email:          rEmail,
    password:       rPassword,
    companyName,
    inn,
    address,
    bankName,
    bik,
    accountNumber,
    phone,
    directorName,
    agreementNo,
    agreementDate,
    feePercent:     0,
    currentBalance: 0,
    notifications:  [],
    role:           'user'
  };

  users.push(newUser);
  await setItem('users', JSON.stringify(users));
  await setItem('isLoggedIn','true');
  await setItem('currentUser', JSON.stringify(newUser));
  localStorage.setItem('isLoggedIn','true');
  localStorage.setItem('currentUser', JSON.stringify(newUser));

  showToast('Регистрация успешна!', 'success');
  closeModalById('registerModal');
  e.target.reset();
}

/**
 * Выход пользователя (вызывается по клику «Выход»).
 */
// auth.js  (или где у вас handleLogout)
export async function handleLogout() {
  await setItem('isLoggedIn', 'false');
  await setItem('currentUser',  '');
  /* ⬇︎ новый сброс в рантайме */
  AppState.isAdmin = false;

  showToast('Вы вышли из системы!', 'success');
  window.dispatchEvent(new CustomEvent('authChanged'));
}

/* ========================================================================
 *                            ВСПОМОГАТЕЛЬНЫЕ
 * ===================================================================== */

/**
 * Быстро закрыть модальное окно по id.
 * @param {string} modalId
 */
function closeModalById(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.style.display = 'none';
}