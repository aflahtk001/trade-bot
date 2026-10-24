import {entryValues,closeValues,marketTime,marketOpen} from './engine.mjs';
import {performance} from './evidence.mjs';

// Seeded random controls use the same recorded headline opportunities, not random
// market timestamps. Run several fixed seeds; never search for a winning seed.
export function compareReplays(signals,quotes,rules,mode){
 const horizons=[15,30,60];
 const summarize=r=>({...r,trades:undefined});
 const eligible=signals.filter(s=>s.mode===mode&&s.model!=='unavailable'&&s.received>=s.published&&s.received-s.published<=(rules.maxNewsMinutes??30)*60000);
 const rate=eligible.length?eligible.filter(s=>s.sentiment==='positive'&&s.confidence>=rules.confidence).length/eligible.length:0;
 const randomRuns=[];
 for(let seed=1;seed<=20;seed++){let value=Math.imul(seed,2654435761)>>>0;const controls=eligible.map(s=>{value=(Math.imul(1664525,value)+1013904223)>>>0;return {...s,sentiment:value/4294967296<rate?'positive':'neutral',confidence:1,model:'random-opportunity-control'};});randomRuns.push(summarize(replay(controls,quotes,rules,mode)));}
 return {horizons:horizons.map(holdMinutes=>({holdMinutes,...summarize(replay(signals,quotes,{...rules,holdMinutes},mode))})),positive:summarize(replay(signals,quotes,{...rules,confidence:0},mode)),random:{seeds:20,selectionRate:rate,meanNet:randomRuns.reduce((n,r)=>n+r.net,0)/20,minNet:Math.min(...randomRuns.map(r=>r.net)),maxNet:Math.max(...randomRuns.map(r=>r.net)),meanTrades:randomRuns.reduce((n,r)=>n+r.count,0)/20,unresolved:randomRuns.reduce((n,r)=>n+r.unresolved,0),runs:randomRuns},limitations:'Exploratory comparisons on the same recorded headline opportunities, not random market-time entries. Random selection matches the model signal selection rate in expectation. All variants use the same costs and protection rules. Missing quotes and scanner-history omissions limit conclusions. Select rules only with a later untouched forward test.'};
}

export function labeledDataset(signals,now=Date.now()){
 return signals.filter(s=>s.mode==='live'&&s.model!=='demo-fixture'&&s.baseline>0&&s.due>s.received&&Number.isFinite(s.outcome)&&s.observed>=s.due&&s.observed<=s.due+60000&&s.observed<=now&&s.received-s.published<=1800000&&s.received>=s.published&&s.rules).map(s=>({id:s.id,symbol:s.symbol,headline:s.headline,published:s.published,received:s.received,observed:s.observed,holdMinutes:(s.due-s.received)/60000,features:s.features?JSON.parse(s.features):null,return:s.outcome,label:s.outcome>.01?'positive':s.outcome<-.01?'negative':'neutral',rules:JSON.parse(s.rules)})).sort((a,b)=>a.received-b.received);
}

// Historical prediction replay, never re-querying the current model for an old signal.
export function replay(signals,quotes,rules,mode){
 const ordered=signals.filter(s=>s.mode===mode).sort((a,b)=>a.received-b.received);
 const first=ordered[0]?.received??Infinity;
 const last=ordered.at(-1)?.received??-Infinity;
 const events=[...ordered.map(s=>({at:s.received,kind:1,value:s})),...quotes.filter(q=>q.mode===mode&&q.at>=first-60000&&q.at<=last+rules.holdMinutes*60000+60000).map(q=>({at:q.at,kind:0,value:q}))].sort((a,b)=>a.at-b.at||a.kind-b.kind);
 const latest=new Map(),active=[],closed=[],reasons={},daily=new Map();let capital=rules.capital,peak=capital,maxDrawdown=0,delayedExits=0,staleMarks=0;
 const reject=why=>reasons[why]=(reasons[why]||0)+1;
 const dayState=at=>{const day=marketTime(at).day;if(!daily.has(day))daily.set(day,{entries:0,pnl:0,stopped:false});return daily.get(day);};
 const fresh=(symbol,at)=>{const q=latest.get(symbol);return q&&q.at<=at&&at-q.at<=60000&&(mode!=='live'||q.tradable===1)?q:null;};
 const close=(index,at,reason)=>{const t=active[index],q=fresh(t.symbol,at);if(!q)return false;const result=closeValues(t,q.price,rules);if(at>t.due+60000)delayedExits++;closed.push({...t,closed:at,...result,reason});capital+=result.pnl;dayState(at).pnl+=result.pnl;active.splice(index,1);return true;};
 for(const e of events){if(e.kind===0)latest.set(e.value.symbol,e.value);const d=dayState(e.at);
  for(let i=active.length-1;i>=0;i--){const t=active[i];const mark=fresh(t.symbol,e.at);const move=mark?(mark.price/t.entry-1)*100:0;const protective=mark&&rules.stopLossPct>0&&move<=-rules.stopLossPct?'Stop loss':mark&&rules.targetPct>0&&move>=rules.targetPct?'Profit target':null;if(protective){close(i,e.at,protective);continue;}if(t.pendingStop||e.at>=t.due){const q=fresh(t.symbol,e.at);if(q&&(t.pendingStop||q.at>=t.due))close(i,e.at,t.pendingStop?'Daily loss limit':'Scheduled exit');}}
  let floating=0;for(const t of active){const q=fresh(t.symbol,e.at);if(q)floating+=closeValues(t,q.price,rules).pnl;else staleMarks++;}
  const equity=capital+floating;peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,peak-equity);
  if(d.pnl+floating<=-rules.maxLoss){d.stopped=true;for(let i=active.length-1;i>=0;i--){active[i].pendingStop=true;close(i,e.at,'Daily loss limit');}}
  if(e.kind!==1)continue;const s=e.value;
  if(s.sentiment!=='positive'||s.confidence<rules.confidence||s.model==='unavailable'){reject('Signal not eligible');continue;}
  if(s.received-s.published>(rules.maxNewsMinutes??30)*60000||s.received<s.published){reject('Old or invalid publication time');continue;}
  if(mode==='live'&&!marketOpen(s.received)){reject('Outside normal hours');continue;}
  const features=typeof s.features==='string'?JSON.parse(s.features):s.features;if(rules.maxMovedPct>0&&features?.moveSincePublication!=null&&Math.abs(features.moveSincePublication)*100>rules.maxMovedPct){reject('Price already moved');continue;}
  if(d.stopped||active.length>=(rules.maxPositions??100)||d.entries>=rules.maxTrades||active.some(t=>t.symbol===s.symbol)){reject('Risk limit / existing position');continue;}
  const q=fresh(s.symbol,e.at);if(!q){reject('No timely tradable entry quote');continue;}
  const allocated=active.reduce((n,t)=>n+t.entry*t.qty,0);const entry=entryValues(q.price,rules,capital-allocated);if(!entry.qty){reject('Insufficient capital');continue;}
  const day=marketTime(e.at).day;const closeOfDay=Date.parse(day+'T00:00:00Z')-19800000+920*60000;
  const due=mode==='live'?Math.min(e.at+rules.holdMinutes*60000,closeOfDay):e.at+rules.holdMinutes*60000;
  active.push({symbol:s.symbol,signal_id:s.id,opened:e.at,due,...entry});d.entries++;
  maxDrawdown=Math.max(maxDrawdown,peak-(capital+floating+closeValues(entry,q.price,rules).pnl));
 }
 closed.sort((a,b)=>a.closed-b.closed);let streak=0,worstLosingStreak=0;for(const t of closed){streak=t.pnl<0?streak+1:0;worstLosingStreak=Math.max(streak,worstLosingStreak);}
 return {runAt:Date.now(),mode,kind:'chronological polling-price replay',count:closed.length,net:closed.reduce((a,t)=>a+t.pnl,0),winRate:closed.length?closed.filter(t=>t.pnl>0).length/closed.length*100:0,...performance(closed),maxDrawdown,worstLosingStreak,unresolved:active.length,delayedExits,staleMarks,skipped:reasons,trades:closed,limitations:'Uses polling prices and estimated costs, not executable fills. Daily loss checks use the available quote stream. Missing or delayed exits remain visible and block promotion. Assumes the engine restarts each market day. Historical scanner eligibility is not reconstructed.'};
}
