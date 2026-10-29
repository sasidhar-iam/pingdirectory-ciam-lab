import {mkdir,writeFile,access} from 'node:fs/promises';
import {randomBytes,scryptSync} from 'node:crypto';
const local=new URL('./.local/',import.meta.url);
await mkdir(local,{recursive:true,mode:0o700});
try{await access(new URL('credentials.json',local));throw Error('Seed already exists; refusing to overwrite passwords');}catch(e){if(e.code!=='ENOENT')throw e;}
const specs=[['alice','Alice Morgan','Morgan','viewer'],['ben','Ben Carter','Carter','analyst'],['chitra','Chitra Rao','Rao','support']];
const users=specs.map(([username,name,surname,role])=>({username,name,surname,role,password:'Aa1!'+randomBytes(18).toString('base64url')}));
await writeFile(new URL('credentials.json',local),JSON.stringify(users,null,2),{mode:0o600,flag:'wx'});
const hashes=users.map(({password,...user})=>{const salt=randomBytes(16).toString('hex');return {...user,salt,hash:scryptSync(password,salt,64).toString('hex')};});
await writeFile(new URL('mock-users.json',local),JSON.stringify(hashes,null,2),{mode:0o600,flag:'wx'});
// Private parent directory protects Docker-mounted readable files on Unix.
for(const file of ['root-password','admin-password','encryption-password','keystore-password'])
 await writeFile(new URL(file,local),'Aa1!'+randomBytes(24).toString('base64url'),{mode:0o444,flag:'wx'});
console.log('Created three synthetic accounts. Read .local/credentials.json privately; never commit it.');
