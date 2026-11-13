/** Run in Sebastian's normal PowerShell: node scripts/bootstrap-local.mjs
 * Git only, independently of database/dependencies: node scripts/bootstrap-local.mjs --git-only
 * Project-scoped setup. No service, PATH, firewall, browser, or machine policy changes.
 * Secrets are generated locally, kept in ignored files, and never printed.
 */
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createConnection as tcpConnect } from 'node:net';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
const gitOnly=process.argv.includes('--git-only');
const local=join(root,'.local'),runtime=join(local,'mariadb-runtime'),report=join(local,gitOnly?'git-publish-status.json':'bootstrap-status.json');
mkdirSync(runtime,{recursive:true});
const state={startedAt:new Date().toISOString(),completed:[],status:'running'};
function save(){writeFileSync(report,JSON.stringify(state,null,2)+'\n');}
function note(message){console.log(`\n[WikiLens] ${message}`);}
function complete(step,details={}){state.completed.push({step,at:new Date().toISOString(),...details});save();}
// This explicitly requested shared workspace is owned by CodexSandboxOffline.
// Trust only this exact directory for these Git commands; do not change global settings.
const commandArgs=(command,args)=>command==='git'?['-c',`safe.directory=${root.replaceAll('\\','/')}`,...args]:args;
function run(command,args,options={}){
 const result=spawnSync(command,commandArgs(command,args),{cwd:root,stdio:'inherit',windowsHide:true,...options});
 if(result.error)throw new Error(`${command} could not start (${result.error.code||'unknown error'})`);
 if(result.status!==0)throw new Error(`${command} failed with exit code ${result.status}`);
 return result;
}
function capture(command,args){
 const result=spawnSync(command,commandArgs(command,args),{cwd:root,stdio:['ignore','pipe','pipe'],encoding:'utf8',windowsHide:true});
 if(result.error)throw new Error(`${command} could not start (${result.error.code||'unknown error'})`);
 if(result.status!==0){
  if(command==='gh')throw new Error('GitHub CLI cannot access sebastiansalin/wikilens. Run: gh auth login --hostname github.com --web, then retry. If already signed in, check that the signed-in account can open that repository.');
  throw new Error(`${command} failed with exit code ${result.status}. ${result.stderr?.trim()||''}`);
 }
 return result.stdout.trim();
}
async function checkDependencies(){
 try{await import('mariadb');}
 catch(error){
  if(error.code==='ERR_MODULE_NOT_FOUND'||error.code==='MODULE_NOT_FOUND')throw new Error('Project dependencies are incomplete. Run npm install in this folder, then rerun this script. To upload Git independently, add --git-only.');
  throw error;
 }
}
const psQuote=value=>"'"+String(value).replaceAll("'","''")+"'";
async function download(url,path){
 if(existsSync(path))return;
 const response=await fetch(url,{signal:AbortSignal.timeout(180000),headers:{'User-Agent':'WikiLens-local-setup/1.0'}});
 if(!response.ok)throw new Error(`Download failed (${response.status}) for ${new URL(url).pathname}`);
 const {Readable}=await import('node:stream'),{pipeline}=await import('node:stream/promises'),{createWriteStream}=await import('node:fs');
 await pipeline(Readable.fromWeb(response.body),createWriteStream(path+'.part'));
 renameSync(path+'.part',path);
}
async function hash(path){return createHash('sha256').update(await readFile(path)).digest('hex');}
async function portOpen(){return new Promise(resolve=>{const socket=tcpConnect({host:'127.0.0.1',port:3307});socket.setTimeout(1000);socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('error',()=>resolve(false));socket.once('timeout',()=>{socket.destroy();resolve(false);});});}

async function setupMaria(){
 const version='11.4.12',name=`mariadb-${version}-winx64.zip`;
 const base=`https://dlm.mariadb.com/MariaDB/mariadb-${version}/winx64-packages/`;
 const archive=join(runtime,name),sums=join(runtime,'sha256sums.txt');
 note('Downloading and verifying the official portable MariaDB package.');
 await download(base+'sha256sums.txt',sums);await download(base+name,archive);
 const line=readFileSync(sums,'utf8').split(/\r?\n/).find(line=>line.trim().endsWith(name));
 const expected=line?.match(/^[a-f0-9]{64}/i)?.[0].toLowerCase();
 if(!expected||await hash(archive)!==expected)throw new Error('MariaDB checksum mismatch; nothing will be executed');
 const basedir=join(runtime,`mariadb-${version}-winx64`),binary=join(basedir,'bin','mariadbd.exe');
 if(!existsSync(binary))run('powershell.exe',['-NoProfile','-Command',`Expand-Archive -LiteralPath ${psQuote(archive)} -DestinationPath ${psQuote(runtime)}`]);
 if(!existsSync(binary))throw new Error('MariaDB archive did not contain the expected executable');
 complete('MariaDB package verified',{version,sha256:expected});
 const credentialsPath=join(runtime,'local-accounts.json'),datadir=join(runtime,'data'),config=join(runtime,'wikilens.ini');
 // Application code consumes these secrets; never print/read them into conversation.
 let accounts;
 if(existsSync(credentialsPath))accounts=JSON.parse(readFileSync(credentialsPath,'utf8'));
 else {
  if(existsSync(join(datadir,'mysql'))||existsSync(join(root,'.env'))||await portOpen())throw new Error('Existing local configuration found; refusing to replace it');
  accounts={root:randomBytes(32).toString('hex'),app:randomBytes(32).toString('hex')};
  writeFileSync(credentialsPath,JSON.stringify(accounts),'utf8');
 }
 if(!existsSync(join(datadir,'mysql'))){
  note('Initializing the project database with a generated password.');
  // Capture installer output because its arguments include a generated password.
  run(join(basedir,'bin','mariadb-install-db.exe'),[`--datadir=${datadir}`,`--password=${accounts.root}`,'--port=3307','--silent'],{stdio:'pipe'});
 }
 const unix=p=>p.replaceAll('\\','/');
 writeFileSync(config,`[mysqld]\nbasedir=${unix(basedir)}\ndatadir=${unix(datadir)}\nbind-address=127.0.0.1\nport=3307\ncharacter-set-server=utf8mb4\ncollation-server=utf8mb4_unicode_ci\nmax_allowed_packet=64M\nlog-error=${unix(join(runtime,'server-error.log'))}\n`);
 if(!await portOpen()){
  note('Starting MariaDB on 127.0.0.1:3307.');
  const pid=capture('powershell.exe',['-NoProfile','-Command',`$wikilensProcess = Start-Process -FilePath ${psQuote(binary)} -ArgumentList ${psQuote('--defaults-file="'+config+'"')} -WindowStyle Hidden -PassThru; $wikilensProcess.Id`]);
  writeFileSync(join(runtime,'server.pid'),pid+'\n');
  for(let attempt=0;attempt<40&&!await portOpen();attempt++)await new Promise(resolve=>setTimeout(resolve,500));
 }
 const mariadb=(await import('mariadb')).default;
 let connection;
 try {
  connection=await mariadb.createConnection({host:'127.0.0.1',port:3307,user:'root',password:accounts.root,connectTimeout:5000});
  const info=await connection.query('SELECT VERSION() AS version, @@datadir AS datadir');
  if(resolve(info[0].datadir).toLowerCase()!==resolve(datadir).toLowerCase())throw new Error('Port 3307 belongs to a different database instance');
  await connection.query('CREATE DATABASE IF NOT EXISTS wikilens CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  await connection.query("CREATE USER IF NOT EXISTS 'wikilens'@'127.0.0.1' IDENTIFIED BY ?",[accounts.app]);
  await connection.query("GRANT ALL PRIVILEGES ON wikilens.* TO 'wikilens'@'127.0.0.1'");
  if(!existsSync(join(root,'.env')))writeFileSync(join(root,'.env'),`MARIADB_HOST=127.0.0.1\nMARIADB_PORT=3307\nMARIADB_USER=wikilens\nMARIADB_PASSWORD=${accounts.app}\nMARIADB_DATABASE=wikilens\nMARIADB_SSL=false\n`);
  complete('MariaDB running',{version:info[0].version,host:'127.0.0.1',port:3307});
 }catch(error){throw new Error(`MariaDB configuration failed (${error.code||'configuration mismatch'}). Credentials were not printed.`);}
 finally{if(connection)await connection.end();}
}

async function calculate(){
 const python=join(local,'python','Scripts','python.exe');
 if(!existsSync(python))run('python',['-m','venv',join(local,'python')]);
 note('Installing the Parquet reader into a project-local Python environment.');
 run(python,['-m','pip','install','-r','pipeline/requirements.txt']);
 note('Downloading and verifying all 16 M partitions, then selecting 20 complete histories.');
 run(python,['pipeline/prepare_m.py']);complete('M download and 20-article selection verified');
 run(process.execPath,['scripts/db-init.mjs']);
 run(process.execPath,['pipeline/mariadb-pilot.mjs','.local/m-pilot.jsonl']);complete('M imported and read back from MariaDB SVT');
 run(process.execPath,['pipeline/build-pilot.mjs','.local/m-pilot-from-db.jsonl']);
 const data=JSON.parse(readFileSync('public/data/conflict-pilot.json','utf8'));
 complete('Real scores calculated',{articles:data.articles.length,revisions:data.revisionCount,edges:data.edges.length,engine:data.calculatedVia});
 note('Running tests and creating the production build.');
 // Import the environment inside the child process; never print it.
 run(process.execPath,['--env-file=.env','--test',...readdirSync('tests').filter(p=>p.endsWith('.test.mjs')).map(p=>'tests/'+p)],{env:{...process.env,WIKILENS_DB_INTEGRATION:'1'}});
 run(process.execPath,['node_modules/typescript/bin/tsc','-b']);run(process.execPath,['node_modules/vite/bin/vite.js','build']);
 complete('Tests and production build passed');
}

function publish(){
 note('Checking access to the existing private sebastiansalin/wikilens repository.');
 const repo=JSON.parse(capture('gh',['repo','view','sebastiansalin/wikilens','--json','nameWithOwner,isPrivate,viewerPermission']));
 if(repo.nameWithOwner!=='sebastiansalin/wikilens'||!repo.isPrivate||!['ADMIN','MAINTAIN','WRITE'].includes(repo.viewerPermission))throw new Error('Expected writable private WikiLens repository was not found');
 const remotes=capture('git',['remote']).split(/\r?\n/);
 if(remotes.includes('origin')){
  const origin=capture('git',['remote','get-url','origin']);
  if(!/^https:\/\/github\.com\/sebastiansalin\/wikilens(?:\.git)?$|^git@github\.com:sebastiansalin\/wikilens(?:\.git)?$/.test(origin))throw new Error('Origin points elsewhere; refusing to change it');
 }else run('git',['remote','add','origin','https://github.com/sebastiansalin/wikilens.git']);
 if(capture('git',['branch','--show-current'])!=='main')throw new Error('Current branch is not main; inspect before publishing');
 const remoteMain=capture('git',['ls-remote','origin','refs/heads/main']).split(/\s+/)[0];
 const localHeadExists=spawnSync('git',commandArgs('git',['rev-parse','--verify','HEAD']),{cwd:root,stdio:'ignore',windowsHide:true}).status===0;
 if(remoteMain&&!localHeadExists)throw new Error('GitHub already has commits while this checkout has none. Setup is complete; ask ChatGPT to reconcile history before publishing');
 // Explicit source paths: no raw data, credentials, build output or local runtime.
 const paths=['.env.example','.gitignore','AGENTS.md','README.md','api','db','docs','index.html','package.json','pipeline','public','scripts','server','src','tests','tsconfig.json','vendor','vercel.json','vite.config.ts'];
 if(existsSync('package-lock.json'))paths.push('package-lock.json');
 if(!gitOnly)writeFileSync('docs/qa/local-bootstrap.md','# Local bootstrap evidence\n\n'+JSON.stringify(state,null,2)+'\n\nThis records locally observed setup and calculations. It does not claim production deployment or comparative scoring accuracy.\n');
 run('git',['add','--',...paths]);
 const staged=capture('git',['diff','--cached','--name-only']).split(/\r?\n/).filter(Boolean);
 if(staged.some(p=>/(?:^|\/)\.env(?:\.|$)/.test(p)&&p!=='.env.example'||/(?:^|\/)(?:\.local|node_modules|dist|\.vercel)\//.test(p)||/\.parquet$|\.jsonl(?:\.|$)/.test(p)))throw new Error('A private/runtime path was staged; refusing to commit');
 if(staged.length)run('git',['commit','-m','Build WikiLens M conflict pilot with evidence and project documentation']);
 run('git',['push','-u','origin','main']); // Normal fast-forward only, never force.
 const localHead=capture('git',['rev-parse','HEAD']),remoteHead=capture('git',['ls-remote','origin','refs/heads/main']).split(/\s+/)[0];
 if(localHead!==remoteHead)throw new Error('GitHub head did not match the local commit');
 complete('GitHub upload verified',{repository:repo.nameWithOwner,commit:localHead});
}

save();
try{
 if(process.platform!=='win32')throw new Error('This bootstrap is for the project’s Windows machine');
 if(!gitOnly){await checkDependencies();await setupMaria();await calculate();}
 publish();state.status='complete';save();note(`Finished. Tell ChatGPT "${gitOnly?'Git upload':'bootstrap'} finished"; the status file contains no credentials.`);
}catch(error){state.status='blocked';state.error=error.message;save();console.error(`\n[WikiLens] Stopped: ${error.message}\nProgress saved in .local/${gitOnly?'git-publish-status':'bootstrap-status'}.json. Tell ChatGPT to inspect it.`);process.exitCode=1;}
