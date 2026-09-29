const SCOPE='https://www.googleapis.com/auth/spreadsheets';
const TOKEN_URL='https://oauth2.googleapis.com/token';

function b64url(bytes){
  let s=''; for(const b of new Uint8Array(bytes)) s+=String.fromCharCode(b);
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function b64urlText(text){return b64url(new TextEncoder().encode(text));}
function pemToArrayBuffer(pem){
  const base64=pem.replace(/-----BEGIN PRIVATE KEY-----/g,'').replace(/-----END PRIVATE KEY-----/g,'').replace(/\s+/g,'');
  const bin=atob(base64); const bytes=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i); return bytes.buffer;
}

export async function getAccessToken(env){
  if(!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_PRIVATE_KEY) throw new Error('Google service account secrets are not configured.');
  const now=Math.floor(Date.now()/1000);
  const header=b64urlText(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const claims=b64urlText(JSON.stringify({iss:env.GOOGLE_SERVICE_ACCOUNT_EMAIL,scope:SCOPE,aud:TOKEN_URL,iat:now,exp:now+3600}));
  const unsigned=`${header}.${claims}`;
  const key=await crypto.subtle.importKey('pkcs8',pemToArrayBuffer(env.GOOGLE_PRIVATE_KEY.replace(/\\n/g,'\n')),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(unsigned));
  const assertion=`${unsigned}.${b64url(sig)}`;
  const body=new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion});
  const res=await fetch(TOKEN_URL,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body});
  if(!res.ok) throw new Error(`Google token error: ${res.status}`);
  return (await res.json()).access_token;
}

export async function sheetsGet(env, ranges){
  if(!env.GOOGLE_SHEET_ID) throw new Error('GOOGLE_SHEET_ID is not configured.');
  const token=await getAccessToken(env);
  const qs=new URLSearchParams(); for(const range of ranges) qs.append('ranges',range); qs.set('majorDimension','ROWS'); qs.set('valueRenderOption','UNFORMATTED_VALUE');
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEET_ID}/values:batchGet?${qs}`;
  const res=await fetch(url,{headers:{authorization:`Bearer ${token}`}}); if(!res.ok) throw new Error(`Sheets read error: ${res.status}`); return res.json();
}

export async function sheetsAppend(env, range, values){
  if(!env.GOOGLE_SHEET_ID) throw new Error('GOOGLE_SHEET_ID is not configured.');
  const token=await getAccessToken(env);
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const res=await fetch(url,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({majorDimension:'ROWS',values})});
  if(!res.ok) throw new Error(`Sheets append error: ${res.status}`); return res.json();
}
