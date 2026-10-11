import {cloudConfig} from './cloud-config.mjs';
import {emptyData,reconcile} from './sync-core.mjs';
import {validate} from './core.mjs';
const SESSION='daily-cloud-session', BASE='daily-cloud-base-';
export function createCloud({read,activate,apply,status},config=cloudConfig){
  const configured=!!config.url&&!!config.key;
  let session=null, running=null, generation=0, refresh=null, dirty=false;
  const report=text=>status(text,session?.user,configured);
  function storeSession(value){localStorage.setItem(SESSION,JSON.stringify(value));session=value;}
  async function request(path,body,token,method='POST'){
    const response=await fetch(config.url.replace(/\/$/,'')+path,{
      method,headers:{apikey:config.key,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)
    });
    const result=await response.json().catch(()=>null);
    if(!response.ok)throw Error(result?.msg||result?.message||result?.error_description||'Cloud request failed. Try again.');
    return result;
  }
  async function token(){
    if(!session)throw Error('Sign in to sync.');
    if(session.expires_at*1000>Date.now()+60000)return session.access_token;
    if(!refresh)refresh=request('/auth/v1/token?grant_type=refresh_token',{refresh_token:session.refresh_token}).then(value=>{
      if(session?.user.id===value.user.id)storeSession(value);
      return value.access_token;
    }).finally(()=>{refresh=null;});
    return refresh;
  }
  async function attach(value){
    const user=await request('/auth/v1/user',undefined,value.access_token,'GET');
    await activate(user.id); // May fail on storage errors; don't change accounts then.
    generation++;storeSession({...value,user,expires_at:value.expires_at||Math.floor(Date.now()/1000)+value.expires_in});
    report('Waiting to sync');await sync();
  }
  async function sync(){
    if(!session||!configured)return;
    if(running){dirty=true;return running;}
    const g=generation,user=session.user.id;
    running=(async()=>{
      if(!navigator.onLine){report('Offline · changes saved on this device');return;}
      report('Syncing…');
      for(let attempt=0;attempt<5;attempt++){
        const access=await token();
        const rows=await request('/rest/v1/daily_data?select=revision,payload,updated_at',undefined,access,'GET');
        if(g!==generation)return;
        const remote=rows[0]?validate(rows[0].payload):emptyData();
        const base=validate(JSON.parse(localStorage.getItem(BASE+user)||JSON.stringify(emptyData())));
        const snapshot=structuredClone(read());
        const merged=reconcile(base,snapshot,remote);
        if(JSON.stringify(merged)!==JSON.stringify(remote)){
          const result=await request('/rest/v1/rpc/daily_sync',{expected_revision:rows[0]?.revision||0,new_payload:merged},access);
          if(g!==generation)return;
          if(result.conflict)continue;
        }
        // Preserve edits made while the network request was in flight.
        const latest=reconcile(snapshot,read(),merged);
        if(JSON.stringify(latest)!==JSON.stringify(read()))apply(latest);
        localStorage.setItem(BASE+user,JSON.stringify(merged));
        if(JSON.stringify(latest)!==JSON.stringify(merged)){dirty=true;report('Changes waiting to sync');}
        else report('Synced · '+new Date().toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}));
        return;
      }
      throw Error('Data changed on another device. Retry sync.');
    })().catch(err=>{if(g===generation)report('Not synced · '+err.message);}).finally(()=>{
      running=null;if(dirty){dirty=false;setTimeout(sync,1000);}
    });
    return running;
  }
  const api={
    changed(){dirty=true;if(!running){dirty=false;report(session?'Changes waiting to sync':'Saved on this device');clearTimeout(api.timer);api.timer=setTimeout(sync,800);}},sync,
    async signIn(email,password){await attach(await request('/auth/v1/token?grant_type=password',{email,password}));},
    async signUp(email,password){const value=await request('/auth/v1/signup?redirect_to='+encodeURIComponent(location.origin+location.pathname),{email,password});if(value.access_token)await attach(value);else return 'Check your email to confirm your account, then sign in.';},
    async recover(email){await request('/auth/v1/recover?redirect_to='+encodeURIComponent(location.origin+location.pathname),{email});return 'If an account exists, a password reset email will be sent.';},
    async password(password){await request('/auth/v1/user',{password},await token(),'PUT');return 'Password updated.';},
    async signOut(){
      generation++;const previous=session;session=null;localStorage.removeItem(SESSION);
      await activate(null);report('Saved on this device');
      if(previous)request('/auth/v1/logout',{},previous.access_token).catch(()=>{});
    },
    async deleteAccount(){await request('/rest/v1/rpc/daily_delete_account',{},await token());const id=session.user.id;await api.signOut();localStorage.removeItem(BASE+id);localStorage.removeItem('daily-macros-weight-v1-user-'+id);},
    async start(){
      report(configured?'Saved on this device':'Cloud sync is not connected yet');
      if(!configured)return;
      try{
        const fragment=new URLSearchParams(location.hash.slice(1));
        if(fragment.has('access_token')){
          const value={access_token:fragment.get('access_token'),refresh_token:fragment.get('refresh_token'),expires_in:Number(fragment.get('expires_in'))||3600};
          const recovery=fragment.get('type')==='recovery';history.replaceState(null,'',location.pathname+location.search);
          await attach(value);if(recovery)document.dispatchEvent(new Event('daily-password-recovery'));
        }else{
          const saved=JSON.parse(localStorage.getItem(SESSION)||'null');
          if(saved?.user?.id){session=saved;await activate(saved.user.id);await sync();}
        }
      }catch(err){report('Not synced · '+err.message);}
    }
  };
  window.addEventListener('online',sync);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync();});
  setInterval(()=>{if(!document.hidden)sync();},60000);
  return api;
}
