// utils.js
export function showToast(msg, type='info'){
  const toastContainer = document.getElementById('toastContainer');
  if(!toastContainer) {
    console.log('[showToast] Нет контейнера toastContainer!');
    return;
  }
  console.log('[showToast]', msg, type);
  const t = document.createElement('div');
  t.classList.add('toast');
  switch(type){
    case 'success': t.style.background='#2ecc71'; break;
    case 'error':   t.style.background='#e74c3c'; break;
    default:        t.style.background='#3498db'; break;
  }
  t.textContent = msg;
  toastContainer.appendChild(t);
  setTimeout(()=>{
    if(toastContainer.contains(t)){
      toastContainer.removeChild(t);
    }
  }, 4500);
}

export function showPreview(html){
  console.log('[showPreview] Показ превью контента...');
  const previewModal = document.getElementById('previewModal');
  const previewContent = document.getElementById('previewContent');
  if(!previewModal||!previewContent)return;
  previewContent.innerHTML = html;
  previewModal.style.display='flex';
}

export function closePreview(){
  const previewModal = document.getElementById('previewModal');
  const previewContent = document.getElementById('previewContent');
  if(previewModal){
    previewModal.style.display='none';
  }
  if(previewContent){
    previewContent.innerHTML='';
  }
  console.log('[closePreview] Превью скрыто.');
}

export function generateUNP(){
  const num = Math.floor(Math.random()*1000000);
  return `УНП-${String(num).padStart(6,'0')}`;
}

export function readFileAndStore(file, callback){
  if(!file){
    callback('');
    return;
  }
  console.log('[readFileAndStore] Считываем файл:', file.name);
  let reader=new FileReader();
  reader.onload = function(e){
    let dataURL=e.target.result;
    callback(dataURL);
  };
  reader.readAsDataURL(file);
}

// Пример глобального лоадера
export function showLoader(){
  console.log('[showLoader] Показываем loader...');
  const loader = document.getElementById('globalLoader');
  if(loader) loader.style.display='flex';
}
export function hideLoader(){
  console.log('[hideLoader] Скрываем loader...');
  const loader = document.getElementById('globalLoader');
  if(loader) loader.style.display='none';
}
/**
 * Задерживает выполнение fn до тех пор,
 * пока за последние wait мс не было нового вызова.
 */
export function debounce(fn, wait = 300) {
  let timeoutId;
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), wait);
  };
}

/**
 * Ограничивает выполнение fn не чаще одного раза
 * в каждый интервал wait мс.
 */
export function throttle(fn, wait = 200) {
  let lastTime = 0;
  return function(...args) {
    const now = Date.now();
    if (now - lastTime >= wait) {
      lastTime = now;
      fn.apply(this, args);
    }
  };
}