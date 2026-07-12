export function toPosix(value) {
  return String(value).replace(/\\/g, '/');
}

export function hasUriScheme(value) {
  return /^[a-z][a-z0-9+.-]*:/i.test(String(value));
}

export function isRelativeResource(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.startsWith('#') || raw.startsWith('/') || raw.startsWith('<')) return false;
  if (hasUriScheme(raw)) return false;
  return true;
}
