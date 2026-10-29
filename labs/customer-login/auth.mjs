import {scryptSync,timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
export const validLogin=(u,p)=>typeof u==='string'&&/^[a-z][a-z0-9_-]{0,39}$/.test(u)&&typeof p==='string'&&p.length>0&&p.length<=256;
export function mockAuthenticator(users){
 const dummy={salt:'synthetic-salt',hash:scryptSync('never-a-user-password','synthetic-salt',64).toString('hex')};
 return async(username,password)=>{
  if(!validLogin(username,password))return null;
  const user=users.find(x=>x.username===username),record=user||dummy;
  const ok=timingSafeEqual(scryptSync(password,record.salt,64),Buffer.from(record.hash,'hex'));
  return ok&&user?{username:user.username,name:user.name,role:user.role,source:'Mock users — not PingDirectory'}:null;
 };
}
export async function directoryAuthenticator({url,caFile,clientFactory}){
 const parsed=new URL(url);
 if(parsed.protocol!=='ldaps:'||parsed.username||parsed.password||parsed.search||parsed.hash||!['','/'].includes(parsed.pathname))throw Error('Trusted LDAPS host and port required');
 const ca=readFileSync(caFile);
 if(!clientFactory){const {Client}=await import('ldapts');clientFactory=opts=>new Client(opts);}
 return async(username,password)=>{
  if(!validLogin(username,password))return null;
  const dn='uid='+username+',ou=people,dc=example,dc=test';
  const client=clientFactory({url,connectTimeout:3000,timeout:5000,tlsOptions:{ca,minVersion:'TLSv1.2',rejectUnauthorized:true}});
  try{
   await client.bind(dn,password);
   const {searchEntries}=await client.search(dn,{scope:'base',filter:'(objectClass=inetOrgPerson)',attributes:['uid','cn','employeeType'],sizeLimit:1,timeLimit:3});
   if(searchEntries.length!==1)return null;
   const entry=searchEntries[0],first=v=>Array.isArray(v)?v[0]:v,role=first(entry.employeeType);
   if(first(entry.uid)!==username||!['viewer','analyst','support'].includes(role))return null;
   return {username,name:String(first(entry.cn)||username),role,source:'PingDirectory — verified LDAPS user bind'};
  }catch(e){if(e.code===49)return null;throw Error('directory_unavailable');}
  finally{try{await client.unbind();}catch{}}
 };
}
