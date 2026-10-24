import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('paper workflow persists, accounts for costs, isolates data and enforces rules',{timeout:20000},async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'laya-test-'));
 const child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:'4179',DB_PATH:path.join(dir,'test.sqlite'),UPSTOX_ANALYTICS_TOKEN:'',LAYA_URL:''},stdio:['ignore','pipe','pipe']});
 try{
 await new Promise((resolve,reject)=>{child.stdout.on('data',d=>{if(d.toString().includes('Laya Paper Lab:'))resolve();});child.on('error',reject);child.on('exit',c=>reject(Error('Server exited '+c)));});
 const base='http://127.0.0.1:4179';let state=await fetch(base+'/api/state').then(r=>r.json());
 const post=async(route,body={})=>{const r=await fetch(base+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':state.csrf},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
 assert.equal(state.settings.running,false);
 assert.equal((await fetch(base+'/api/start',{method:'POST'})).status,403);
 assert.equal((await fetch(base+'/.env')).status,404);
 assert.equal((await post('settings',{...state.settings,maxTrades:1})).status,200);
 assert.equal((await post('start')).status,200);
 state=(await post('demo')).data;assert.equal(state.trades.length,1);assert.ok(state.trades[0].entry>0);assert.ok(state.trades[0].qty>0);
 assert.equal((await post('mode',{mode:'live'})).status,400);
 state=(await post('demo')).data;assert.ok(state.signals.some(s=>s.decision==='Skipped: neutral'));
 state=(await post('demo')).data;assert.ok(state.signals.some(s=>s.decision==='Daily trade limit'));
 state=(await post('stop')).data;assert.equal(state.settings.running,false);assert.equal(state.metrics.open,0);assert.ok(state.trades[0].fees>0);assert.ok(state.trades[0].closed);
 assert.equal((await post('settings',{...state.settings,maxTrades:5})).status,400);
 const exported=await fetch(base+'/api/export').then(r=>r.json());assert.equal(exported.trades.length,1);assert.ok(exported.signals[0].rules);assert.ok(exported.signals[0].due>exported.signals[0].received);assert.ok(exported.signals[0].features);assert.equal(exported.observations.length,12);assert.equal(state.research.count,1);assert.equal((await post('compare')).status,200);
 state=(await post('mode',{mode:'live'})).data;assert.equal(state.trades.length,0);assert.equal(state.signals.length,0);assert.equal((await post('start')).status,400);
 state=(await post('mode',{mode:'demo'})).data;assert.equal(state.trades.length,1);
 }finally{child.kill();await new Promise(resolve=>child.once('exit',resolve));await rm(dir,{recursive:true,force:true});}
});
