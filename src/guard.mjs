import { timingSafeEqual } from 'node:crypto';

// The GUI server binds to loopback; the Host header must agree or a DNS-rebinding page could reach it.
export function hostIsLoopback(host) {
  if (!host) return false;
  const h = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

export function tokenMatches(expected, given) {
  if (typeof given !== 'string' || !expected || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(given));
}
