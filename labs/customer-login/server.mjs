import http from 'node:http';
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {mockAuthenticator,directoryAuthenticator,validLogin} from './auth.mjs';
export function createApp({authenticate,mode='mock',origin='http://127.0.0.1:3000',clock=Date.now,rateLimit=10}){
 const sessions=new Map(),attempts=new Map();let active=0;
 const getOrigin=()=>typeof origin==='function'?origin():origin;
 const id=()=>randomBytes(32).toString('base64url');
 const cookie=(sid,clear=false)=>'ciam_lab='+(clear?'':sid)+'; HttpOnly; SameSite=Strict; Path=/; Max-Age='+(clear?0:600);
 const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
 return http.createServer(async(req,res)=>{
  for(const [key,value]of sessions)if(value.expires<=clock())sessions.delete(key);
  for(const [key,value]of attempts)if(value.until<=clock())attempts.delete(key);
  for(const [k,v]of Object.entries({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"}))res.setHeader(k,v);
  if(req.headers.host!==new URL(getOrigin()).host)return send(res,403,{error:'Untrusted host'});
  try{
   const sid=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('ciam_lab='))?.slice(9),session=sessions.get(sid);
   if(req.method==='GET'&&req.url==='/api/session'){
    if(session)return send(res,200,{csrf:session.csrf,mode,user:session.user||null});
    if(sessions.size>=1000)return send(res,503,{error:'Lab busy'});
    const fresh=id(),s={csrf:id(),expires:clock()+600000};sessions.set(fresh,s);res.setHeader('Set-Cookie',cookie(fresh));return send(res,200,{csrf:s.csrf,mode,user:null});
   }
   if(req.method==='GET'&&req.url==='/api/report'){
    if(!session?.user)return send(res,401,{error:'Sign in required'});
    if(!['analyst','support'].includes(session.user.role))return send(res,403,{error:'This demo report requires analyst or support access'});
    return send(res,200,{accounts:3,monthlySpend:425,notice:'Synthetic demonstration data only'});
   }
   if(req.method==='POST'&&['/api/login','/api/logout'].includes(req.url)){
    if(req.headers.origin!==getOrigin()||!session||req.headers['x-csrf-token']!==session.csrf)return send(res,403,{error:'Refresh the page and try again'});
    if(req.url==='/api/logout'){sessions.delete(sid);res.setHeader('Set-Cookie',cookie('',true));return send(res,200,{ok:true});}
    if(req.headers['content-type']!=='application/json')return send(res,415,{error:'JSON required'});
    const parts=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>4096){res.setHeader('Connection','close');send(res,413,{error:'Request too large'});return;}parts.push(chunk);}
    let body;try{body=JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{return send(res,400,{error:'Invalid request'});}
    if(!validLogin(body?.username,body?.password))return send(res,401,{error:'Invalid username or password'});
    const key=req.socket.remoteAddress,a=attempts.get(key)||{count:0,until:clock()+60000};a.count++;attempts.set(key,a);
    if(a.count>rateLimit)return send(res,429,{error:'Too many attempts; wait one minute'});
    if(active>=5)return send(res,503,{error:'Lab busy'});
    active++;let user;try{user=await authenticate(body.username,body.password);}finally{active--;}
    if(!user)return send(res,401,{error:'Invalid username or password'});
    sessions.delete(sid);const fresh=id(),next={user,csrf:id(),expires:clock()+600000};sessions.set(fresh,next);res.setHeader('Set-Cookie',cookie(fresh));return send(res,200,{user,csrf:next.csrf});
   }
   const assets={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/style.css':['style.css','text/css']};
   if(req.method==='GET'&&assets[req.url]){const [file,type]=assets[req.url];res.writeHead(200,{'Content-Type':type});res.end(readFileSync(new URL('./public/'+file,import.meta.url)));return;}
   send(res,404,{error:'Not found'});
  }catch{send(res,503,{error:'Authentication service unavailable; no fallback is enabled'});}
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const mode=process.argv.includes('--mock')?'mock':process.argv.includes('--ldap')?'pingdirectory':null;
 if(!mode)throw Error('Choose --mock or --ldap explicitly');
 const port=Number(process.env.LAB_PORT||3000);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid port');
 const authenticate=mode==='mock'?mockAuthenticator(JSON.parse(readFileSync(new URL('./.local/mock-users.json',import.meta.url)))):await directoryAuthenticator({url:process.env.LDAP_URL||'ldaps://localhost:1636',caFile:process.env.LDAP_CA_FILE||new URL('./.local/pd-cert.pem',import.meta.url)});
 createApp({authenticate,mode,origin:'http://127.0.0.1:'+port}).listen(port,'127.0.0.1',()=>console.log('Customer lab: http://127.0.0.1:'+port+' — '+mode.toUpperCase()+' mode'));
}
