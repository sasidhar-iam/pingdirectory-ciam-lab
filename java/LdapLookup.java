import javax.naming.*;
import javax.naming.directory.*;
import java.util.Hashtable;
import java.net.URI;

/** Read-only example. Uses the JVM truststore; never disables hostname verification. */
public final class LdapLookup {
 public static String filterValue(String value) {
  var out = new StringBuilder();
  for (byte raw : value.getBytes(java.nio.charset.StandardCharsets.UTF_8)) {
   int b=raw & 255;
   if(b==0||b==40||b==41||b==42||b==92||b>=128)out.append(String.format("\\%02x",b));
   else out.append((char)b);
  }
  return out.toString();
 }
 public static void main(String[] args) throws Exception {
  String url=System.getenv("LDAP_URL"), bind=System.getenv("LDAP_BIND_DN"), password=System.getenv("LDAP_PASSWORD"), base=System.getenv("LDAP_BASE_DN");
  if(args.length!=1||url==null||bind==null||bind.isBlank()||password==null||password.isBlank()||base==null||base.isBlank())throw new IllegalArgumentException("Provide one uid and LDAP_URL, LDAP_BIND_DN, LDAP_PASSWORD, LDAP_BASE_DN");
  var uri=URI.create(url);
  if(!"ldaps".equalsIgnoreCase(uri.getScheme())||uri.getHost()==null||uri.getUserInfo()!=null||uri.getQuery()!=null||uri.getFragment()!=null)throw new IllegalArgumentException("Use a trusted ldaps URL without credentials or query parameters");
  var env=new Hashtable<String,String>();
  env.put(Context.INITIAL_CONTEXT_FACTORY,"com.sun.jndi.ldap.LdapCtxFactory");
  env.put(Context.PROVIDER_URL,url);env.put(Context.SECURITY_AUTHENTICATION,"simple");
  env.put(Context.SECURITY_PRINCIPAL,bind);env.put(Context.SECURITY_CREDENTIALS,password);
  env.put(Context.REFERRAL,"throw");env.put("com.sun.jndi.ldap.connect.timeout","3000");env.put("com.sun.jndi.ldap.read.timeout","3000");
  DirContext ctx=new InitialDirContext(env);
  try {
   var controls=new SearchControls();controls.setSearchScope(SearchControls.SUBTREE_SCOPE);
   controls.setReturningAttributes(new String[]{"uid"});controls.setCountLimit(2);controls.setTimeLimit(3000);
   NamingEnumeration<SearchResult> results=ctx.search(base,"(uid="+filterValue(args[0])+")",controls);
   try { int count=0;while(results.hasMore()){results.next();count++;}System.out.println("Matching entries: "+count); }
   finally {results.close();}
  } finally {ctx.close();}
 }
}
