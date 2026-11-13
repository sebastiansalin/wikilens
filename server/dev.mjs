import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
if (existsSync('.env')) loadEnvFile('.env');
const { handler } = await import('./http.mjs');
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname.replace(/^\/api\//, '');
  handler(path)(req, res);
});
const port = Number(process.env.API_PORT || 8787);
server.listen(port, '127.0.0.1', () => console.log(`WikiLens API listening at http://127.0.0.1:${port}`));
