// Settings come from the environment; see README.md.
export const PORT = Number(process.env.PORT ?? 8788);
export const HOST = process.env.HOST ?? '127.0.0.1';
export const DATA = process.env.DATA_DIR ?? new URL('./data/', import.meta.url).pathname;
export const ORIGIN = process.env.ALLOWED_ORIGIN ?? '*';
export const MAX_BYTES = Number(process.env.MAX_MB ?? 100) * 1024 * 1024;
export const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:reminders@example.com';
export const TRUST_PROXY = !!process.env.TRUST_PROXY;
