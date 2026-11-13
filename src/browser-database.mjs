// Browser mode has no database access. Never import Node or credentials into this module.
export function databaseConfigured() { return false; }
export function snapshotKey(lang, title) { return `browser:v3:${lang}:${title}`; }
export async function getPool() { return null; }
export async function databaseHealth() { return { mode: 'wikipedia', database: 'not-configured', transport: 'browser' }; }
export async function readSnapshot() { return null; }
export async function writeSnapshot() { return false; }
export function databaseNotice() { return null; }
export async function closeDatabase() {}
export async function traverse() { throw new Error('MariaDB traversal is unavailable in browser data mode.'); }
export async function neighbourhood() { throw new Error('MariaDB neighbourhoods are unavailable in browser data mode.'); }
export async function shortestPath() { throw new Error('MariaDB paths are unavailable in browser data mode.'); }
