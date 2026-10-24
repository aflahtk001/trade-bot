import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaults,closeValues,entryValues,marketOpen,marketTime,validateRules} from '../engine.mjs';
test('flat market loses money after slippage and costs',()=>{const t=entryValues(500,defaults,10000);const c=closeValues(t,500,defaults);assert.ok(c.pnl<0);assert.equal(c.label,'bad idea');assert.ok(t.entry>500);assert.ok(c.exit<500);assert.ok(c.fees>0);});
test('allocation includes estimated entry fees and cannot overspend',()=>{const t=entryValues(999,defaults,1000);assert.ok(t.entry*t.qty*(1+(defaults.taxBps+defaults.brokerageBps)/10000)<=1000);assert.equal(entryValues(2000,defaults,1000).qty,0);});
test('holding a winner reports net, not gross profit',()=>{const c=closeValues({entry:500,qty:10},506,defaults);assert.ok(c.pnl>0&&c.pnl<60);assert.equal(c.label,'good idea');});
test('market clock uses IST and blocks late entries and weekends',()=>{assert.equal(marketTime(Date.parse('2026-09-29T04:00:00Z')).minute,570);assert.ok(marketOpen(Date.parse('2026-09-29T04:00:00Z')));assert.equal(marketOpen(Date.parse('2026-09-29T09:50:00Z')),false);assert.equal(marketOpen(Date.parse('2026-10-03T04:00:00Z')),false);});
test('invalid risk settings are rejected',()=>{assert.throws(()=>validateRules({...defaults,maxTrade:200000}));assert.throws(()=>validateRules({...defaults,confidence:NaN}));assert.throws(()=>validateRules({...defaults,maxTrades:1.5}));assert.deepEqual(validateRules(defaults).holdMinutes,30);});
