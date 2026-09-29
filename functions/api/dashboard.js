import {json,bad} from './_lib/http.js';
import {sheetsGet} from './_lib/google.js';

const n=v=>Number(v||0);
export async function onRequestGet({request,env}){
  try{
    const month=new URL(request.url).searchParams.get('month');
    if(!/^\d{4}-\d{2}$/.test(month||'')) return bad('month must be YYYY-MM');
    const data=await sheetsGet(env,['지출내역!A3:I1000','대출내역!A3:I200','월정산!A3:P100']);
    const [expensesRange,loansRange,settlementsRange]=data.valueRanges;
    const expenses=(expensesRange.values||[]).filter(r=>r[0]===month).map(r=>({category:r[1],subcategory:r[2],description:r[3],amount:n(r[4]),splitType:r[5]}));
    const lr=(loansRange.values||[]).find(r=>r[0]===month)||[];
    const sr=(settlementsRange.values||[]).find(r=>r[0]===month)||[];
    return json({
      month,
      summary:{living:n(sr[1]),loan:n(sr[2]),total:n(sr[3]),managerFinal:n(sr[8]),memberAFinal:n(sr[9]),memberBFinal:n(sr[10]),carryIn:n(sr[11]),autoTransfer:n(sr[13]||400000),carryOut:n(sr[15])},
      expenses,
      loan:{principal:n(lr[1]),interest:n(lr[2]),rate:n(lr[3]),balance:n(lr[4]),total:n(lr[5])}
    });
  }catch(err){ return bad(err.message||'dashboard error',500); }
}
