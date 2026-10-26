// RFC 4515 filter assertion-value escaping, distinct from DN escaping.
export function escapeFilter(value) {
  if (typeof value !== 'string') throw new TypeError('string_required');
  return [...Buffer.from(value,'utf8')].map(b =>
    b === 0 || b === 40 || b === 41 || b === 42 || b === 92 || b >= 128
      ? '\\' + b.toString(16).padStart(2,'0') : String.fromCharCode(b)).join('');
}
// RFC 2849 value form: encode unsafe initial bytes, controls and non-ASCII.
export function ldifAttribute(name,value) {
  if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(name)) throw new Error('invalid_attribute');
  if (typeof value !== 'string') throw new TypeError('string_required');
  if (!value) return name + ':';
  const unsafe = /^[ :<]/.test(value) || /[\x00-\x1f\x7f-\uffff]/.test(value) || value.endsWith(' ');
  return unsafe ? name + ':: ' + Buffer.from(value,'utf8').toString('base64') : name + ': ' + value;
}
