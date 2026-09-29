const today = new Date();
const initialMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
const state = { month: initialMonth, filter: '전체', data: null, loading: false };
const won = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });
const $ = (id) => document.getElementById(id);
const money = (n) => `${won.format(Number(n || 0))}원`;

function formatMonth(ym){ const [y,m]=ym.split('-'); return `${y}년 ${Number(m)}월`; }
function shiftMonth(ym, delta){ const [y,m]=ym.split('-').map(Number); const d=new Date(y,m-1+delta,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
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

function render(){
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
      <div class="expense-amount">${money(row.amount)}<span class="expense-split">${escapeHtml(row.month || state.month)}</span></div>`;
    list.append(el);
  }
}

async function saveLoan(payload){
  const res=await fetch('/api/loan',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  const body=await res.json().catch(()=>({}));
  if(!res.ok || body.ok===false) throw new Error(body.error || `대출내역 저장 실패 (${res.status})`);
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
document.querySelectorAll('.chip').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('.chip').forEach(x=>x.classList.remove('active'));
  btn.classList.add('active');
  state.filter=btn.dataset.filter;
  renderExpenses();
}));

const dlg=$('expenseDialog');
const loanDlg=$('loanDialog');

bindDigitsOnly($('expenseAmount'));
document.querySelectorAll('.numeric-only').forEach(bindDigitsOnly);
$('loanPrincipalInput').addEventListener('input',updateLoanPreview);
$('loanInterestInput').addEventListener('input',updateLoanPreview);

$('addExpenseBtn').addEventListener('click',()=>{ $('expenseMonth').value=state.month; dlg.showModal(); });
$('closeExpenseDialog').addEventListener('click',()=>dlg.close());
$('closeLoanDialog').addEventListener('click',()=>loanDlg.close());
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
    showToast('Google Sheet에 지출을 저장했습니다.');
    state.month=row.month;
    await load();
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
  const balance=Number(digitsOnly($('loanBalanceInput').value)||0);
  const ratePercent=parseRateInput($('loanRateInput').value);
  saveBtn.disabled=true; saveBtn.textContent='저장 중…';
  try{
    await saveLoan({month:state.month,principal,interest,rate:ratePercent/100,balance});
    loanDlg.close();
    showToast('대출내역을 Google Sheet에 반영했습니다.');
    await load();
  }catch(err){
    showToast(err.message || '대출내역 저장에 실패했습니다.','error');
  }finally{
    saveBtn.disabled=false; saveBtn.textContent='Google Sheet에 저장';
  }
});

load();
