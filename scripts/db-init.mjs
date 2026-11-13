import { existsSync, readFileSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
if (existsSync('.env')) loadEnvFile('.env');
const { getPool, closeDatabase } = await import('../server/database.mjs');
try {
  const pool = await getPool();
  if (!pool) throw new Error('Set MARIADB_HOST, MARIADB_USER and MARIADB_DATABASE in .env first.');
  const sql = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8').replace(/^--.*$/gm, '');
  for (const statement of sql.split(';').map(value => value.trim()).filter(Boolean)) await pool.query(statement);
  const result = await pool.query('SELECT VERSION() AS version');
  console.log(`WikiLens schema ready on MariaDB ${result[0].version}.`);
} catch (error) { console.error(error.code || error.message); process.exitCode = 1; }
finally { await closeDatabase(); }
