import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {equityUniverse,rankCandidates,createScanner} from '../scanner.mjs';
const now=Date.parse('2026-09-29T05:00:00Z');
const stock={symbol:'ABC',name:'Example',instrument:'NSE_EQ|INE123'};
const quote={instrument_token:stock.instrument,last_price:103,net_change:3,average_price:102,volume:1000000,last_trade_time:now};
test('scanner excludes thin, stale, falling, overheated and below-average stocks',()=>{
 assert.equal(rankCandidates([stock],[quote],now,true).length,1);
 for(const patch of [{volume:100},{last_trade_time:now-360000},{last_trade_time:now-86400000},{net_change:-2},{net_change:20},{average_price:104},{net_change:NaN}])assert.equal(rankCandidates([stock],[{...quote,...patch}],now,true).length,0);
 assert.equal(rankCandidates([stock],[{...quote,last_trade_time:now-360000}],now,false).length,1);
});
test('universe excludes derivatives, funds and non-normal equities',()=>{
 const i={segment:'NSE_EQ',instrument_type:'EQ',security_type:'NORMAL',lot_size:1,instrument_key:stock.instrument,trading_symbol:'ABC'};
 assert.equal(equityUniverse([i,i,{...i,instrument_key:'NSE_EQ|INF123'},{...i,security_type:'SME'},{...i,instrument_type:'BE'}]).length,1);
});
test('scanner ranks at most 20 candidates and expired discoveries cannot enter',()=>{
 const stocks=Array.from({length:25},(_,n)=>({...stock,symbol:'S'+n,instrument:'NSE_EQ|INE'+n}));
 assert.equal(rankCandidates(stocks,stocks.map(s=>({...quote,instrument_token:s.instrument})),now,true).length,20);
 const db=new DatabaseSync(':memory:');const scanner=createScanner(db,()=>{},()=>({}));
 db.prepare('INSERT INTO scanner_members VALUES(?,1)').run('ABC');
 assert.equal(scanner.eligible('ABC'),false);assert.equal(scanner.eligible('MANUAL'),true);db.close();
});
