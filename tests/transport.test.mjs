import assert from 'node:assert/strict';

const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
globalThis.window={addEventListener(){}};globalThis.document={hidden:false,addEventListener(){}};globalThis.location={origin:'https://daily.test',pathname:'/',hash:'#access_token=token&refresh_token=refresh&expires_in=3600'};Object.defineProperty(globalThis.navigator,'onLine',{value:true,writable:true});globalThis.setInterval=()=>0;globalThis.history={replaceState:()=>{location.hash='';}};
let user=null,local={app:'daily-macros-weight',version:1,entries:[],foods:[],weights:[]},remote=structuredClone(local),revision=0,status='';
let conflictOnce=true;
globalThis.fetch=async(url,options)=>{let value;const p=new URL(url).pathname;
if(p==='/auth/v1/otp'){const body=JSON.parse(options.body);assert.deepEqual(body,{email:'jack@example.com',create_user:true});assert.equal(new URL(url).searchParams.get('redirect_to'),'https://daily.test/');value={};}
else if(p==='/auth/v1/token')value={user:{id:'u1',email:'jack@example.com'},access_token:'token',refresh_token:'refresh',expires_at:Date.now()/1000+3600};
else if(p==='/auth/v1/user')value={id:'u1',email:'jack@example.com'};
else if(p==='/rest/v1/daily_data')value=revision?[{payload:remote,revision}]:[];
else if(p==='/rest/v1/rpc/daily_sync'){
 if(conflictOnce){conflictOnce=false;value={conflict:true};}
 else{const req=JSON.parse(options.body);assert.equal(req.expected_revision,revision);remote=req.new_payload;revision++;value={revision};}
}else value={};return {ok:true,json:async()=>value};};
const {createCloud}=await import('../cloud.mjs');
const cloud=createCloud({read:()=>local,activate:async id=>{user=id;},apply:d=>{local=d;},status:text=>{status=text;}},{url:'https://cloud.test',key:'public-test'});
const row={id:'a',date:'2026-10-01',name:'Milk',calories:500,protein:20};local.entries.push(row);assert.match(await cloud.sendLink(' jack@example.com '),/Check your email/);assert.equal(user,null);await cloud.start();assert.equal(location.hash,'');assert.equal(remote.entries.length,1);assert.match(status,/Synced/);assert.equal(user,'u1');
local.entries=[];navigator.onLine=false;await cloud.sync();assert.equal(remote.entries.length,1);assert.match(status,/Offline/);navigator.onLine=true;await cloud.sync();assert.equal(remote.entries.length,0);assert.match(status,/Synced/);
await cloud.signOut();assert.equal(user,null);assert.equal(storage.get('daily-cloud-session'),undefined);
location.hash='#error=access_denied&error_description=expired';await cloud.start();assert.match(status,/expired or invalid/);assert.equal(user,null);assert.equal(location.hash,'');
console.log('Mock transport passed: email link request/callback, expired links, revision-conflict retry, upload, offline retention, reconnect deletion, signout.');
