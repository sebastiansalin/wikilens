// Explicit browser-only data mode. Production keeps the server/MariaDB API by default.
// Vite aliases service.mjs's exact './database.mjs' import to browser-database.mjs.
import { dispatch } from '../server/service.mjs';

export async function dispatchUrl(url) {
  const parsed = new URL(url, typeof location === 'undefined' ? 'http://localhost' : location.origin);
  return dispatch(parsed.pathname.replace(/^\/api\//, ''), parsed.searchParams);
}
