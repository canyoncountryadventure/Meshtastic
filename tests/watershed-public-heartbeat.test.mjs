import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {verifyGitHubHeartbeat} from '../lib/github-oidc-heartbeat.js';
import {validateRule} from '../lib/watershed-alert-values.js';
const encode=data=>Buffer.from(JSON.stringify(data)).toString('base64url');
test('station offline hours validate 1..168 without touching normal parameter rules',()=>{
 const basic={node_num:2425602407,parameter:'offline_hours',enabled:true};
 assert.deepEqual([1,12,24,168].map(threshold=>validateRule({...basic,threshold}).threshold),[1,12,24,168]);
 for(const threshold of [-1,0,1.5,169,Infinity])assert.throws(()=>validateRule({...basic,threshold}));
 assert.equal(validateRule({node_num:1695962694,parameter:'offline_hours',threshold:3}).reset_value,0);
 assert.equal(validateRule({node_num:1949224949,parameter:'battery_percent',direction:'below',threshold:25,reset_value:30}).parameter,'battery_percent');
});
test('GitHub schedule bearer requires valid signed JWT, exact repository, workflow, and audience',async()=>{
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const jwk=publicKey.export({format:'jwk'});jwk.kid='test-key';
 const now=Math.floor(Date.now()/1000);
 const claims={iss:'https://token.actions.githubusercontent.com',aud:'moab-watershed-heartbeat',
  repository:'canyoncountryadventure/Meshtastic',ref:'refs/heads/main',
  workflow_ref:'canyoncountryadventure/Meshtastic/.github/workflows/watershed-heartbeat.yml@refs/heads/main',
  event_name:'schedule',iat:now,exp:now+300};
 const make=payload=>{const pre=encode({alg:'RS256',kid:'test-key',typ:'JWT'})+'.'+encode(payload);
   return pre+'.'+sign('RSA-SHA256',Buffer.from(pre),privateKey).toString('base64url');};
 const fetchJwks=async()=>({ok:true,json:async()=>({keys:[jwk]})});
 assert.equal(await verifyGitHubHeartbeat(make(claims),fetchJwks),true);
 assert.equal(await verifyGitHubHeartbeat(make({...claims,aud:'other'}),fetchJwks),false);
 assert.equal(await verifyGitHubHeartbeat(make({...claims,workflow_ref:'untrusted'}),fetchJwks),false);
 assert.equal(await verifyGitHubHeartbeat(make({...claims,repository:'attacker/repo'}),fetchJwks),false);
 assert.equal(await verifyGitHubHeartbeat(make({...claims,iat:now-1800}),fetchJwks),false);
 assert.equal(await verifyGitHubHeartbeat('junk',fetchJwks),false);
});
