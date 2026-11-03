// Vercel serverless API: API credentials never reach the browser.
const PLACES = ['静浦漁港','土肥漁港','大瀬崎沖','サニーサイド浦賀'];
export default async function handler(req,res){
  res.setHeader('Cache-Control','public, s-maxage=1800, stale-while-revalidate=3600');
  const place=String(req.query.place||'静浦漁港');
  if(!PLACES.includes(place))return res.status(400).json({error:'不明な地点です'});
  const endpoint=process.env.MSIL_TIDE_ENDPOINT;
  const key=process.env.MSIL_API_KEY;
  if(!endpoint||!key)return res.status(503).json({error:'海しるAPIは未設定です。MSIL_TIDE_ENDPOINTとMSIL_API_KEYをVercelで設定してください。'});
  try{
    // Endpoint and parameters must be verified against the user's issued API specification.
    // Avoid fabricating coordinates or assuming an undocumented response shape.
    const url=new URL(endpoint);
    url.searchParams.set('place',place);
    const response=await fetch(url,{headers:{'Ocp-Apim-Subscription-Key':key,'Accept':'application/json'},signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw Error('海しるAPI HTTP '+response.status);
    const raw=await response.json();
    // A validated adapter is required before serving tide heights. Never guess units or datum.
    if(!Array.isArray(raw.points)||!raw.points.every(x=>typeof x.time==='string'&&Number.isFinite(x.value))||!raw.unit||!raw.station||!raw.datum){
      return res.status(502).json({error:'API応答の形式が未対応です。公式仕様に合わせた変換処理が必要です。'});
    }
    return res.status(200).json({source:'海しる潮汐推算',station:raw.station,unit:raw.unit,datum:raw.datum,points:raw.points});
  }catch(e){return res.status(502).json({error:'公式API取得エラー: '+e.message});}
}
