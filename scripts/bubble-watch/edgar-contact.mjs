// SEC EDGAR declared-contact resolution. SEC's automated-access policy asks for a
// declared tool identity with a deliverable admin contact. The repository must not
// hardcode a personal address, so the contact is supplied by an explicit, separately
// injected environment value; when it is absent or malformed the existing identity is
// kept unchanged (safe fallback, no silent substitution and no guessed address).
//
// This module never prints or returns the configured value as a diagnostic: callers may
// log only the mode and reason code.
export const EDGAR_CONTACT_ENV = 'BUBBLE_WATCH_EDGAR_CONTACT';

// "Name AdminContact@example-company.com": one declared application identity followed by
// one contact address. Deliberately strict: ASCII only, no header separators.
const DECLARED_CONTACT = /^[A-Za-z0-9][A-Za-z0-9 .&'()/_+-]{1,80} {1,4}[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/u;
const CONTROL_OR_ODD = /[\u0000-\u001f\u007f\u0080-\u009f]/u;

export function resolveEdgarIdentity(env = {}, fallbackUserAgent = '') {
  const raw = typeof env?.[EDGAR_CONTACT_ENV] === 'string' ? env[EDGAR_CONTACT_ENV].trim() : '';
  if (!raw) return { userAgent: fallbackUserAgent, configured: false, reason: 'not_configured' };
  if (raw.length < 8 || raw.length > 200) return { userAgent: fallbackUserAgent, configured: false, reason: 'invalid_length' };
  if (CONTROL_OR_ODD.test(raw)) return { userAgent: fallbackUserAgent, configured: false, reason: 'invalid_characters' };
  if (!DECLARED_CONTACT.test(raw)) return { userAgent: fallbackUserAgent, configured: false, reason: 'invalid_format' };
  return { userAgent: raw, configured: true, reason: null };
}

// Log-safe status: no user agent, no address, no contact fragment.
export function describeEdgarIdentity(env = {}) {
  const identity = resolveEdgarIdentity(env, '');
  return identity.configured ? 'configured' : `fallback (${identity.reason})`;
}
