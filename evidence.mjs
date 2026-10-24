import {marketTime} from './engine.mjs';

export function eventType(headline){
 for(const [type,pattern] of [['earnings',/earnings|quarter|profit|results|revenue/i],['order',/order|contract|tender/i],['regulatory',/regulat|penalty|sebi|investigation/i],['fundraising',/fundrais|fund raise|qip|rights issue|capital raise/i],['corporate action',/dividend|buyback|split|merger|acquisition/i]])if(pattern.test(headline))return type;
 return 'other';
}
export function performance(trades){
 const list=trades.filter(t=>t.closed&&Number.isFinite(t.pnl)).sort((a,b)=>a.closed-b.closed);
 const wins=list.filter(t=>t.pnl>0),losses=list.filter(t=>t.pnl<0);
 const grossProfit=wins.reduce((n,t)=>n+t.pnl,0),grossLoss=-losses.reduce((n,t)=>n+t.pnl,0);
 let cumulative=0,peak=0,maxDrawdown=0,streak=0,worstLosingStreak=0;
 for(const t of list){cumulative+=t.pnl;peak=Math.max(peak,cumulative);maxDrawdown=Math.max(maxDrawdown,peak-cumulative);streak=t.pnl<0?streak+1:0;worstLosingStreak=Math.max(streak,worstLosingStreak);}
 return {count:list.length,expectancy:list.length?cumulative/list.length:null,profitFactor:grossLoss?grossProfit/grossLoss:null,noLosses:!grossLoss,averageWin:wins.length?grossProfit/wins.length:null,averageLoss:losses.length?-grossLoss/losses.length:null,maxDrawdown,worstLosingStreak};
}
export function signalFeatures(signal,quote,publicationQuote,scanner,now){
 return {eventType:eventType(signal.headline),minuteIST:marketTime(now).minute,newsAgeSeconds:Math.max(0,(now-signal.published)/1000),quoteAgeSeconds:quote?(now-quote.at)/1000:null,publicationPrice:publicationQuote?.price??null,moveSincePublication:quote&&publicationQuote?(quote.price/publicationQuote.price-1):null,scannerGain:scanner?.gain??null,scannerTurnover:scanner?.turnover??null,scannerObservedAt:scanner?.observedAt??null};
}
export function horizonTargets(received,mode){
 const close=Date.parse(marketTime(received).day+'T00:00:00Z')-19800000+920*60000;
 return [5,15,30,60].map(minutes=>({horizon:String(minutes),due:received+minutes*60000})).concat(mode==='live'?[{horizon:'close',due:close}]:[]).filter(t=>mode!=='live'||t.due<=close&&t.due>received);
}
