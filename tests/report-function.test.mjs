import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=readFileSync(new URL('../supabase/functions/report-issue/index.ts',import.meta.url),'utf8');
function fixture({providerStatus=201,providerBody={},allowed=true,secrets={}}={}) {
  let handler;const calls=[],logs=[];
  const env={BREVO_API_KEY:'private-key',BREVO_SENDER_EMAIL:'verified@example.com',REPORT_TO_EMAIL:'recipient@example.com',SUPABASE_URL:'https://project.invalid',SUPABASE_SERVICE_ROLE_KEY:'server-key',...secrets};
  runInNewContext(source,{Deno:{env:{get:name=>env[name]},serve:fn=>{handler=fn;}},Response,Uint8Array,TextEncoder,TextDecoder,crypto:webcrypto,AbortSignal,console:{error:value=>logs.push(JSON.parse(value))},fetch:async(url,options)=>{calls.push({url,options});return url.includes('/rpc/')?new Response(JSON.stringify(allowed)):new Response(typeof providerBody==='string'?providerBody:JSON.stringify(providerBody),{status:providerStatus});}});
  return {calls,logs,send:(body={description:'Private issue description',version:'v50'})=>handler(new Request('https://project.invalid/functions/v1/report-issue',{method:'POST',headers:{Origin:'https://jh124.github.io'},body:JSON.stringify(body)}))};
}
test('normalizes surrounding whitespace and keeps recipient server controlled',async()=>{
  const f=fixture({secrets:{BREVO_API_KEY:' private-key\n',BREVO_SENDER_EMAIL:' verified@example.com ',REPORT_TO_EMAIL:' recipient@example.com '}});
  assert.equal((await f.send({description:'Private issue description',version:'v50',to:'injected@example.com'})).status,200);
  const request=f.calls.at(-1),mail=JSON.parse(request.options.body);
  assert.equal(request.options.headers['api-key'],'private-key');assert.equal(mail.sender.email,'verified@example.com');assert.equal(mail.to[0].email,'recipient@example.com');assert.deepEqual(f.logs,[]);
});
test('malformed configuration stops before rate counter and email requests',async()=>{
  const f=fixture({secrets:{BREVO_SENDER_EMAIL:'<verified@example.com>'}});
  const response=await f.send();assert.equal(response.status,503);assert.equal((await response.json()).diagnostic,'CONFIG_SENDER_FORMAT');assert.equal(f.calls.length,0);
  assert.deepEqual(f.logs,[{event:'report_issue_config_error',setting:'BREVO_SENDER_EMAIL',reason:'enter_bare_email_address'}]);
});
test('provider rejection logs only controlled diagnostics',async()=>{
  const f=fixture({providerStatus:401,providerBody:{code:'unauthorized',message:'Unrecognised IP address 192.0.2.1; private-key; recipient@example.com; Private issue description'}});
  const response=await f.send();assert.equal(response.status,502);
  assert.equal((await response.clone().json()).diagnostic,'BREVO_401_UNAUTHORIZED_IP');
  assert.deepEqual(f.logs,[{event:'report_issue_brevo_error',status:401,code:'unauthorized',reason:'sending_server_ip_not_authorized'}]);
  const output=JSON.stringify(f.logs)+await response.text();for(const value of ['192.0.2.1','private-key','recipient@example.com','Private issue description'])assert.equal(output.includes(value),false);
});
test('sender rejection is distinguished from API credentials',async()=>{
  const f=fixture({providerStatus:400,providerBody:{code:'invalid_parameter',message:'Sender verified@example.com is not valid'}});
  const response=await f.send();assert.equal(response.status,502);assert.equal((await response.json()).diagnostic,'BREVO_400_INVALID_PARAMETER_SENDER');assert.equal(f.logs[0].reason,'sender_configuration_rejected');
});
test('unexpected or malformed provider errors do not leak content',async()=>{
  for(const providerBody of [{code:'private-key',message:'Private issue description'},'<html>private-key</html>']){
    const f=fixture({providerStatus:500,providerBody});const response=await f.send();assert.equal(response.status,502);assert.equal((await response.json()).diagnostic,'BREVO_500_UNKNOWN_OTHER');
    assert.deepEqual(f.logs,[{event:'report_issue_brevo_error',status:500,code:'unknown',reason:'see_provider_status_and_code'}]);
  }
});
test('rate denial still prevents email sending',async()=>{
  const f=fixture({allowed:false});const response=await f.send();assert.equal(response.status,429);assert.equal((await response.json()).diagnostic,'REPORT_LIMIT');assert.equal(f.calls.length,1);assert.deepEqual(f.logs,[]);
});
