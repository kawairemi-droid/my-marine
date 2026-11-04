// Public, read-only summary of CANTILLN. Never return raw VRM diagnostics.
const API='https://vrmapi.victronenergy.com/v2/installations/';
const rules=[
 ['soc',[/battery.*(state of charge|soc)/i,/^soc$/i],'%'],
 ['batteryVoltage',[/battery.*voltage/i], 'V'],
 ['batteryCurrent',[/battery.*current/i], 'A'],
 ['batteryPower',[/battery.*power/i,/^dc power$/i], 'W'],
 ['solarPower',[/^(pv charger|solar charger).*power$/i,/^solar power$/i,/^pv power$/i], 'W'],
 ['acInputPower',[/^ac input.*power$/i,/^grid.*power$/i], 'W'],
];
function numeric(r){const x=r.rawValue??r.formattedValue;if(typeof x==='number')return Number.isFinite(x)?x:null;if(typeof x==='string'&&/^[-+]?\d+(\.\d+)?$/.test(x.trim()))return Number(x);return null}
function summarize(records){const values={};const latest={};for(const r of records){const name=String(r.description||'');const value=numeric(r);if(value===null)continue;for(const [key,patterns] of rules){if(patterns.some(p=>p.test(name))){const ts=Number(r.timestamp)||0;if(latest[key]===undefined||ts>latest[key]){values[key]=value;latest[key]=ts}}}}return values}
export default async function handler(req,res){
 res.setHeader('Cache-Control','public, s-maxage=30, stale-while-revalidate=30');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 const token=process.env.VRM_ACCESS_TOKEN,id=process.env.VRM_INSTALLATION_ID;
 if(!token||!id)return res.status(503).json({error:'VRM configuration incomplete'});
 try{
  const r=await fetch(`${API}${encodeURIComponent(id)}/diagnostics?count=1000`,{headers:{'x-authorization':`Token ${token}`,Accept:'application/json'},signal:AbortSignal.timeout(12000)});
  if(!r.ok)return res.status(502).json({error:'VRM upstream error',status:r.status});
  const json=await r.json();
  const records=Array.isArray(json.records)?json.records:[];
  return res.status(200).json({source:'Victron VRM',vessel:'CANTILLN',fetchedAt:new Date().toISOString(),values:summarize(records),note:'Values are last VRM diagnostics, not guaranteed live. Missing fields are omitted.'});
 }catch(e){return res.status(502).json({error:'VRM connection failed'})}
}
