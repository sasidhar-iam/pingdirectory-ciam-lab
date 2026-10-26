import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {ldifAttribute} from './ldap-utils.mjs';

// Small rehearsal batches only, not a bulk migration engine.
export function profilesToLdif(records) {
  if (!Array.isArray(records) || records.length > 10000) throw new Error('batch_limit');
  const seen=new Set();
  return records.map(r=>{
    if(!r || typeof r.customerId!=='string' || !/^[A-Za-z0-9_-]{1,80}$/.test(r.customerId)) throw new Error('invalid_customer_id');
    if(seen.has(r.customerId)) throw new Error('duplicate_customer_id');
    seen.add(r.customerId);
    for(const name of ['displayName','surname'])if(typeof r[name]!=='string'||!r[name].trim())throw new Error('required_profile_field');
    if(!Array.isArray(r.entitlements)||r.entitlements.some(x=>typeof x!=='string'||!x.trim()))throw new Error('invalid_entitlements');
    const lines=[ldifAttribute('dn',`uid=${r.customerId},ou=people,dc=example,dc=test`),
      'objectClass: top','objectClass: person','objectClass: organizationalPerson','objectClass: inetOrgPerson','objectClass: labProfile',
      ldifAttribute('uid',r.customerId),ldifAttribute('cn',r.displayName),ldifAttribute('sn',r.surname),ldifAttribute('labSubjectId',r.customerId)];
    for(const role of [...new Set(r.entitlements)])lines.push(ldifAttribute('labEntitlement',role));
    return lines.join('\n')+'\n';
  }).join('\n');
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  try {
    const file=process.argv[2];if(!file)throw new Error('Provide JSONL input file');
    const bytes=readFileSync(file);if(bytes.length>10*1024*1024)throw new Error('input_limit_10MiB');
    const records=bytes.toString('utf8').split(/\r?\n/).filter(x=>x.trim()).map(x=>JSON.parse(x));
    process.stdout.write(profilesToLdif(records));
  } catch(error){console.error(error.message);process.exitCode=1;}
}
