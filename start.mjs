import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
const children=[];
let modelReady=false;
try{const r=await fetch('http://127.0.0.1:8000/health',{signal:AbortSignal.timeout(1000)});const h=await r.json();modelReady=h.ready&&(h.base_model||h.model)==='convaiinnovations/laya';}catch{}
const python=path.join(root,'.venv','Scripts','python.exe');
if(!modelReady&&existsSync(python)){
 const model=spawn(python,['model/adapter.py'],{cwd:root,stdio:'inherit',windowsHide:true,env:{...process.env,USE_TF:'0'}});
 children.push(model);model.on('error',()=>console.error('Local model could not start; website remains available in demo mode.'));
}
const website=spawn(process.execPath,['server.mjs'],{cwd:root,stdio:'inherit',windowsHide:true});children.push(website);
let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const child of children)child.kill();process.exit(code);}
website.on('error',()=>stop(1));website.on('exit',code=>stop(code||0));process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
