// Public endpoint only: never forward the owner admin cookie.
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'GET or POST required'});
 if(req.method==='POST'&&req.headers.origin){
  try{if(new URL(req.headers.origin).host!==req.headers.host)return res.status(403).json({error:'Origin rejected'});}
  catch{return res.status(403).json({error:'Origin rejected'});}
 }
 const cookie=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('watershed_public_session='));
 try{
  const upstream=await fetch('https://meshtastic-ecru.vercel.app/api/watershed-public',{
   method:req.method,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(24000),
   headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},
   ...(req.method==='POST'?{body:typeof req.body==='string'?req.body:JSON.stringify(req.body||{})}:{})
  });
  const setCookie=upstream.headers.get('set-cookie');if(setCookie)res.setHeader('Set-Cookie',setCookie);
  return res.status(upstream.status).json(await upstream.json());
 }catch{return res.status(503).json({error:'Public subscriptions temporarily unavailable'});}
}
