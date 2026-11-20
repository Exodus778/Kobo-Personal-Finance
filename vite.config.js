import { defineConfig } from 'vite';

// Built-app preview headers permit the Arena preview frame. Cloudflare Pages
// uses public/_headers instead, with stricter no-framing production policy.
const securityHeaders = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self' https://api.frankfurter.dev https://cdn.jsdelivr.net https://*.currency-api.pages.dev",
    "form-action 'self'",
    "frame-ancestors 'self' https://arena.ai https://*.arena.ai",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  server: { host: '0.0.0.0', allowedHosts: ['.e2b.app'] },
  preview: { host: '0.0.0.0', allowedHosts: ['.e2b.app'], headers: securityHeaders },
});
