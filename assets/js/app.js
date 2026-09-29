const today = new Date();
const initialMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
const STORAGE_MONTH_KEY = 'kongmoney.selectedMonth';
const STORAGE_PENDING_KEY = 'kongmoney.pendingExpenses';
const SETTLEMENT_SYNC_VERSION = '2026-clean-year-v3';
const savedMonth = (() => { try { return localStorage.getItem(STORAGE_MONTH_KEY) || ''; } catch { return ''; } })();
const state = { month: /^2026-(0[1-9]|1[0-2])$/.test(savedMonth) ? savedMonth : (/^2026-/.test(initialMonth) ? initialMonth : '2026-01'), filter: '전체', data: null, loading: false };
const won = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });
const $ = (id) => document.getElementById(id);
const money = (n) => `${won.format(Number(n || 0))}원`;

function rememberMonth(ym){ try { localStorage.setItem(STORAGE_MONTH_KEY, ym); } catch {} }

async function syncSettlementOnce(){
  const key=`kongmoney.settlementSync.${SETTLEMENT_SYNC_VERSION}`;
  try {
    if(sessionStorage.getItem(key)==='done') return false;
    const res=await fetch('/api/settlement-sync',{method:'POST',headers:{accept:'application/json'}});
    const body=await res.json().catch(()=>({}));
    if(!res.ok || body.ok===false) throw new Error(body.error || `월정산 동기화 실패 (${res.status})`);
    sessionStorage.setItem(key,'done');
    return true;
  } catch(err) {
    console.warn('monthly settlement sync skipped:', err);
    return false;
  }
}
function expenseKey(row){
  return [row?.month,row?.category,row?.subcategory,row?.description,row?.amount,row?.splitType].map(v=>String(v ?? '')).join('|');
}
function getPendingExpenses(){
  try { const raw = localStorage.getItem(STORAGE_PENDING_KEY); const arr = raw ? JSON.parse(raw) : []; return Array.isArray(arr) ? arr : []; } catch { return []; }
}
function setPendingExpenses(list){ try { localStorage.setItem(STORAGE_PENDING_KEY, JSON.stringify(list)); } catch {} }
function pushPendingExpense(row){
  const list=getPendingExpenses();
  const key=expenseKey(row);
  if(!list.some(item => expenseKey(item)===key)) list.push(row);
  setPendingExpenses(list);
}
function removePendingExpense(row){
  const key=expenseKey(row);
  setPendingExpenses(getPendingExpenses().filter(item => expenseKey(item)!==key));
}
function mergePendingExpenses(data, month){
  if(!data || !Array.isArray(data.expenses)) return data;
  const pending=getPendingExpenses();
  if(!pending.length) return data;
  const liveKeys = new Set(data.expenses.map(expenseKey));
  const merged = [...data.expenses];
  const remaining = [];
  for(const item of pending){
    if(item.month !== month){
      remaining.push(item);
      continue;
    }
    const key=expenseKey(item);
    if(!liveKeys.has(key)) {
      merged.push(item);
      remaining.push(item);
    }
  }
  data.expenses = merged;
  // Remove items that are now visible in live data for their month.
  const allLiveKeys = new Set((data.expenses||[]).map(expenseKey));
  const finalRemaining = pending.filter(item => item.month !== month || !allLiveKeys.has(expenseKey(item)) || !liveKeys.has(expenseKey(item)));
  // If an item already existed in liveKeys, it means the sheet returned it; drop from pending.
  setPendingExpenses(finalRemaining.filter(item => !(item.month===month && liveKeys.has(expenseKey(item)))));
  return data;
}

function formatMonth(ym){ const [y,m]=ym.split('-'); return `${y}년 ${Number(m)}월`; }
function shiftMonth(ym, delta){ const [y,m]=ym.split('-').map(Number); const d=new Date(y,m-1+delta,1); const next=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; if(next<'2026-01') return '2026-01'; if(next>'2026-12') return '2026-12'; return next; }
function emptyDashboard(month){ return {month,summary:{living:0,loan:0,total:0,managerFinal:0,memberAFinal:0,memberBFinal:0,carryIn:0,autoTransfer:0,carryOut:0},expenses:[],loan:{principal:0,interest:0,total:0,balance:0,rate:0}}; }
function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function digitsOnly(value){ return String(value ?? '').replace(/[^0-9]/g,''); }
function bindDigitsOnly(input){
  if(!input) return;
  input.addEventListener('input',()=>{ input.value=digitsOnly(input.value); });
  input.addEventListener('paste',()=>queueMicrotask(()=>{ input.value=digitsOnly(input.value); }));
}
function parseRateInput(v){
  const x=Number(String(v??'').replace(/[^0-9.]/g,''));
  return Number.isFinite(x) && x >= 0 ? x : 0;
}


function showToast(message, type='ok'){
  const toast=$('toast');
  toast.textContent=message;
  toast.className=`toast show ${type}`;
  clearTimeout(showToast.timer);
  showToast.timer=setTimeout(()=>{toast.className='toast';},2800);
}

function setConnection(ok, text){
  const el=$('connectionStatus');
  el.textContent=text;
  el.classList.toggle('error', !ok);
}

async function getDashboard(month){
  const res = await fetch(`/api/dashboard?month=${encodeURIComponent(month)}`, {headers:{accept:'application/json'},cache:'no-store'});
  const body = await res.json().catch(()=>({}));
  if(!res.ok || body.ok===false) throw new Error(body.error || `데이터 조회 실패 (${res.status})`);
  return body;
}

function splitLabel(v){
  const x=String(v||'').trim();
  const aliases={
    '총무+구성원 A':'SH + JH',
    '총무+구성원 A 부담':'SH + JH',
    '총무 + 구성원 A':'SH + JH',
    '2인 공동':'SH + JH',
    'SH+JH':'SH + JH',
  };
  return aliases[x] || x;
}

function expenseBadge(category){
  if(category === '생활비') return { cls: 'life', icon: '🏠' };
  if(category === '기타/부속') return { cls: 'extra', icon: '🧺' };
  return { cls: 'other', icon: '₩' };
}

function renderDashboardFields(){
  const d=state.data || emptyDashboard(state.month); const s=d.summary || {}; const loan=d.loan || {};
  $('monthLabel').textContent=formatMonth(state.month);
  $('totalExpense').textContent=money(s.total);
  $('expenseBreakdown').textContent=`생활비 ${money(s.living)} · 대출 ${money(s.loan)}`;
  $('managerFinal').textContent=money(s.managerFinal);
  $('memberAFinal').textContent=money(s.memberAFinal);
  $('memberBFinal').textContent=money(s.memberBFinal);
  $('carryIn').textContent=money(s.carryIn);
  $('autoTransfer').textContent=money(s.autoTransfer);
  $('bSettlement').textContent=money(s.memberBFinal);
  $('carryOut').textContent=money(s.carryOut);
  $('carryNote').textContent = s.total > 0
    ? (s.carryOut >= 0 ? `이번 달 정산 후 ${money(s.carryOut)}이 다음 달로 이월됩니다.` : `이번 달 부족분 ${money(Math.abs(s.carryOut))}이 다음 달에 추가 반영됩니다.`)
    : '아직 이 달에 등록된 정산 데이터가 없습니다.';
  $('loanPrincipal').textContent=money(loan.principal);
  $('loanInterest').textContent=money(loan.interest);
  $('loanTotal').textContent=money(loan.total);
  $('loanBalance').textContent=money(loan.balance);
}

function render(){
  renderDashboardFields();
  renderExpenses();
}

function renderExpenses(){
  const list=$('expenseList'); list.innerHTML='';
  const rows=(state.data?.expenses||[]).filter(x=>state.filter==='전체'||x.category===state.filter);
  $('emptyExpenses').hidden=rows.length>0;
  for(const row of rows){
    const badge = expenseBadge(row.category);
    const el=document.createElement('div');
    el.className='expense-row';
    el.innerHTML=`
      <div class="expense-main">
        <span class="expense-badge ${badge.cls}">${badge.icon}</span>
        <div class="expense-body">
          <div class="expense-title">${escapeHtml(row.subcategory||row.category)}</div>
          <div class="expense-meta">${escapeHtml(row.description||'-')}</div>
          <div class="expense-tags">
            <span class="expense-tag">${escapeHtml(row.category)}</span>
            <span class="expense-tag">${escapeHtml(splitLabel(row.splitType)||'-')}</span>
          </div>
        </div>
      </div>
      <div class="expense-side">
        <div class="expense-amount">${money(row.amount)}<span class="expense-split">${escapeHtml(row.month || state.month)}</span></div>
        ${row.sheetRow ? `<button class="expense-delete-btn" type="button" data-expense-delete="${Number(row.sheetRow)}" aria-label="지출 삭제">삭제</button>` : ''}
      </div>`;
    list.append(el);
  }
}


async function getLoanTrend(){
  const res=await fetch('/api/loan-trend',{headers:{accept:'application/json'},cache:'no-store'});
  const body=await res.json().catch(()=>({}));
  if(!res.ok || body.ok===false) throw new Error(body.error || `대출 변동추이 조회 실패 (${res.status})`);
  return body;
}

function renderLoanTrendChart(rows){
  const host=$('loanTrendChart');
  const data=(rows||[]).filter(r=>r && r.month);
  if(!data.length){ host.innerHTML='<p class="trend-empty">대출 데이터가 없습니다.</p>'; return; }
  const W=760,H=280, pad={l:54,r:22,t:22,b:42};
  const vals=data.map(r=>Number(r.balance||0));
  let min=Math.min(...vals), max=Math.max(...vals);
  if(max===min){ max+=1; min=Math.max(0,min-1); }
  const spread=max-min;
  min=Math.max(0,min-spread*.18); max=max+spread*.12;
  const x=i=>pad.l+(W-pad.l-pad.r)*(data.length===1?0:i/(data.length-1));
  const y=v=>pad.t+(H-pad.t-pad.b)*(1-(v-min)/(max-min));
  const points=data.map((r,i)=>`${x(i).toFixed(1)},${y(Number(r.balance||0)).toFixed(1)}`).join(' ');
  const area=`${pad.l},${H-pad.b} ${points} ${x(data.length-1)},${H-pad.b}`;
  const grid=[0,.25,.5,.75,1].map(t=>{
    const yy=pad.t+(H-pad.t-pad.b)*t;
    const val=max-(max-min)*t;
    return `<line x1="${pad.l}" y1="${yy}" x2="${W-pad.r}" y2="${yy}" class="trend-grid"/><text x="${pad.l-8}" y="${yy+4}" text-anchor="end" class="trend-axis-text">${Math.round(val/10000).toLocaleString()}만</text>`;
  }).join('');
  const ticks=data.map((r,i)=>`<text x="${x(i)}" y="${H-16}" text-anchor="middle" class="trend-axis-text">${Number(r.month.slice(5))}월</text>`).join('');
  const dots=data.map((r,i)=>`<circle cx="${x(i)}" cy="${y(Number(r.balance||0))}" r="4.2" class="trend-dot"><title>${formatMonth(r.month)} · ${money(r.balance)}</title></circle>`).join('');
  host.innerHTML=`<svg class="trend-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="2026년 대출 잔액 라인 차트"><defs><linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#b9e4d2" stop-opacity=".58"/><stop offset="100%" stop-color="#b9e4d2" stop-opacity=".06"/></linearGradient></defs>${grid}<polygon points="${area}" fill="url(#trendFill)"/><polyline points="${points}" class="trend-line"/>${dots}${ticks}</svg>`;
}

function renderLoanTrendTable(rows){
  const tbody=$('loanTrendTableBody');
  tbody.innerHTML=(rows||[]).map(r=>`<tr><td>${Number(r.month.slice(5))}월</td><td>${money(r.principal)}</td><td>${money(r.interest)}</td><td>${(Number(r.rate||0)*100).toFixed(2)}%</td><td>${money(r.balance)}</td></tr>`).join('');
}

async function openLoanTrendDialog(){
  const dialog=$('loanTrendDialog');
  dialog.showModal();
  $('loanTrendChart').innerHTML='<p class="trend-empty">불러오는 중…</p>';
  try{
    const data=await getLoanTrend();
    $('trendStartBalance').textContent=money(data.summary?.startBalance);
    $('trendCurrentBalance').textContent=money(data.summary?.currentBalance);
    $('trendPrincipalPaid').textContent=money(data.summary?.cumulativePrincipal);
    renderLoanTrendChart(data.rows);
    renderLoanTrendTable(data.rows);
  }catch(err){
    $('loanTrendChart').innerHTML=`<p class="trend-empty error">${escapeHtml(err.message||'대출 변동추이를 불러오지 못했습니다.')}</p>`;
  }
}

async function saveLoan(payload){
  const res=await fetch('/api/loan',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  const body=await res.json().catch(()=>({}));
  if(!res.ok || body.ok===false) throw new Error(body.error || `대출내역 저장 실패 (${res.status})`);
  return body;
}

async function resetLoan(month){
  const res=await fetch('/api/loan',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({month})});
  const body=await res.json().catch(()=>({}));
  if(!res.ok || body.ok===false) throw new Error(body.error || `대출내역 초기화 실패 (${res.status})`);
  return body;
}

function updateLoanPreview(){
  const principal=Number(digitsOnly($('loanPrincipalInput')?.value)||0);
  const interest=Number(digitsOnly($('loanInterestInput')?.value)||0);
  $('loanTotalPreview').textContent=money(principal+interest);
}

function openLoanDialog(){
  const loan=state.data?.loan||{};
  $('loanEditMonth').textContent=formatMonth(state.month);
  $('loanPrincipalInput').value=String(Math.round(Number(loan.principal||0)));
  $('loanInterestInput').value=String(Math.round(Number(loan.interest||0)));
  $('loanRateInput').value=loan.rate ? String(Number(loan.rate) <= 1 ? Number(loan.rate)*100 : Number(loan.rate)) : '';
  $('loanBalanceInput').value=String(Math.round(Number(loan.balance||0)));
  updateLoanPreview();
  $('loanDialog').showModal();
}

async function load(){
  if(state.loading) return;
  state.loading=true;
  $('refreshBtn').disabled=true;
  setConnection(true,'불러오는 중…');
  try{
    state.data=mergePendingExpenses(await getDashboard(state.month), state.month);
    rememberMonth(state.month);
    setConnection(true,'Google Sheet 연결됨');
  }catch(err){
    state.data=emptyDashboard(state.month);
    setConnection(false,'Google Sheet 오류');
    showToast(err.message || '데이터를 불러오지 못했습니다.','error');
  }finally{
    state.loading=false;
    $('refreshBtn').disabled=false;
    render();
  }
}

$('prevMonth').addEventListener('click',()=>{state.month=shiftMonth(state.month,-1); rememberMonth(state.month); load();});
$('nextMonth').addEventListener('click',()=>{state.month=shiftMonth(state.month,1); rememberMonth(state.month); load();});
$('refreshBtn').addEventListener('click',load);
document.querySelectorAll('.chip').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('.chip').forEach(x=>x.classList.remove('active'));
  btn.classList.add('active');
  state.filter=btn.dataset.filter;
  renderExpenses();
}));

$('expenseList').addEventListener('click', async (e)=>{
  const btn=e.target.closest('[data-expense-delete]');
  if(!btn) return;
  const sheetRow=Number(btn.dataset.expenseDelete);
  const row=(state.data?.expenses||[]).find(item=>Number(item.sheetRow)===sheetRow);
  if(!row) return;
  if(!confirm(`‘${row.subcategory || row.category}’ ${money(row.amount)} 지출을 삭제할까요?`)) return;
  btn.disabled=true;
  try{
    const res=await fetch('/api/expenses',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({sheetRow})});
    const body=await res.json().catch(()=>({}));
    if(!res.ok || body.ok===false) throw new Error(body.error || `삭제 실패 (${res.status})`);
    removePendingExpense(row);
    if(Array.isArray(state.data?.expenses)) {
      state.data.expenses = state.data.expenses.filter(item => Number(item.sheetRow) !== sheetRow);
    }
    renderExpenses();
    showToast('지출을 삭제했고 Google Sheet에도 반영했습니다.');
    // Totals/settlement refresh quietly after the row disappears immediately.
    getDashboard(state.month).then((fresh)=>{
      state.data = mergePendingExpenses(fresh, state.month);
      render();
    }).catch(()=>{});
  }catch(err){
    btn.disabled=false;
    showToast(err.message || '지출 삭제에 실패했습니다.','error');
  }
});

const dlg=$('expenseDialog');
const loanDlg=$('loanDialog');
const trendDlg=$('loanTrendDialog');

function enableBackdropClose(dialog){
  if(!dialog) return;
  dialog.addEventListener('click',(e)=>{
    if(e.target === dialog) dialog.close();
  });
}
document.querySelectorAll('dialog.dialog').forEach(enableBackdropClose);

bindDigitsOnly($('expenseAmount'));
document.querySelectorAll('.numeric-only').forEach(bindDigitsOnly);
$('loanPrincipalInput').addEventListener('input',updateLoanPreview);
$('loanInterestInput').addEventListener('input',updateLoanPreview);

$('addExpenseBtn').addEventListener('click',()=>{ $('expenseMonth').value=state.month; dlg.showModal(); });
$('closeExpenseDialog').addEventListener('click',()=>dlg.close());
$('closeLoanDialog').addEventListener('click',()=>loanDlg.close());
$('loanTrendBtn').addEventListener('click',openLoanTrendDialog);
$('closeLoanTrendDialog').addEventListener('click',()=>trendDlg.close());
document.querySelectorAll('[data-loan-edit]').forEach(btn=>btn.addEventListener('click',openLoanDialog));

$('expenseForm').addEventListener('submit',async(e)=>{
  e.preventDefault();
  const form=e.currentTarget;
  if(!form.reportValidity()) return;
  const saveBtn=form.querySelector('button[type="submit"][value="default"]');
  const fd=new FormData(form); const row=Object.fromEntries(fd.entries());
  row.amount=Number(digitsOnly(row.amount)||0);
  if(row.amount <= 0){ showToast('금액을 1원 이상 입력해주세요.','error'); return; }
  saveBtn.disabled=true; saveBtn.textContent='저장 중…';
  try{
    const res=await fetch('/api/expenses',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(row)});
    const body=await res.json().catch(()=>({}));
    if(!res.ok || body.ok===false) throw new Error(body.error || `저장 실패 (${res.status})`);
    dlg.close();
    form.reset();
    showToast(`${formatMonth(row.month)} 지출을 Google Sheet에 저장했습니다.`);

    // 전체 화면을 다시 불러오지 않고, 방금 저장한 내역만 즉시 목록에 반영합니다.
    state.month=row.month;
    rememberMonth(state.month);
    if(!state.data || state.data.month !== row.month) state.data=emptyDashboard(row.month);
    if(!Array.isArray(state.data.expenses)) state.data.expenses=[];
    const optimisticExpense = {
      month: row.month,
      category: row.category,
      subcategory: row.subcategory,
      description: row.description || '',
      amount: row.amount,
      splitType: row.splitType,
      sheetRow: body.sheetRow
    };
    state.data.expenses.push(optimisticExpense);
    pushPendingExpense(optimisticExpense);
    $('monthLabel').textContent=formatMonth(state.month);
    renderExpenses();

    // 합계/정산값은 뒤에서 조용히 다시 계산해 갱신하고,
    // 시트 조회 결과에 방금 저장한 항목이 아직 안 잡히더라도 목록에서 사라지지 않게 병합합니다.
    getDashboard(state.month).then((fresh)=>{
      state.data = mergePendingExpenses(fresh, state.month);
      render();
    }).catch(()=>{});
  }catch(err){
    showToast(err.message || '지출 저장에 실패했습니다.','error');
  }finally{
    saveBtn.disabled=false; saveBtn.textContent='저장';
  }
});

$('loanForm').addEventListener('submit',async(e)=>{
  e.preventDefault();
  const form=e.currentTarget;
  if(!form.reportValidity()) return;
  const saveBtn=$('loanSaveBtn');
  const principal=Number(digitsOnly($('loanPrincipalInput').value)||0);
  const interest=Number(digitsOnly($('loanInterestInput').value)||0);
  const balanceText=digitsOnly($('loanBalanceInput').value);
  const balance=balanceText === '' ? null : Number(balanceText);
  const rateText=String($('loanRateInput').value||'').trim();
  const ratePercent=rateText === '' ? null : parseRateInput(rateText);
  saveBtn.disabled=true; saveBtn.textContent='저장 중…';
  try{
    await saveLoan({month:state.month,principal,interest,rate:ratePercent===null?null:ratePercent/100,balance});
    loanDlg.close();
    showToast('대출내역을 Google Sheet에 반영했습니다.');
    rememberMonth(state.month);
    await load();
  }catch(err){
    showToast(err.message || '대출내역 저장에 실패했습니다.','error');
  }finally{
    saveBtn.disabled=false; saveBtn.textContent='Google Sheet에 저장';
  }
});

$('loanResetBtn').addEventListener('click', async()=>{
  if(!confirm(`${formatMonth(state.month)} 대출 입력값을 초기화할까요?\n상환 원금과 이자는 0원으로, 잔액은 전월 잔액으로 되돌립니다.`)) return;
  const btn=$('loanResetBtn');
  btn.disabled=true; btn.textContent='초기화 중…';
  try{
    await resetLoan(state.month);
    loanDlg.close();
    showToast(`${formatMonth(state.month)} 대출내역을 초기화했습니다.`);
    await load();
  }catch(err){
    showToast(err.message || '대출내역 초기화에 실패했습니다.','error');
  }finally{
    btn.disabled=false; btn.textContent='이 달 대출내역 초기화';
  }
});

(async()=>{
  const synced=await syncSettlementOnce();
  await load();
})();
