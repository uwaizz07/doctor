import { clinicConfig, appointmentStatuses, paymentStatuses } from './config.js';

export function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container') || createToastContainer();
  const toast = document.createElement('div');
  const colors = {
    success: 'bg-emerald-500',
    error: 'bg-red-500',
    warning: 'bg-amber-500',
    info: 'bg-blue-500'
  };
  const icons = {
    success: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke-linecap="round" stroke-linejoin="round"/><polyline points="22 4 12 14.01 9 11.01"/>',
    error: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
    warning: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>'
  };

  toast.className = `flex items-center gap-3 ${colors[type]} text-white px-4 py-3 rounded-lg shadow-lg transform transition-all duration-300 translate-x-full opacity-0 max-w-sm w-full`;
  toast.innerHTML = `
    <svg class="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${icons[type]}</svg>
    <span class="text-sm font-medium flex-1">${message}</span>
    <button class="ml-2 hover:opacity-75 flex-shrink-0" onclick="this.parentElement.remove()" aria-label="Dismiss">
      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  `;

  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.remove('translate-x-full', 'opacity-0');
    toast.classList.add('translate-x-0', 'opacity-100');
  });

  setTimeout(() => {
    toast.classList.add('translate-x-full', 'opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function createToastContainer() {
  const container = document.createElement('div');
  container.id = 'toast-container';
  container.className = 'fixed top-4 right-4 z-[9999] flex flex-col gap-2';
  document.body.appendChild(container);
  return container;
}

export function renderStatusBadge(status, type = 'appointment') {
  const statuses = type === 'appointment' ? appointmentStatuses : paymentStatuses;
  const s = statuses[status] || statuses.pending;
  return `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}">
    <span class="w-1.5 h-1.5 rounded-full ${s.dot || 'bg-current'}"></span>
    ${s.label}
  </span>`;
}

export function showLoading(container) {
  if (typeof container === 'string') container = document.querySelector(container);
  if (!container) return;
  container.innerHTML = `
    <div class="flex items-center justify-center py-12">
      <div class="relative">
        <div class="w-10 h-10 border-4 border-blue-200 rounded-full"></div>
        <div class="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
      </div>
      <span class="ml-3 text-gray-500 font-medium">Loading...</span>
    </div>
  `;
}

export function showEmpty(container, message, actionText, actionHref) {
  if (typeof container === 'string') container = document.querySelector(container);
  if (!container) return;
  const actionHtml = actionText ? `<a href="${actionHref || '#'}" class="mt-4 inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">${actionText}</a>` : '';
  container.innerHTML = `
    <div class="flex flex-col items-center justify-center py-12 text-center">
      <svg class="w-16 h-16 text-gray-300 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
        <rect x="9" y="3" width="6" height="4" rx="1"/>
        <line x1="9" y1="12" x2="15" y2="12"/>
        <line x1="9" y1="16" x2="13" y2="16"/>
      </svg>
      <p class="text-gray-500 font-medium">${message}</p>
      ${actionHtml}
    </div>
  `;
}

export function createSkeleton(rows = 3) {
  let html = '<div class="space-y-3">';
  for (let i = 0; i < rows; i++) {
    html += `
      <div class="animate-pulse flex space-x-4">
        <div class="rounded-full bg-gray-200 h-10 w-10"></div>
        <div class="flex-1 space-y-2 py-1">
          <div class="h-4 bg-gray-200 rounded w-3/4"></div>
          <div class="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    `;
  }
  html += '</div>';
  return html;
}

export function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${m} ${ampm}`;
}

export function formatDateTime(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function isToday(dateStr) {
  const today = new Date().toISOString().split('T')[0];
  return dateStr === today;
}

export function isFuture(dateStr) {
  const today = new Date().toISOString().split('T')[0];
  return dateStr >= today;
}

export function showModal(title, content, actions = []) {
  let existing = document.getElementById('app-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'app-modal';
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
  modal.innerHTML = `
    <div class="fixed inset-0 bg-black/50 backdrop-blur-sm" data-modal-close></div>
    <div class="relative bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto transform transition-all">
      <div class="p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-gray-900">${title}</h3>
          <button class="text-gray-400 hover:text-gray-600 transition-colors" data-modal-close aria-label="Close">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="text-gray-600">${content}</div>
        ${actions.length ? `<div class="flex gap-3 mt-6 justify-end">${actions.map(a => `<button class="${a.class || 'px-4 py-2 rounded-lg text-sm font-medium transition-colors'}" data-modal-action="${a.id}">${a.label}</button>`).join('')}</div>` : ''}
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.querySelectorAll('[data-modal-close]').forEach(el => el.addEventListener('click', () => modal.remove()));
  return modal;
}

export function closeModal() {
  const modal = document.getElementById('app-modal');
  if (modal) modal.remove();
}

export function updateNavAuth(user, profile) {
  const navAuth = document.getElementById('nav-auth');
  const navAuthMobile = document.getElementById('nav-auth-mobile');
  if (!navAuth) return;

  if (user && profile) {
    const isAdmin = profile.role === 'doctor' || profile.role === 'admin';
    navAuth.innerHTML = `
      ${isAdmin ? '<a href="/admin/index.html" class="text-gray-700 hover:text-blue-600 transition-colors text-sm font-medium">Admin</a>' : ''}
      <button data-logout class="text-gray-700 hover:text-red-600 transition-colors text-sm font-medium">Logout</button>
    `;
    if (navAuthMobile) {
      navAuthMobile.innerHTML = `
        ${isAdmin ? '<a href="/admin/index.html" class="block px-4 py-2 text-gray-700 bg-gray-100 hover:bg-blue-50 rounded-lg">Admin</a>' : ''}
        <button data-logout class="block w-full text-left px-4 py-2 text-red-600 bg-gray-100 hover:bg-red-50 rounded-lg">Logout</button>
      `;
    }
  } else {
    navAuth.innerHTML = `
      <a href="/book.html" class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">Book Now</a>
    `;
    if (navAuthMobile) {
      navAuthMobile.innerHTML = `
        <a href="/book.html" class="block px-4 py-2 bg-blue-600 text-white rounded-lg text-center">Book Appointment</a>
      `;
    }
  }
}
