import {readFileSync} from 'node:fs';
import {Client} from 'ldapts';
const local=new URL('./.local/',import.meta.url),users=JSON.parse(readFileSync(new URL('credentials.json',local),'utf8'));
const url=process.env.LDAP_URL||'ldaps://localhost:1636';
if(!url.startsWith('ldaps://'))throw Error('LDAPS required');
const client=new Client({url,connectTimeout:3000,timeout:5000,tlsOptions:{ca:readFileSync(new URL('pd-cert.pem',local)),minVersion:'TLSv1.2',rejectUnauthorized:true}});
try{
 await client.bind('cn=administrator',readFileSync(new URL('root-password',local),'utf8'));
 const base='ou=people,dc=example,dc=test';
 try{await client.add(base,{objectClass:['top','organizationalUnit'],ou:'people',aci:'(targetattr="uid || cn || employeeType")(version 3.0;acl "Lab users read own public fields";allow (read,search,compare) userdn="ldap:///self";)'});}
 catch(e){if(e.code!==68)throw e;}
 for(const u of users)try{
  await client.add('uid='+u.username+','+base,{objectClass:['top','person','organizationalPerson','inetOrgPerson'],uid:u.username,cn:u.name,sn:u.surname,employeeType:u.role,userPassword:u.password});
  console.log('Created synthetic account: '+u.username);
 }catch(e){if(e.code===68)console.log('Already exists; unchanged: '+u.username);else throw e;}
}finally{await client.unbind();}
