export function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

export function validatePhone(phone) {
  const cleaned = phone.replace(/[\s\-\(\)+]/g, '');
  return /^\d{10,15}$/.test(cleaned);
}

export function validateUsername(username) {
  const cleaned = username.toLowerCase().trim();
  if (cleaned.length < 3) return { valid: false, error: 'Username must be at least 3 characters.' };
  if (cleaned.length > 30) return { valid: false, error: 'Username must be 30 characters or fewer.' };
  if (!/^[a-z0-9_]+$/.test(cleaned)) return { valid: false, error: 'Username can only contain lowercase letters, numbers, and underscores.' };
  return { valid: true };
}

export function validatePassword(password) {
  if (password.length < 8) return { valid: false, error: 'Password must be at least 8 characters.' };
  if (!/[A-Z]/.test(password)) return { valid: false, error: 'Password must include an uppercase letter.' };
  if (!/[a-z]/.test(password)) return { valid: false, error: 'Password must include a lowercase letter.' };
  if (!/[0-9]/.test(password)) return { valid: false, error: 'Password must include a number.' };
  return { valid: true };
}

export function validateRequired(value, fieldName) {
  if (!value || (typeof value === 'string' && !value.trim())) {
    return { valid: false, error: `Please enter your ${fieldName}.` };
  }
  return { valid: true };
}

export function validateName(name) {
  if (!name || name.trim().length < 2) return { valid: false, error: 'Please enter your full name.' };
  if (name.trim().length > 100) return { valid: false, error: 'Name is too long.' };
  return { valid: true };
}

export function showFieldError(fieldId, message) {
  const field = document.getElementById(fieldId);
  if (!field) return;
  field.classList.add('border-red-500', 'focus:ring-red-500');
  field.classList.remove('border-gray-300', 'focus:ring-blue-500');
  const existing = field.parentElement.querySelector('.field-error');
  if (existing) existing.remove();
  const errorEl = document.createElement('p');
  errorEl.className = 'field-error text-red-500 text-xs mt-1';
  errorEl.textContent = message;
  field.parentElement.appendChild(errorEl);
}

export function clearFieldError(fieldId) {
  const field = document.getElementById(fieldId);
  if (!field) return;
  field.classList.remove('border-red-500', 'focus:ring-red-500');
  field.classList.add('border-gray-300', 'focus:ring-blue-500');
  const error = field.parentElement.querySelector('.field-error');
  if (error) error.remove();
}

export function clearAllErrors(form) {
  form.querySelectorAll('.field-error').forEach(e => e.remove());
  form.querySelectorAll('.border-red-500').forEach(f => {
    f.classList.remove('border-red-500', 'focus:ring-red-500');
    f.classList.add('border-gray-300', 'focus:ring-blue-500');
  });
}

export function sanitizeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
