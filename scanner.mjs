import {gunzipSync} from 'node:zlib';
import {marketTime} from './engine.mjs';

export function equityUniverse(items){
 return [...new Map(items.filter(i=>i.segment==='NSE_EQ'&&i.instrument_type==='EQ'&&i.security_type==='NORMAL'&&/^NSE_EQ\|INE/.test(i.instrument_key)&&i.lot_size===1).map(i=>[i.instrument_key,{symbol:i.trading_symbol,name:i.name,instrument:i.instrument_key}])).values()];
}
export function rankCandidates(universe,quotes,now=Date.now(),marketIsOpen=false){
 const byKey=new Map(quotes.map(q=>[q.instrument_token,q]));
 return universe.flatMap(i=>{
  const q=byKey.get(i.instrument);if(!q)return [];
  const price=Number(q.last_price),change=Number(q.net_change),volume=Number(q.volume),average=Number(q.average_price),lastTrade=Number(q.last_trade_time);
  const previous=price-change,gain=change/previous*100,turnover=volume*average;
  if(![price,change,volume,average,lastTrade,gain,turnover].every(Number.isFinite)||previous<=0||price<50||average<=0||volume<100000||turnover<50000000||gain<1||gain>8||price<average||lastTrade>now+60000||marketTime(lastTrade).day!==marketTime(now).day||(marketIsOpen&&now-lastTrade>300000))return [];
  const score=gain*Math.log10(1+turnover/10000000);
  return [{...i,price,gain,volume,turnover,lastTrade,score,reason:`+${gain.toFixed(2)}% today; ₹${(turnover/10000000).toFixed(1)} crore estimated turnover; at/above average price`}];
 }).sort((a,b)=>b.score-a.score||a.symbol.localeCompare(b.symbol)).slice(0,20);
}
export function createScanner(db,get,context){
 db.exec('CREATE TABLE IF NOT EXISTS scanner_state(id INTEGER PRIMARY KEY,value TEXT); CREATE TABLE IF NOT EXISTS scanner_members(symbol TEXT PRIMARY KEY,selected INTEGER);');
 let state=JSON.parse(db.prepare('SELECT value FROM scanner_state WHERE id=1').get()?.value||'{"status":"Waiting for first scan","selected":[],"lastSuccess":0}');
 let running=false,lastAttempt=0,universe=[],universeDay='';
 const persist=()=>db.prepare('INSERT OR REPLACE INTO scanner_state VALUES(1,?)').run(JSON.stringify(state));
 async function scan(){
  if(running)return;running=true;lastAttempt=Date.now();state={...state,status:'Scanning NSE equities',running:true};
  try{
   if(universeDay!==marketTime().day){
    const r=await fetch('https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz',{signal:AbortSignal.timeout(30000)});
    if(!r.ok)throw Error('Instrument directory unavailable');
    universe=equityUniverse(JSON.parse(gunzipSync(Buffer.from(await r.arrayBuffer())).toString()));
    if(!universe.length)throw Error('No eligible NSE equities in directory');universeDay=marketTime().day;
   }
   const quotes=[];
   for(let n=0;n<universe.length;n+=100){
    const r=await get('/v2/market-quote/quotes?instrument_key='+encodeURIComponent(universe.slice(n,n+100).map(i=>i.instrument).join(',')));
    quotes.push(...Object.values(r.data||{}));state.scanned=Math.min(n+100,universe.length);state.universe=universe.length;
   }
   const coverage=new Set(quotes.map(q=>q.instrument_token)).size/universe.length;
   if(coverage<.9)throw Error('Incomplete quote coverage; previous watchlist retained');
   const selected=rankCandidates(universe,quotes,Date.now(),context().exchange==='NORMAL_OPEN');
   db.exec('BEGIN');
   try{
    db.exec('UPDATE scanner_members SET selected=0');
    for(const i of selected){
     const existing=db.prepare('SELECT symbol FROM instruments WHERE instrument=? OR symbol=?').get(i.instrument,i.symbol);
     if(!existing){db.prepare('INSERT INTO instruments(symbol,name,instrument) VALUES(?,?,?)').run(i.symbol,i.name,i.instrument);db.prepare('INSERT INTO scanner_members VALUES(?,1)').run(i.symbol);}
     else db.prepare('UPDATE scanner_members SET selected=1 WHERE symbol=?').run(existing.symbol);
    }
    state={status:context().exchange==='NORMAL_OPEN'?'Live scan complete':'After-hours snapshot · no new entries',running:false,selected,lastSuccess:Date.now(),universe:universe.length,scanned:quotes.length};persist();db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e;}
  }catch(e){state={...state,status:e.message,running:false};persist();}finally{running=false;state.running=false;}
 }
 return {state:()=>({...state,running}),scan,kick(){const c=context();if(c.enabled&&!running&&Date.now()-lastAttempt>=600000&&(c.exchange==='NORMAL_OPEN'||!state.lastSuccess||marketTime(state.lastSuccess).day!==marketTime().day))void scan();},eligible(symbol){const m=db.prepare('SELECT selected FROM scanner_members WHERE symbol=?').get(symbol);return !m||(m.selected===1&&Date.now()-state.lastSuccess<1200000&&marketTime(state.lastSuccess).day===marketTime().day);}};
}
