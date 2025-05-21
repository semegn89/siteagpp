// dbStorage.js

// Открытие IndexedDB и получение промиса с базой
let dbPromise = new Promise((resolve, reject) => {
  const request = indexedDB.open('AgentAppDB', 3);
  request.onupgradeneeded = event => {
    const db = event.target.result;
    if (!db.objectStoreNames.contains('documents')) {
      db.createObjectStore('documents', { keyPath: 'id' });
    }
    if (!db.objectStoreNames.contains('adminChats')) {
      db.createObjectStore('adminChats', { keyPath: 'chatId', autoIncrement: true });
    }
    if (!db.objectStoreNames.contains('companies')) {
      db.createObjectStore('companies', { keyPath: 'id' });
    }
    if (!db.objectStoreNames.contains('kv')) {
      db.createObjectStore('kv');
    }
  };
  request.onsuccess = event => {
    resolve(event.target.result);
  };
  request.onerror = event => {
    reject(event.target.error);
  };
});

/**
 * Инициализация БД
 * @param {string} name Название БД (игнорируется, используется 'AgentAppDB')
 * @param {number} version Версия БД (игнорируется, используется 3)
 * @returns {Promise<IDBDatabase>}
 */
export function initDB(name, version) {
  return dbPromise;
}

/**
 * Очистка устаревших данных
 * @param {IDBDatabase} db
 * @returns {Promise<void>}
 */
export async function clearOldData(db) {
  // Здесь можно удалить старые или ненужные записи,
  // пока просто заглушка.
  return;
}

/**
 * Получить значение по ключу из хранилища 'kv'
 * @param {string} key
 * @returns {Promise<any>}
 */
export async function getItem(key) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readonly');
    const store = tx.objectStore('kv');
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Установить значение по ключу в хранилище 'kv'
 * @param {string} key
 * @param {any} value
 * @returns {Promise<void>}
 */
export async function setItem(key, value) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    const store = tx.objectStore('kv');
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}