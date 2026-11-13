import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
if (existsSync('.env')) loadEnvFile('.env');
const { databaseHealth, closeDatabase } = await import('../server/database.mjs');
const { compareQuery } = await import('../server/service.mjs');
const args = process.argv.slice(2);
const languages = args.find(arg => arg.startsWith('--languages='))?.split('=')[1] || 'en,ru,uk';
const titles = args.filter(arg => !arg.startsWith('--'));
try {
  const health = await databaseHealth();
  if (health.database !== 'connected') throw new Error('MariaDB is not ready. Configure .env and run node scripts/db-init.mjs first.');
  for (const title of titles.length ? titles : ['Apple', 'Quantum mechanics', 'Russo-Ukrainian War']) {
    const result = await compareQuery(new URLSearchParams({ title, lang: 'en', languages }));
    for (const edition of result.editions) console.log(`${edition.lang}: ${edition.article?.title || title}: ${edition.graph ? `${edition.graph.stats.mapped} mapped concepts; ${edition.graph.source}` : edition.error}`);
  }
} catch (error) { console.error(error.code || error.message); process.exitCode = 1; }
finally { await closeDatabase(); }
