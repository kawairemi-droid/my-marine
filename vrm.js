import { timingSafeEqual } from 'node:crypto';
const same=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y)};
const pick=(records,key)=>{let v=records?.[key];if(Array.isArray(v)){let p=v.at(-1);return Array.isArray(p)?p[1]:p?.value??null}return typeof v==='number'?v:null};
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 const secret=process.env.MY_MARINE_VIEW_PASSWORD,token=process.env.VRM_ACCESS_TOKEN,id=process.env.VRM_INSTALLATION_ID;
 if(!secret||!token||!id)return res.status(503).json({error:'VRM環境変数が未設定です'});
 if(!same(req.headers['x-view-password'],secret))return res.status(401).json({error:'閲覧パスワードが違います'});
 if(!/^\d+$/.test(id))return res.status(503).json({error:'VRM_INSTALLATION_IDの形式が不正です'});
 try{
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);
  let r;try{r=await fetch(`https://vrmapi.victronenergy.com/v2/installations/${id}/stats?type=live_feed`,{headers:{'x-authorization':`Token ${token}`,'Accept':'application/json'},signal:controller.signal})}finally{clearTimeout(timeout)}
  if(!r.ok)return res.status(502).json({error:`VRM取得失敗（HTTP ${r.status}）`});
  const j=await r.json();if(j.success===false)return res.status(502).json({error:'VRMがデータ取得を拒否しました'});
  const rec=j.records||{};
  const values={batteryVoltage:pick(rec,'bv'),batteryPower:pick(rec,'Pdc'),solarPower:pick(rec,'solar_yield')};
  // These are the raw VRM field values. Other fields are intentionally omitted until verified.
  return res.status(200).json({source:'Victron VRM live_feed',retrievedAt:new Date().toISOString(),values,availableFields:Object.keys(rec).filter(k=>['bv','Pdc','solar_yield'].includes(k))});
 }catch(e){return res.status(502).json({error:'VRMに接続できませんでした'})}
}
