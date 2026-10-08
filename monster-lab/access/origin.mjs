// SITE_ORIGIN is typed by hand in a dashboard, so accept the usual slips (no scheme, trailing slash,
// upper case, a path) and reduce it to a clean "https://host". Returns '' when unusable.
export function normalizeOrigin(input) {
  let v = String(input ?? '').trim();
  if (!v) return '';
  if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
  try { return new URL(v).origin.toLowerCase(); } catch { return ''; }
}
// Origins a browser may legitimately POST from: the configured site, plus its www/apex twin.
export function allowedOrigins(siteOrigin) {
  const o = normalizeOrigin(siteOrigin);
  if (!o) return [];
  const u = new URL(o), twin = u.hostname.startsWith('www.') ? u.hostname.slice(4) : 'www.' + u.hostname;
  return [o, `${u.protocol}//${twin}`];
}
