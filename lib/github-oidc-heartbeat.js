import { createPublicKey,verify as verifySignature } from 'node:crypto';
const issuer='https://token.actions.githubusercontent.com';
const audience='moab-watershed-heartbeat';
const expectedWorkflow='canyoncountryadventure/Meshtastic/.github/workflows/watershed-heartbeat.yml@refs/heads/main';
function decode(piece){return JSON.parse(Buffer.from(piece,'base64url').toString('utf8'));}
export async function verifyGitHubHeartbeat(token, getKeys=fetch, scope={}){
 const requiredAudience=scope.audience||audience;
 const requiredWorkflow=scope.workflow||expectedWorkflow;
 if(typeof token!=='string'||token.length<200||token.length>12000)return false;
 const parts=token.split('.');if(parts.length!==3)return false;
 let header,claims;
 try{header=decode(parts[0]);claims=decode(parts[1]);}catch{return false;}
 if(header.alg!=='RS256'||typeof header.kid!=='string'||header.kid.length>256)return false;
 const now=Math.floor(Date.now()/1000);
 if(claims.iss!==issuer||claims.aud!==requiredAudience||claims.repository!=='canyoncountryadventure/Meshtastic'||
    claims.ref!=='refs/heads/main'||claims.workflow_ref!==requiredWorkflow||
    !['schedule','workflow_dispatch'].includes(claims.event_name)||
    !Number.isInteger(claims.exp)||!Number.isInteger(claims.iat)||
    claims.exp<now||claims.iat>now+60||now-claims.iat>600)return false;
 try{
  const response=await getKeys(issuer+'/.well-known/jwks',{signal:AbortSignal.timeout(4500)});
  if(!response.ok)return false;
  const data=await response.json();
  const key=Array.isArray(data.keys)?data.keys.find(k=>k.kid===header.kid&&k.kty==='RSA'):null;
  if(!key)return false;
  return verifySignature('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),createPublicKey({key,format:'jwk'}),Buffer.from(parts[2],'base64url'));
 }catch{return false;}
}
