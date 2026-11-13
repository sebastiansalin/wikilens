import { dispatch } from './service.mjs';
import { ApiError } from './core.mjs';

export function handler(path) {
  return async function apiHandler(req, res) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); res.statusCode = 405; res.end(JSON.stringify({ error: 'Use a GET request.' })); return; }
    try {
      const url = new URL(req.url, 'http://localhost');
      const data = await dispatch(path, url.searchParams);
      res.statusCode = 200;
      res.setHeader('Cache-Control', path === 'health' ? 'no-store' : 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
      res.end(JSON.stringify(data));
    } catch (error) {
      res.statusCode = error instanceof ApiError ? error.status : 500;
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ error: error instanceof ApiError ? error.message : 'The request could not be completed. Please try again.' }));
    }
  };
}
