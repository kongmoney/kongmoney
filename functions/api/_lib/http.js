export function json(data, status=200){
  return new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
}
export function bad(message, status=400){ return json({ok:false,error:message},status); }
