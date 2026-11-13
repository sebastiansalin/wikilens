import { spawnSync } from 'node:child_process';
const result=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--outDir','previews/wikilens'],{stdio:'inherit',env:{...process.env,VITE_DATA_MODE:'browser'}});
process.exit(result.status??1);
