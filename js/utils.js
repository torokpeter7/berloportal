export function qs(selector, scope = document) {
  return scope.querySelector(selector);
}

export function qsa(selector, scope = document) {
  return Array.from(scope.querySelectorAll(selector));
}

export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function formatCurrency(value = 0, currency = 'HUF') {
  const numberValue = Number(value) || 0;
  return new Intl.NumberFormat('hu-HU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(numberValue);
}

export function formatNumber(value = 0, fractionDigits = 0) {
  const numberValue = Number(value) || 0;
  return new Intl.NumberFormat('hu-HU', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(numberValue);
}

export function formatDate(value) {
  if (!value) return 'Nincs megadva';
  const date = new Date(value);
  return new Intl.DateTimeFormat('hu-HU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export function formatDateTime(value) {
  if (!value) return 'Nincs megadva';
  const date = new Date(value);
  return new Intl.DateTimeFormat('hu-HU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function monthKey(date = new Date()) {
  const current = new Date(date);
  return `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
}

export function startOfMonth(date = new Date()) {
  const current = new Date(date);
  return new Date(current.getFullYear(), current.getMonth(), 1);
}

export function endOfMonth(date = new Date()) {
  const current = new Date(date);
  return new Date(current.getFullYear(), current.getMonth() + 1, 0);
}

export function addMonths(date, months) {
  const current = new Date(date);
  return new Date(current.getFullYear(), current.getMonth() + months, 1);
}

export function debounce(fn, delay = 300) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container') || createToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon"><i class="fa-solid ${toastIcon(type)}"></i></span>
    <span class="toast-message">${escapeHtml(message)}</span>
  `;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 220);
  }, 3800);
}

function toastIcon(type) {
  switch (type) {
    case 'success':
      return 'fa-circle-check';
    case 'error':
      return 'fa-triangle-exclamation';
    case 'warning':
      return 'fa-circle-exclamation';
    default:
      return 'fa-circle-info';
  }
}

function createToastContainer() {
  const container = document.createElement('div');
  container.id = 'toast-container';
  container.className = 'toast-container';
  document.body.appendChild(container);
  return container;
}

export function openModal(modal) {
  if (!modal) return;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
}

export function closeModal(modal) {
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
}

export function wireModalClose(modal) {
  const closeTargets = modal.querySelectorAll('[data-close-modal]');
  closeTargets.forEach((button) => button.addEventListener('click', () => closeModal(modal)));
  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeModal(modal);
    }
  });
}

export function confirmDialog(message, confirmLabel = 'Megerősítés') {
  return new Promise((resolve) => {
    const existing = document.getElementById('confirm-dialog');
    if (existing) {
      existing.remove();
    }

    const wrapper = document.createElement('div');
    wrapper.id = 'confirm-dialog';
    wrapper.className = 'modal open';
    wrapper.innerHTML = `
      <div class="modal-dialog modal-sm">
        <div class="modal-header">
          <div>
            <h3>Megerősítés</h3>
            <p>${escapeHtml(message)}</p>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-cancel>Nem</button>
          <button type="button" class="btn btn-danger" data-confirm>${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `;

    document.body.appendChild(wrapper);
    document.body.classList.add('modal-open');

    wrapper.querySelector('[data-cancel]').addEventListener('click', () => {
      wrapper.remove();
      document.body.classList.remove('modal-open');
      resolve(false);
    });

    wrapper.querySelector('[data-confirm]').addEventListener('click', () => {
      wrapper.remove();
      document.body.classList.remove('modal-open');
      resolve(true);
    });
  });
}

export function setLoadingState(container, message = 'Betöltés...') {
  if (!container) return;
  container.innerHTML = `
    <div class="empty-state empty-state-loading">
      <div class="spinner"></div>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

export function emptyState(title, description, icon = 'fa-folder-open') {
  return `
    <div class="empty-state">
      <div class="empty-state-icon"><i class="fa-solid ${icon}"></i></div>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(description)}</p>
    </div>
  `;
}

export function readForm(form) {
  const formData = new FormData(form);
  return Object.fromEntries(formData.entries());
}

export function normalizeBoolean(value) {
  return value === true || value === 'true' || value === 'on' || value === '1';
}

export function sum(values = []) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

export function parseMonthInput(value) {
  if (!value) return null;
  const [year, month] = value.split('-').map(Number);
  if (!year || !month) return null;
  return new Date(year, month - 1, 1).toISOString();
}

export function toMonthInput(value) {
  if (!value) return monthKey();
  const date = new Date(value);
  return monthKey(date);
}
