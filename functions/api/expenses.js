import {json,bad} from './_lib/http.js';
import {sheetsAppend} from './_lib/google.js';

export async function onRequestPost({request,env}){
  try{
    const body=await request.json();
    const {month,category,subcategory,description='',amount,splitType}=body;
    if(!/^\d{4}-\d{2}$/.test(month||'')) return bad('month must be YYYY-MM');
    if(!category||!subcategory||!Number.isFinite(Number(amount))||Number(amount)<0) return bad('invalid expense');
    const value=Number(amount);
    let manager=0,a=0,b=0;
    if(splitType==='3인 공동'){manager=a=b=value/3;}
    else {manager=a=value/2;b=0;}
    await sheetsAppend(env,'지출내역!A:I',[[month,category,subcategory,description,value,splitType,manager,a,b]]);
    return json({ok:true},201);
  }catch(err){return bad(err.message||'expense append error',500);}
}
