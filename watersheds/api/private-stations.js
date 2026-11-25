import { hasPrivateAccess } from '../lib/private-stations.js';
// Backward compatible read-only access check. No separate PS password or cookie.
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 res.setHeader('Vercel-CDN-Cache-Control','no-store');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'Owner sign-in is managed in System Administration'});}
 return res.status(200).json({ok:true,authenticated:await hasPrivateAccess(req)});
}
