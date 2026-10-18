const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const LIMITS = {
  name: 80,
  email: 254,
  passwordMin: 8,
  password: 128,
  title: 200,
  speakerName: 60,
  searchMin: 2,
  search: 200,
};

function emailError(raw) {
  const email = raw.trim();
  if (!email) return 'Email is required.';
  if (email.length > LIMITS.email || !EMAIL.test(email)) return 'Please enter a valid email address.';
  return null;
}

function compact(errors) {
  return Object.fromEntries(Object.entries(errors).filter(([, v]) => v));
}

export function validateLogin({ email, password }) {
  return compact({
    email: emailError(email),
    password: !password ? 'Password is required.' : password.length > LIMITS.password ? 'Password is too long.' : null,
  });
}

export function validateRegister({ name, email, password }) {
  const n = name.trim();
  let passwordErr = null;
  if (!password) passwordErr = 'Password is required.';
  else if (password.length < LIMITS.passwordMin) passwordErr = `Password must be at least ${LIMITS.passwordMin} characters.`;
  else if (password.length > LIMITS.password) passwordErr = `Password must be at most ${LIMITS.password} characters.`;
  else if (!/[A-Za-z]/.test(password)) passwordErr = 'Password must contain a letter.';
  else if (!/\d/.test(password)) passwordErr = 'Password must contain a number.';
  return compact({
    name: !n ? 'Name is required.' : n.length < 2 ? 'Name must be at least 2 characters.' : n.length > LIMITS.name ? `Name must be at most ${LIMITS.name} characters.` : null,
    email: emailError(email),
    password: passwordErr,
  });
}

export function validateTitle(raw) {
  const title = raw.trim();
  if (!title) return 'Title cannot be empty.';
  if (title.length > LIMITS.title) return `Title must be at most ${LIMITS.title} characters.`;
  return null;
}

export function isValidDateRange(from, to) {
  return !from || !to || from <= to;
}
