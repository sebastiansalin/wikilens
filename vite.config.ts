import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({ plugins: [{name:'wikilens-browser-storage',enforce:'pre',resolveId(source,importer){if(source==='./database.mjs'&&/\/server\/(service|history)\.mjs$/.test(importer?.replaceAll('\\','/')||''))return fileURLToPath(new URL('./src/browser-database.mjs',import.meta.url));}},react()], server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:8787' } } });
