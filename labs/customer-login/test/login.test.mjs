import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {scryptSync} from 'node:crypto';
import {createApp} from '../server.mjs';
import {mockAuthenticator,directoryAuthenticator,validLogin} from '../auth.mjs';

async function lab(t,options={}){
 let base;const server=createApp({authenticate:async username=>({username,name:'Sample User',role:'viewer',source:'test'}),origin:()=>base,...options});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
 t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
 const bootstrap=async()=>{const r=await fetch(base+'/api/session');return {cookie:r.headers.get('set-cookie').split(';')[0],...(await r.json())};};
 const login=(s,body={username:'alice',password:'synthetic-password'},extra={})=>fetch(base+'/api/login',{method:'POST',headers:{Origin:base,Cookie:s.cookie,'Content-Type':'application/json','X-CSRF-Token':s.csrf,...extra},body:JSON.stringify(body)});
 return {base,bootstrap,login};
}
test('login input rejects empty passwords and DN injection',()=>{assert(!validLogin('alice',''));assert(!validLogin('x,ou=admins','x'));assert(validLogin('alice','safe'));});
test('mock password hashes validate without returning secrets',async()=>{const salt='test',password='test-pass',hash=scryptSync(password,salt,64).toString('hex');const auth=mockAuthenticator([{username:'alice',name:'Alice',role:'viewer',salt,hash}]);assert.equal((await auth('alice',password)).username,'alice');assert.equal(await auth('alice','wrong'),null);assert.equal(await auth('nobody','wrong'),null);assert(!JSON.stringify(await auth('alice',password)).includes(hash));});
test('page has a restrictive CSP and external assets',async t=>{const {base}=await lab(t);const r=await fetch(base);assert.equal(r.status,200);assert(r.headers.get('content-security-policy').includes("script-src 'self'"));assert((await r.text()).includes('Cedar'));});
test('anonymous report access denied',async t=>{const {base}=await lab(t);assert.equal((await fetch(base+'/api/report')).status,401);});
test('login requires matching CSRF token and origin',async t=>{const l=await lab(t),s=await l.bootstrap();assert.equal((await l.login(s,undefined,{'X-CSRF-Token':'wrong'})).status,403);assert.equal((await l.login(s,undefined,{Origin:'https://evil.example'})).status,403);});
test('successful login rotates session and viewer report is denied',async t=>{const l=await lab(t),s=await l.bootstrap(),r=await l.login(s);assert.equal(r.status,200);const cookie=r.headers.get('set-cookie').split(';')[0];assert.notEqual(cookie,s.cookie);assert(r.headers.get('set-cookie').includes('HttpOnly'));assert.equal((await fetch(l.base+'/api/report',{headers:{Cookie:cookie}})).status,403);assert.equal((await fetch(l.base+'/api/report',{headers:{Cookie:s.cookie}})).status,401);});
test('analyst can read synthetic report, logout invalidates session',async t=>{const l=await lab(t,{authenticate:async()=>({username:'ben',name:'Ben',role:'analyst',source:'test'})}),s=await l.bootstrap(),r=await l.login(s),d=await r.json(),cookie=r.headers.get('set-cookie').split(';')[0];assert.equal((await fetch(l.base+'/api/report',{headers:{Cookie:cookie}})).status,200);assert.equal((await fetch(l.base+'/api/logout',{method:'POST',headers:{Origin:l.base,Cookie:cookie,'X-CSRF-Token':d.csrf}})).status,200);assert.equal((await fetch(l.base+'/api/report',{headers:{Cookie:cookie}})).status,401);});
test('session expiry denies access',async t=>{let now=1000;const l=await lab(t,{clock:()=>now,authenticate:async()=>({username:'ben',role:'analyst'})}),s=await l.bootstrap(),r=await l.login(s),cookie=r.headers.get('set-cookie').split(';')[0];now+=600001;assert.equal((await fetch(l.base+'/api/report',{headers:{Cookie:cookie}})).status,401);});
test('directory failure returns 503 without mock fallback',async t=>{const l=await lab(t,{authenticate:async()=>{throw Error('private host detail');},mode:'pingdirectory'}),s=await l.bootstrap(),r=await l.login(s);assert.equal(r.status,503);assert(!(await r.text()).includes('private host detail'));});
test('failed passwords produce generic 401',async t=>{const l=await lab(t,{authenticate:async()=>null}),s=await l.bootstrap();assert.equal((await l.login(s)).status,401);});
test('rate limit applies to repeated attempts',async t=>{const l=await lab(t,{rateLimit:1,authenticate:async()=>null}),s=await l.bootstrap();assert.equal((await l.login(s)).status,401);assert.equal((await l.login(s)).status,429);});
function certFile(t){const dir=mkdtempSync(join(tmpdir(),'ciam-test-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const path=join(dir,'ca.pem');writeFileSync(path,'synthetic mocked CA');return path;}
test('LDAP adapter uses verified TLS and per-user bind, then unbinds',async t=>{let options,bind,closed=false;const auth=await directoryAuthenticator({url:'ldaps://localhost:1636',caFile:certFile(t),clientFactory:opts=>{options=opts;return {bind:async(dn,p)=>{bind={dn,p};},search:async()=>({searchEntries:[{uid:'alice',cn:'Alice',employeeType:'viewer'}]}),unbind:async()=>{closed=true;}};}});assert.equal((await auth('alice','synthetic-pass')).role,'viewer');assert.equal(options.tlsOptions.rejectUnauthorized,true);assert.equal(bind.dn,'uid=alice,ou=people,dc=example,dc=test');assert(closed);});
test('LDAP invalid credentials return null and connections close',async t=>{let closed=false;const auth=await directoryAuthenticator({url:'ldaps://localhost:1636',caFile:certFile(t),clientFactory:()=>({bind:async()=>{throw Object.assign(Error('denied'),{code:49});},unbind:async()=>{closed=true;}})});assert.equal(await auth('alice','wrong'),null);assert(closed);});
test('LDAP network error is not treated as a valid mock login',async t=>{const auth=await directoryAuthenticator({url:'ldaps://localhost:1636',caFile:certFile(t),clientFactory:()=>({bind:async()=>{throw Error('network');},unbind:async()=>{}})});await assert.rejects(()=>auth('alice','test'),/directory_unavailable/);});
test('plaintext LDAP URL is refused',async t=>{await assert.rejects(()=>directoryAuthenticator({url:'ldap://localhost:1389',caFile:certFile(t)}),/LDAPS/);});
