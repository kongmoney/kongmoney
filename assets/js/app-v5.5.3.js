const KONGMONEY_FRONT_VERSION = '5.5.3';
const today = new Date();
const initialMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
const STORAGE_MONTH_KEY = 'kongmoney.selectedMonth';
const STORAGE_PENDING_KEY = 'kongmoney.pendingExpenses';
const SETTLEMENT_SYNC_VERSION = '2026-clean-year-v3';
const savedMonth = (() => { try { return localStorage.getItem(STORAGE_MONTH_KEY) || ''; } catch { return ''; } })();
const state = {
  month: /^2026-(0[1-9]|1[0-2])$/.test(savedMonth) ? savedMonth : (/^2026-/.test(initialMonth) ? initialMonth : '2026-01'),
  filter: '전체', data: null, loading: false, recurring: [], editingExpenseRow: null,
};
const won = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });
const $ = (id) => document.getElementById(id);
const money = (n) => `${won.format(Number(n || 0))}원`;

function rememberMonth(ym){ try { localStorage.setItem(STORAGE_MONTH_KEY, ym); } catch {} }
function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function digitsOnly(value){ return String(value ?? '').replace(/[^0-9]/g,''); }
function bindDigitsOnly(input){
  if(!input) return;
  input.addEventListener('input',()=>{ input.value=digitsOnly(input.value); });
  input.addEventListener('paste',()=>queueMicrotask(()=>{ input.value=digitsOnly(input.value); }));
}
function parseRateInput(v){ const x=Number(String(v??'').replace(/[^0-9.]/g,'')); return Number.isFinite(x)&&x>=0?x:0; }
function formatMonth(ym){ const [y,m]=ym.split('-'); return `${y}년 ${Number(m)}월`; }
function shiftMonth(ym,delta){ const [y,m]=ym.split('-').map(Number); const d=new Date(y,m-1+delta,1); const next=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; if(next<'2026-01') return '2026-01'; if(next>'2026-12') return '2026-12'; return next; }
function emptyDashboard(month){ return {month,summary:{living:0,loan:0,total:0,managerFinal:0,memberAFinal:0,memberBFinal:0,carryIn:0,autoTransfer:0,carryOut:0},comparison:{previousMonth:null,previous:null},meta:{month,memo:'',closed:false},expenses:[],loan:{principal:0,interest:0,total:0,balance:0,rate:0}}; }

async function syncSettlementOnce(){
  const key=`kongmoney.settlementSync.${SETTLEMENT_SYNC_VERSION}`;
  try {
    if(sessionStorage.getItem(key)==='done') return false;
    const res=await fetch('/api/settlement-sync',{method:'POST',headers:{accept:'application/json'}});
    const body=await res.json().catch(()=>({}));
    if(!res.ok||body.ok===false) throw new Error(body.error||`월정산 동기화 실패 (${res.status})`);
    sessionStorage.setItem(key,'done'); return true;
  } catch(err){ console.warn('monthly settlement sync skipped:',err); return false; }
}

function expenseKey(row){ return [row?.month,row?.category,row?.subcategory,row?.description,row?.amount,row?.splitType].map(v=>String(v??'')).join('|'); }
function getPendingExpenses(){ try { const raw=localStorage.getItem(STORAGE_PENDING_KEY); const arr=raw?JSON.parse(raw):[]; return Array.isArray(arr)?arr:[]; } catch { return []; } }
function setPendingExpenses(list){ try { localStorage.setItem(STORAGE_PENDING_KEY,JSON.stringify(list)); } catch {} }
function pushPendingExpense(row){ const list=getPendingExpenses(); const key=expenseKey(row); if(!list.some(item=>expenseKey(item)===key)) list.push(row); setPendingExpenses(list); }
function removePendingExpense(row){ const key=expenseKey(row); setPendingExpenses(getPendingExpenses().filter(item=>expenseKey(item)!==key)); }
function mergePendingExpenses(data,month){
  if(!data||!Array.isArray(data.expenses)) return data;
  const pending=getPendingExpenses(); if(!pending.length) return data;
  const liveKeys=new Set(data.expenses.map(expenseKey)); const merged=[...data.expenses];
  for(const item of pending){ if(item.month===month&&!liveKeys.has(expenseKey(item))) merged.push(item); }
  data.expenses=merged;
  setPendingExpenses(pending.filter(item=>!(item.month===month&&liveKeys.has(expenseKey(item)))));
  return data;
}

function showToast(message,type='ok'){
  const toast=$('toast'); toast.textContent=message; toast.className=`toast show ${type}`;
  clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>{toast.className='toast';},2800);
}
function setConnection(ok,text){ const el=$('connectionStatus'); el.textContent=text; el.classList.toggle('error',!ok); }

async function apiJson(url,options={}){
  const res=await fetch(url,{...options,headers:{accept:'application/json',...(options.headers||{})}});
  const body=await res.json().catch(()=>({}));
  if(!res.ok||body.ok===false) throw new Error(body.error||`요청 실패 (${res.status})`);
  return body;
}
async function getDashboard(month){ return apiJson(`/api/dashboard?month=${encodeURIComponent(month)}`,{cache:'no-store'}); }
async function getRecurring(){ return apiJson('/api/recurring',{cache:'no-store'}); }

function setMonthPickerActive(){ document.querySelectorAll('[data-month-jump]').forEach(btn=>btn.classList.toggle('active',btn.dataset.monthJump===state.month)); }
function closeMonthPicker(){ const picker=$('monthPicker'),btn=$('monthJumpBtn'); if(!picker||!btn)return; picker.hidden=true; btn.setAttribute('aria-expanded','false'); }
function toggleMonthPicker(){ const picker=$('monthPicker'),btn=$('monthJumpBtn'); if(!picker||!btn)return; const opening=picker.hidden; picker.hidden=!opening; btn.setAttribute('aria-expanded',opening?'true':'false'); if(opening)setMonthPickerActive(); }

function splitLabel(v){ const x=String(v||'').trim(); const aliases={'총무+구성원 A':'SH + JH','총무+구성원 A 부담':'SH + JH','총무 + 구성원 A':'SH + JH','2인 공동':'SH + JH','SH+JH':'SH + JH'}; return aliases[x]||x; }
function expenseBadge(category){ if(category==='생활비')return{cls:'life',icon:'🏠'}; if(category==='기타/부속')return{cls:'extra',icon:'🧺'}; return{cls:'other',icon:'₩'}; }
function signedMoney(diff){ const n=Number(diff||0); return `${n>0?'+':n<0?'−':''}${won.format(Math.abs(n))}원`; }
function compareText(current,previous,{percent=false}={}){
  if(previous===null||previous===undefined) return '전월 비교 없음';
  const diff=Number(current||0)-Number(previous||0);
  if(percent){
    if(Number(previous||0)===0) return diff===0?'전월과 동일':`전월 대비 ${signedMoney(diff)} · 신규`;
    const pct=(diff/Number(previous))*100;
    return `전월 대비 ${signedMoney(diff)} · ${pct>0?'+':''}${pct.toFixed(1)}%`;
  }
  return diff===0?'전월과 동일':`전월 대비 ${signedMoney(diff)}`;
}

function renderComparison(){
  const c=state.data?.comparison||{}; const prev=c.previous; const s=state.data?.summary||{};
  const prefix=c.previousMonth?`${Number(c.previousMonth.slice(5))}월 `:'';
  $('livingCompare').textContent=prev?`${prefix}생활비 ${money(prev.living)} · ${compareText(s.living,prev.living,{percent:true})}`:'전월 비교 없음';
  $('managerCompare').textContent=prev?compareText(s.managerFinal,prev.managerFinal):'전월 비교 없음';
  $('memberACompare').textContent=prev?compareText(s.memberAFinal,prev.memberAFinal):'전월 비교 없음';
  $('memberBCompare').textContent=prev?compareText(s.memberBFinal,prev.memberBFinal):'전월 비교 없음';
}

function isClosed(){ return Boolean(state.data?.meta?.closed); }
function renderMonthMeta(){
  const meta=state.data?.meta||{memo:'',closed:false};
  const memo=$('monthMemo'); if(document.activeElement!==memo) memo.value=meta.memo||'';
  const badge=$('monthCloseBadge'); badge.textContent=meta.closed?'정산 완료':'진행중'; badge.classList.toggle('closed',meta.closed); badge.classList.toggle('open',!meta.closed);
  const toggle=$('toggleMonthCloseBtn'); toggle.textContent=meta.closed?'마감 해제':'정산 마감'; toggle.classList.toggle('danger-soft',meta.closed);
  $('monthCloseHelp').textContent=meta.closed?'이 달은 잠겨 있어요. 수정하려면 마감 해제하세요.':'마감하면 이 달의 지출·대출 수정이 잠겨요.';
  document.body.classList.toggle('month-closed',meta.closed);
  $('addExpenseBtn').disabled=meta.closed;
  document.querySelectorAll('[data-loan-edit]').forEach(btn=>btn.disabled=meta.closed);
}

function renderDashboardFields(){
  const d=state.data||emptyDashboard(state.month),s=d.summary||{},loan=d.loan||{};
  $('monthLabel').textContent=formatMonth(state.month); setMonthPickerActive();
  $('totalExpense').textContent=money(s.total); $('expenseBreakdown').textContent=`생활비 ${money(s.living)} · 대출 ${money(s.loan)}`;
  $('managerFinal').textContent=money(s.managerFinal); $('memberAFinal').textContent=money(s.memberAFinal); $('memberBFinal').textContent=money(s.memberBFinal);
  $('carryIn').textContent=money(s.carryIn); $('autoTransfer').textContent=money(s.autoTransfer); $('bSettlement').textContent=money(s.memberBFinal); $('carryOut').textContent=money(s.carryOut);
  $('carryNote').textContent=s.total>0?(s.carryOut>=0?`이번 달 정산 후 ${money(s.carryOut)}이 다음 달로 이월됩니다.`:`이번 달 부족분 ${money(Math.abs(s.carryOut))}이 다음 달에 추가 반영됩니다.`):'아직 이 달에 등록된 정산 데이터가 없습니다.';
  $('loanPrincipal').textContent=money(loan.principal); $('loanInterest').textContent=money(loan.interest); $('loanTotal').textContent=money(loan.total); $('loanBalance').textContent=money(loan.balance);
  renderComparison(); renderMonthMeta();
}

function renderExpenses(){
  const list=$('expenseList'); list.innerHTML=''; const closed=isClosed();
  const rows=(state.data?.expenses||[]).filter(x=>state.filter==='전체'||x.category===state.filter);
  $('emptyExpenses').hidden=rows.length>0;
  for(const row of rows){
    const badge=expenseBadge(row.category); const el=document.createElement('div'); el.className=`expense-row${row.sheetRow?' editable':''}${closed?' locked':''}`;
    if(row.sheetRow) el.dataset.expenseEdit=String(row.sheetRow);
    el.innerHTML=`<div class="expense-main"><span class="expense-badge ${badge.cls}">${badge.icon}</span><div class="expense-body"><div class="expense-title">${escapeHtml(row.subcategory||row.category)}</div><div class="expense-meta">${escapeHtml(row.description||'-')}</div><div class="expense-tags"><span class="expense-tag">${escapeHtml(row.category)}</span><span class="expense-tag">${escapeHtml(splitLabel(row.splitType)||'-')}</span>${row.sheetRow&&!closed?'<span class="expense-edit-hint">클릭하여 수정</span>':''}</div></div></div><div class="expense-side"><div class="expense-amount">${money(row.amount)}<span class="expense-split">${escapeHtml(row.month||state.month)}</span></div>${row.sheetRow&&!closed?`<button class="expense-delete-btn" type="button" data-expense-delete="${Number(row.sheetRow)}" aria-label="지출 삭제">삭제</button>`:''}${closed?'<span class="locked-label">마감됨</span>':''}</div>`;
    list.append(el);
  }
}

function renderRecurring(){
  const quick=$('recurringQuickList'); const manage=$('recurringManageList'); const templates=state.recurring||[]; const closed=isClosed();
  $('recurringCount').textContent=`${templates.length}개`;
  if(!templates.length){ quick.innerHTML='<span class="recurring-empty">저장된 반복지출이 없어요. ↻ 반복지출에서 등록해보세요.</span>'; manage.innerHTML='<p class="empty-state">저장된 반복지출이 없습니다.</p>'; return; }
  quick.innerHTML=templates.map(t=>`<button class="recurring-quick-item" type="button" data-recurring-add="${escapeHtml(t.id)}" ${closed?'disabled':''}><span><strong>${escapeHtml(t.name)}</strong><small>${escapeHtml(t.subcategory)} · ${money(t.amount)}</small></span><b>+ 이번 달</b></button>`).join('');
  manage.innerHTML=templates.map(t=>`<div class="recurring-manage-item"><div><strong>${escapeHtml(t.name)}</strong><small>${escapeHtml(t.category)} · ${escapeHtml(t.subcategory)} · ${money(t.amount)} · ${escapeHtml(splitLabel(t.splitType))}</small></div><div class="recurring-manage-actions"><button type="button" data-recurring-edit="${escapeHtml(t.id)}">수정</button><button class="danger-text" type="button" data-recurring-delete="${escapeHtml(t.id)}">삭제</button></div></div>`).join('');
}

function render(){ renderDashboardFields(); renderExpenses(); renderRecurring(); }

async function refreshDashboardQuiet(){ try{ state.data=mergePendingExpenses(await getDashboard(state.month),state.month); render(); }catch{} }
async function load(){
  if(state.loading)return; state.loading=true; $('refreshBtn').disabled=true; setConnection(true,'불러오는 중…');
  try{ state.data=mergePendingExpenses(await getDashboard(state.month),state.month); rememberMonth(state.month); setConnection(true,'Google Sheet 연결됨'); }
  catch(err){ state.data=emptyDashboard(state.month); setConnection(false,'Google Sheet 오류'); showToast(err.message||'데이터를 불러오지 못했습니다.','error'); }
  finally{ state.loading=false; $('refreshBtn').disabled=false; render(); }
}
async function loadRecurring(){ try{ const body=await getRecurring(); state.recurring=Array.isArray(body.templates)?body.templates:[]; renderRecurring(); return state.recurring; } catch(err){ state.recurring=[]; renderRecurring(); showToast(`반복지출 불러오기 실패: ${err.message||'알 수 없는 오류'}`,'error'); return []; } }

async function requestExpense(method,payload){ return apiJson('/api/expenses',{method,headers:{'content-type':'application/json'},body:JSON.stringify(payload)}); }
function optimisticAddExpense(expense){
  if(!state.data||state.data.month!==expense.month) state.data=emptyDashboard(expense.month);
  if(!Array.isArray(state.data.expenses)) state.data.expenses=[];
  state.data.expenses.push(expense); pushPendingExpense(expense); renderExpenses();
}

function resetExpenseFormForCreate(){
  state.editingExpenseRow=null; const form=$('expenseForm'); form.reset(); $('expenseMonth').value=state.month;
  $('expenseDialogKicker').textContent='NEW EXPENSE'; $('expenseDialogTitle').textContent='지출 추가'; $('expenseSaveBtn').textContent='저장'; $('saveAsRecurringWrap').hidden=false;
}
function openExpenseCreate(){ if(isClosed()){showToast('정산 마감된 달입니다. 마감 해제 후 추가해주세요.','error');return;} resetExpenseFormForCreate(); $('expenseDialog').showModal(); }
function openExpenseEdit(row){
  if(isClosed()){showToast('정산 마감된 달입니다. 마감 해제 후 수정해주세요.','error');return;}
  state.editingExpenseRow=Number(row.sheetRow); const form=$('expenseForm'); form.reset();
  $('expenseMonth').value=row.month; $('expenseCategory').value=row.category; $('expenseSubcategory').value=row.subcategory||''; $('expenseDescription').value=row.description||''; $('expenseAmount').value=String(Math.round(Number(row.amount||0))); $('expenseSplitType').value=splitLabel(row.splitType);
  $('expenseDialogKicker').textContent='EDIT EXPENSE'; $('expenseDialogTitle').textContent='지출 수정'; $('expenseSaveBtn').textContent='수정 저장'; $('saveAsRecurringWrap').hidden=true; $('expenseDialog').showModal();
}

function resetRecurringForm(){ const f=$('recurringForm'); f.reset(); $('recurringSheetRow').value=''; $('recurringId').value=''; $('recurringSaveBtn').textContent='반복지출 저장'; $('recurringCancelEditBtn').hidden=true; }
function fillRecurringForm(t){ $('recurringSheetRow').value=''; $('recurringId').value=t.id||''; $('recurringName').value=t.name||''; $('recurringCategory').value=t.category; $('recurringSubcategory').value=t.subcategory||''; $('recurringDescription').value=t.description||''; $('recurringAmount').value=String(Math.round(Number(t.amount||0))); $('recurringSplitType').value=t.splitType; $('recurringSaveBtn').textContent='수정 저장'; $('recurringCancelEditBtn').hidden=false; }

async function saveMonthMeta(payload){ return apiJson('/api/month-meta',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({month:state.month,...payload})}); }

async function getLoanTrend(){ return apiJson('/api/loan-trend',{cache:'no-store'}); }
function renderLoanTrendChart(rows){
  const host=$('loanTrendChart'),data=(rows||[]).filter(r=>r&&r.month); if(!data.length){host.innerHTML='<p class="trend-empty">대출 데이터가 없습니다.</p>';return;}
  const W=760,H=280,pad={l:54,r:22,t:22,b:42},vals=data.map(r=>Number(r.balance||0)); let min=Math.min(...vals),max=Math.max(...vals); if(max===min){max+=1;min=Math.max(0,min-1);} const spread=max-min; min=Math.max(0,min-spread*.18);max=max+spread*.12;
  const x=i=>pad.l+(W-pad.l-pad.r)*(data.length===1?0:i/(data.length-1)),y=v=>pad.t+(H-pad.t-pad.b)*(1-(v-min)/(max-min)); const points=data.map((r,i)=>`${x(i).toFixed(1)},${y(Number(r.balance||0)).toFixed(1)}`).join(' '),area=`${pad.l},${H-pad.b} ${points} ${x(data.length-1)},${H-pad.b}`;
  const grid=[0,.25,.5,.75,1].map(t=>{const yy=pad.t+(H-pad.t-pad.b)*t,val=max-(max-min)*t;return `<line x1="${pad.l}" y1="${yy}" x2="${W-pad.r}" y2="${yy}" class="trend-grid"/><text x="${pad.l-8}" y="${yy+4}" text-anchor="end" class="trend-axis-text">${Math.round(val/10000).toLocaleString()}만</text>`;}).join('');
  const ticks=data.map((r,i)=>`<text x="${x(i)}" y="${H-16}" text-anchor="middle" class="trend-axis-text">${Number(r.month.slice(5))}월</text>`).join(''),dots=data.map((r,i)=>`<circle cx="${x(i)}" cy="${y(Number(r.balance||0))}" r="4.2" class="trend-dot"><title>${formatMonth(r.month)} · ${money(r.balance)}</title></circle>`).join('');
  host.innerHTML=`<svg class="trend-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="2026년 대출 잔액 라인 차트"><defs><linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#b9e4d2" stop-opacity=".58"/><stop offset="100%" stop-color="#b9e4d2" stop-opacity=".06"/></linearGradient></defs>${grid}<polygon points="${area}" fill="url(#trendFill)"/><polyline points="${points}" class="trend-line"/>${dots}${ticks}</svg>`;
}
function renderLoanTrendTable(rows){ $('loanTrendTableBody').innerHTML=(rows||[]).map(r=>`<tr><td>${Number(r.month.slice(5))}월</td><td>${money(r.principal)}</td><td>${money(r.interest)}</td><td>${(Number(r.rate||0)*100).toFixed(2)}%</td><td>${money(r.balance)}</td></tr>`).join(''); }
async function openLoanTrendDialog(){ const dialog=$('loanTrendDialog'); dialog.showModal(); $('loanTrendChart').innerHTML='<p class="trend-empty">불러오는 중…</p>'; try{const data=await getLoanTrend();$('trendStartBalance').textContent=money(data.summary?.startBalance);$('trendCurrentBalance').textContent=money(data.summary?.currentBalance);$('trendPrincipalPaid').textContent=money(data.summary?.cumulativePrincipal);renderLoanTrendChart(data.rows);renderLoanTrendTable(data.rows);}catch(err){$('loanTrendChart').innerHTML=`<p class="trend-empty error">${escapeHtml(err.message||'대출 변동추이를 불러오지 못했습니다.')}</p>`;} }
async function saveLoan(payload){ return apiJson('/api/loan',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}); }
async function resetLoan(month){ return apiJson('/api/loan',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({month})}); }
function updateLoanPreview(){ const principal=Number(digitsOnly($('loanPrincipalInput')?.value)||0),interest=Number(digitsOnly($('loanInterestInput')?.value)||0); $('loanTotalPreview').textContent=money(principal+interest); }
function openLoanDialog(){ if(isClosed()){showToast('정산 마감된 달입니다. 마감 해제 후 수정해주세요.','error');return;} const loan=state.data?.loan||{}; $('loanEditMonth').textContent=formatMonth(state.month); $('loanPrincipalInput').value=String(Math.round(Number(loan.principal||0))); $('loanInterestInput').value=String(Math.round(Number(loan.interest||0))); $('loanRateInput').value=loan.rate?String(Number(loan.rate)<=1?Number(loan.rate)*100:Number(loan.rate)):''; $('loanBalanceInput').value=String(Math.round(Number(loan.balance||0))); updateLoanPreview(); $('loanDialog').showModal(); }

function enableBackdropClose(dialog){ if(!dialog)return; dialog.addEventListener('click',(e)=>{if(e.target===dialog)dialog.close();}); }
document.querySelectorAll('dialog.dialog').forEach(enableBackdropClose);
bindDigitsOnly($('expenseAmount')); document.querySelectorAll('.numeric-only').forEach(bindDigitsOnly); $('loanPrincipalInput').addEventListener('input',updateLoanPreview); $('loanInterestInput').addEventListener('input',updateLoanPreview);

$('prevMonth').addEventListener('click',()=>{state.month=shiftMonth(state.month,-1);rememberMonth(state.month);load();});
$('nextMonth').addEventListener('click',()=>{state.month=shiftMonth(state.month,1);rememberMonth(state.month);load();});
$('monthJumpBtn')?.addEventListener('click',(e)=>{e.stopPropagation();toggleMonthPicker();});
document.querySelectorAll('[data-month-jump]').forEach(btn=>btn.addEventListener('click',()=>{state.month=btn.dataset.monthJump;rememberMonth(state.month);closeMonthPicker();load();}));
$('monthPicker')?.addEventListener('click',(e)=>e.stopPropagation()); document.addEventListener('click',closeMonthPicker); document.addEventListener('keydown',(e)=>{if(e.key==='Escape')closeMonthPicker();});
$('refreshBtn').addEventListener('click',load);
document.querySelectorAll('.chip').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.chip').forEach(x=>x.classList.remove('active'));btn.classList.add('active');state.filter=btn.dataset.filter;renderExpenses();}));

$('addExpenseBtn').addEventListener('click',openExpenseCreate); $('closeExpenseDialog').addEventListener('click',()=>$('expenseDialog').close());
$('expenseList').addEventListener('click',async(e)=>{
  const deleteBtn=e.target.closest('[data-expense-delete]');
  if(deleteBtn){ e.stopPropagation(); if(isClosed())return; const sheetRow=Number(deleteBtn.dataset.expenseDelete),row=(state.data?.expenses||[]).find(item=>Number(item.sheetRow)===sheetRow); if(!row)return; if(!confirm(`‘${row.subcategory||row.category}’ ${money(row.amount)} 지출을 삭제할까요?`))return; deleteBtn.disabled=true; try{await requestExpense('DELETE',{sheetRow});removePendingExpense(row);state.data.expenses=state.data.expenses.filter(item=>Number(item.sheetRow)!==sheetRow);renderExpenses();showToast('지출을 삭제했고 Google Sheet에도 반영했습니다.');refreshDashboardQuiet();}catch(err){deleteBtn.disabled=false;showToast(err.message||'지출 삭제에 실패했습니다.','error');} return; }
  const card=e.target.closest('[data-expense-edit]'); if(card){ const row=(state.data?.expenses||[]).find(item=>Number(item.sheetRow)===Number(card.dataset.expenseEdit)); if(row)openExpenseEdit(row); }
});

$('expenseForm').addEventListener('submit',async(e)=>{
  e.preventDefault(); const form=e.currentTarget; if(!form.reportValidity())return; const saveBtn=$('expenseSaveBtn'); const fd=new FormData(form),row=Object.fromEntries(fd.entries()); row.amount=Number(digitsOnly(row.amount)||0); if(row.amount<=0){showToast('금액을 1원 이상 입력해주세요.','error');return;}
  const editing=Number(state.editingExpenseRow)||null;
  const saveAsRecurring = !editing && $('saveAsRecurring').checked;
  saveBtn.disabled=true; saveBtn.textContent=editing?'수정 중…':'저장 중…';
  try{
    const body=await requestExpense(editing?'PUT':'POST',editing?{...row,sheetRow:editing}:{...row,saveAsRecurring});
    const saved={...row,amount:row.amount,sheetRow:body.sheetRow};
    $('expenseDialog').close();
    if(editing){ removePendingExpense((state.data?.expenses||[]).find(x=>Number(x.sheetRow)===editing)||{}); state.data.expenses=(state.data?.expenses||[]).filter(x=>Number(x.sheetRow)!==editing); if(saved.month===state.month)state.data.expenses.push(saved); showToast('지출을 수정했고 Google Sheet에도 반영했습니다.'); }
    else {
      state.month=row.month; rememberMonth(state.month); optimisticAddExpense(saved);
      if(saveAsRecurring){
        if(body.recurringSaved !== true || !body.recurringTemplate) throw new Error('지출은 저장됐지만 반복지출 D1 저장 확인에 실패했습니다.');
        if(!state.recurring.some(x=>x.id===body.recurringTemplate.id)) state.recurring.push(body.recurringTemplate);
        renderRecurring();
        showToast('지출 저장 + 반복지출 등록까지 완료했습니다.');
      } else {
        showToast(`${formatMonth(row.month)} 지출을 Google Sheet에 저장했습니다.`);
      }
    }
    state.editingExpenseRow=null; form.reset(); renderExpenses(); refreshDashboardQuiet();
  }catch(err){showToast(err.message||'지출 저장에 실패했습니다.','error');}
  finally{saveBtn.disabled=false;saveBtn.textContent=state.editingExpenseRow?'수정 저장':'저장';}
});

$('recurringManageBtn').addEventListener('click',()=>{resetRecurringForm();renderRecurring();$('recurringDialog').showModal();}); $('closeRecurringDialog').addEventListener('click',()=>$('recurringDialog').close()); $('recurringCancelEditBtn').addEventListener('click',resetRecurringForm);
$('recurringForm').addEventListener('submit',async(e)=>{e.preventDefault();const form=e.currentTarget;if(!form.reportValidity())return;const id=$('recurringId').value.trim();const payload={id,name:$('recurringName').value,category:$('recurringCategory').value,subcategory:$('recurringSubcategory').value,description:$('recurringDescription').value,amount:Number(digitsOnly($('recurringAmount').value)||0),splitType:$('recurringSplitType').value};const btn=$('recurringSaveBtn');btn.disabled=true;try{const result=await apiJson('/api/recurring',{method:id?'PUT':'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});if(result.verified!==true)throw new Error('D1 저장 검증 응답을 받지 못했습니다.');const reloaded=await getRecurring();state.recurring=Array.isArray(reloaded.templates)?reloaded.templates:[];if(!id&&result.template&&!state.recurring.some(x=>x.id===result.template.id))throw new Error('저장 직후 D1 재조회에서 항목이 보이지 않습니다.');renderRecurring();showToast(id?'반복지출을 수정했습니다.':'반복지출을 D1에 저장했습니다.');resetRecurringForm();}catch(err){showToast(err.message||'반복지출 저장 실패','error');}finally{btn.disabled=false;}});
$('recurringManageList').addEventListener('click',async(e)=>{const edit=e.target.closest('[data-recurring-edit]'),del=e.target.closest('[data-recurring-delete]');if(edit){const t=state.recurring.find(x=>x.id===edit.dataset.recurringEdit);if(t)fillRecurringForm(t);return;}if(del){const t=state.recurring.find(x=>x.id===del.dataset.recurringDelete);if(!t)return;if(!confirm(`‘${t.name}’ 반복지출을 삭제할까요?`))return;try{const result=await apiJson('/api/recurring',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({id:t.id})});state.recurring=Array.isArray(result.templates)?result.templates:state.recurring.filter(x=>x.id!==t.id);renderRecurring();showToast('반복지출을 삭제했습니다.');}catch(err){showToast(err.message||'반복지출 삭제 실패','error');}}});
$('recurringQuickList').addEventListener('click',async(e)=>{const btn=e.target.closest('[data-recurring-add]');if(!btn)return;if(isClosed()){showToast('정산 마감된 달입니다.','error');return;}const t=state.recurring.find(x=>x.id===btn.dataset.recurringAdd);if(!t)return;btn.disabled=true;try{const payload={month:state.month,category:t.category,subcategory:t.subcategory,description:t.description,amount:t.amount,splitType:t.splitType};const body=await requestExpense('POST',payload);const saved={...payload,sheetRow:body.sheetRow};optimisticAddExpense(saved);showToast(`‘${t.name}’을 ${Number(state.month.slice(5))}월 지출에 추가했습니다.`);refreshDashboardQuiet();}catch(err){showToast(err.message||'반복지출 추가 실패','error');}finally{btn.disabled=isClosed();}});

$('saveMonthMemoBtn').addEventListener('click',async()=>{const btn=$('saveMonthMemoBtn');btn.disabled=true;try{const body=await saveMonthMeta({memo:$('monthMemo').value});state.data.meta=body.meta;renderMonthMeta();showToast('월 메모를 저장했습니다.');}catch(err){showToast(err.message||'메모 저장 실패','error');}finally{btn.disabled=false;}});
$('toggleMonthCloseBtn').addEventListener('click',async()=>{const closing=!isClosed();if(closing&&!confirm(`${formatMonth(state.month)}을 정산 마감할까요?\n마감 후에는 지출·대출을 수정할 수 없습니다.`))return;const btn=$('toggleMonthCloseBtn');btn.disabled=true;try{const body=await saveMonthMeta({memo:$('monthMemo').value,closed:closing});state.data.meta=body.meta;render();showToast(closing?`${formatMonth(state.month)} 정산을 마감했습니다.`:`${formatMonth(state.month)} 마감을 해제했습니다.`);}catch(err){showToast(err.message||'마감 상태 변경 실패','error');}finally{btn.disabled=false;}});

$('closeLoanDialog').addEventListener('click',()=>$('loanDialog').close()); $('loanTrendBtn').addEventListener('click',openLoanTrendDialog); $('closeLoanTrendDialog').addEventListener('click',()=>$('loanTrendDialog').close()); document.querySelectorAll('[data-loan-edit]').forEach(btn=>btn.addEventListener('click',openLoanDialog));
$('loanForm').addEventListener('submit',async(e)=>{e.preventDefault();if(isClosed()){showToast('정산 마감된 달입니다.','error');return;}const form=e.currentTarget;if(!form.reportValidity())return;const saveBtn=$('loanSaveBtn'),principal=Number(digitsOnly($('loanPrincipalInput').value)||0),interest=Number(digitsOnly($('loanInterestInput').value)||0),balanceText=digitsOnly($('loanBalanceInput').value),balance=balanceText===''?null:Number(balanceText),rateText=String($('loanRateInput').value||'').trim(),ratePercent=rateText===''?null:parseRateInput(rateText);saveBtn.disabled=true;saveBtn.textContent='저장 중…';try{await saveLoan({month:state.month,principal,interest,rate:ratePercent===null?null:ratePercent/100,balance});$('loanDialog').close();showToast('대출내역을 Google Sheet에 반영했습니다.');await load();}catch(err){showToast(err.message||'대출내역 저장에 실패했습니다.','error');}finally{saveBtn.disabled=false;saveBtn.textContent='Google Sheet에 저장';}});
$('loanResetBtn').addEventListener('click',async()=>{if(isClosed()){showToast('정산 마감된 달입니다.','error');return;}if(!confirm(`${formatMonth(state.month)} 대출 입력값을 초기화할까요?\n상환 원금과 이자는 0원으로, 잔액은 전월 잔액으로 되돌립니다.`))return;const btn=$('loanResetBtn');btn.disabled=true;btn.textContent='초기화 중…';try{await resetLoan(state.month);$('loanDialog').close();showToast(`${formatMonth(state.month)} 대출내역을 초기화했습니다.`);await load();}catch(err){showToast(err.message||'대출내역 초기화에 실패했습니다.','error');}finally{btn.disabled=false;btn.textContent='이 달 대출내역 초기화';}});

(async()=>{ await syncSettlementOnce(); await Promise.all([load(),loadRecurring()]); })();
