import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {modelRegistry,activateModel,reviewCandidate,BASE_MODEL} from '../models.mjs';
import {defaults} from '../engine.mjs';
test('model promotion gates and rollback preserve the baseline',{timeout:10000},async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'laya-model-test-'));
 try{const id='20260929T100000Z';const dir=path.join(root,'data','candidates',id);await mkdir(dir,{recursive:true});await writeFile(path.join(dir,'report.json'),JSON.stringify({candidate:{accuracy:.8}}));
 assert.equal((await modelRegistry(root)).active.id,BASE_MODEL);
 await assert.rejects(activateModel(root,id),/has not passed/);
 await writeFile(path.join(dir,'evaluation.json'),JSON.stringify({baseline:[],candidate:[],quotes:[],rules:defaults,baselineId:BASE_MODEL}));
 const review=await reviewCandidate(root,id);assert.equal(review.eligible,false);assert.ok(review.reasons.includes('Fewer than three held-out weeks'));
 await writeFile(path.join(dir,'review.json'),JSON.stringify({eligible:true,baselineId:BASE_MODEL}));
 const promoted=await activateModel(root,id);assert.equal(promoted.active.id,id);assert.equal(promoted.history.length,1);
 await assert.rejects(activateModel(root,id),/baseline changed/);
 const rollback=await activateModel(root,BASE_MODEL,{rollback:true});assert.equal(rollback.active.id,BASE_MODEL);assert.equal(rollback.history.length,2);
 await assert.rejects(activateModel(root,'../../bad'),/Invalid model/);
 }finally{await rm(root,{recursive:true,force:true});}
});
