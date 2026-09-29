import {json} from './_lib/http.js';
export function onRequestGet({env}){
  return json({ok:true,googleSheetConfigured:Boolean(env.GOOGLE_SHEET_ID&&env.GOOGLE_SERVICE_ACCOUNT_EMAIL&&env.GOOGLE_PRIVATE_KEY)});
}
