const today = new Date();
const initialMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
const state = { month: initialMonth, filter: '전체', data: null, loading: false };
const won = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });
const $ = (id) => document.getElementById(id);
const money = (n) => `${won.format(Number(n || 0))}원`;

function formatMonth(ym){ const [y,m]=ym.split('-'); return `${y}년 ${Number(m)}월`; }
function shiftMonth(ym, delta){ const [y,m]=ym.split('-').map(Number); const d=new Date(y,m-1+delta,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function emptyDashboard(month){ return {month,summary:{living:0,loan:0,total:0,managerFinal:0,memberAFinal:0,memberBFinal:0,carryIn:0,autoTransfer:0,carryOut:0},expenses:[],loan:{principal:0,interest:0,total:0,balance:0,rate:0}}; }

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

function render(){
  const d=state.data || emptyDashboard(state.month); const s=d.summary || {}; const loan=d.loan || {};
  $('monthLabel').textContent=formatMonth(state.month);
  $('totalExpense').textContent=money(s.total);
  $('expenseBreakdown').textContent=`생활비 ${money(s.living)} · 대출 ${money(s.loan)}`;
  $('managerFinal').textContent=money(s.managerFinal);
  $('memberAFinal').textContent=money(s.memberAFinal);
  $('memberBFinal').textContent=money(s.memberBFinal);
  $('carryIn').textContent=money(s.carryIn); $('autoTransfer').textContent=money(s.autoTransfer);
  $('bSettlement').textContent=money(s.memberBFinal); $('carryOut').textContent=money(s.carryOut);
  $('carryNote').textContent = s.total > 0
    ? (s.carryOut >= 0 ? `이번 달 정산 후 ${money(s.carryOut)}이 다음 달로 이월됩니다.` : `이번 달 부족분 ${money(Math.abs(s.carryOut))}이 다음 달에 추가 반영됩니다.`)
    : '아직 이 달에 등록된 정산 데이터가 없습니다.';
  $('loanPrincipal').textContent=money(loan.principal); $('loanInterest').textContent=money(loan.interest);
  $('loanTotal').textContent=money(loan.total); $('loanBalance').textContent=money(loan.balance);
  renderExpenses();
}

function renderExpenses(){
  const list=$('expenseList'); list.innerHTML='';
  const rows=(state.data?.expenses||[]).filter(x=>state.filter==='전체'||x.category===state.filter);
  $('emptyExpenses').hidden=rows.length>0;
  for(const row of rows){
    const el=document.createElement('div'); el.className='expense-row';
    el.innerHTML=`<div><div class="expense-title">${escapeHtml(row.subcategory||row.category)}</div><div class="expense-meta">${escapeHtml(row.category)} · ${escapeHtml(row.description||'-')}</div></div><div class="expense-amount">${money(row.amount)}<span class="expense-split">${escapeHtml(row.splitType||'')}</span></div>`;
    list.append(el);
  }
}
function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

async function load(){
  if(state.loading) return;
  state.loading=true;
  $('refreshBtn').disabled=true;
  setConnection(true,'불러오는 중…');
  try{
    state.data=await getDashboard(state.month);
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

$('prevMonth').addEventListener('click',()=>{state.month=shiftMonth(state.month,-1);load();});
$('nextMonth').addEventListener('click',()=>{state.month=shiftMonth(state.month,1);load();});
$('refreshBtn').addEventListener('click',load);
document.querySelectorAll('.chip').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.chip').forEach(x=>x.classList.remove('active'));btn.classList.add('active');state.filter=btn.dataset.filter;renderExpenses();}));

const dlg=$('expenseDialog');
$('addExpenseBtn').addEventListener('click',()=>{ $('expenseMonth').value=state.month; dlg.showModal(); });
$('expenseForm').addEventListener('submit',async(e)=>{
  const submitter=e.submitter; if(submitter?.value==='cancel') return;
  e.preventDefault();
  const form=e.currentTarget;
  const saveBtn=form.querySelector('button[type="submit"][value="default"]');
  const fd=new FormData(form); const row=Object.fromEntries(fd.entries()); row.amount=Number(row.amount||0);
  saveBtn.disabled=true; saveBtn.textContent='저장 중…';
  try{
    const res=await fetch('/api/expenses',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(row)});
    const body=await res.json().catch(()=>({}));
    if(!res.ok || body.ok===false) throw new Error(body.error || `저장 실패 (${res.status})`);
    dlg.close();
    form.reset();
    showToast('Google Sheet에 지출을 저장했습니다.');
    state.month=row.month;
    await load();
  }catch(err){
    showToast(err.message || '지출 저장에 실패했습니다.','error');
  }finally{
    saveBtn.disabled=false; saveBtn.textContent='저장';
  }
});

load();
