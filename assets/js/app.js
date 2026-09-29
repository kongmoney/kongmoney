const state = { month: '2026-09', filter: '전체', data: null, source: 'mock' };
const won = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });
const $ = (id) => document.getElementById(id);
const money = (n) => `${won.format(Number(n || 0))}원`;

function formatMonth(ym){ const [y,m]=ym.split('-'); return `${y}년 ${Number(m)}월`; }
function shiftMonth(ym, delta){ const [y,m]=ym.split('-').map(Number); const d=new Date(y,m-1+delta,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }

async function getDashboard(month){
  try{
    const res = await fetch(`/api/dashboard?month=${encodeURIComponent(month)}`, {headers:{accept:'application/json'}});
    if(!res.ok) throw new Error('api unavailable');
    state.source='api';
    return await res.json();
  }catch{
    state.source='mock';
    const res=await fetch('/mock/data.json'); const all=await res.json();
    return all[month] || {summary:{living:0,loan:0,total:0,managerFinal:0,memberAFinal:0,memberBFinal:0,carryIn:0,autoTransfer:400000,carryOut:0},expenses:[],loan:{principal:0,interest:0,total:0,balance:0,rate:0}};
  }
}

function render(){
  const d=state.data; const s=d.summary || {}; const loan=d.loan || {};
  $('monthLabel').textContent=formatMonth(state.month);
  $('totalExpense').textContent=money(s.total);
  $('expenseBreakdown').textContent=`생활비 ${money(s.living)} · 대출 ${money(s.loan)}`;
  $('managerFinal').textContent=money(s.managerFinal);
  $('memberAFinal').textContent=money(s.memberAFinal);
  $('memberBFinal').textContent=money(s.memberBFinal);
  $('carryIn').textContent=money(s.carryIn); $('autoTransfer').textContent=money(s.autoTransfer);
  $('bSettlement').textContent=money(s.memberBFinal); $('carryOut').textContent=money(s.carryOut);
  $('carryNote').textContent = s.carryOut >= 0 ? `이번 달 정산 후 ${money(s.carryOut)}이 다음 달로 이월됩니다.` : `이번 달 부족분 ${money(Math.abs(s.carryOut))}이 다음 달에 추가 반영됩니다.`;
  $('loanPrincipal').textContent=money(loan.principal); $('loanInterest').textContent=money(loan.interest);
  $('loanTotal').textContent=money(loan.total); $('loanBalance').textContent=money(loan.balance);
  renderExpenses();
}

function renderExpenses(){
  const list=$('expenseList'); list.innerHTML='';
  const rows=(state.data.expenses||[]).filter(x=>state.filter==='전체'||x.category===state.filter);
  $('emptyExpenses').hidden=rows.length>0;
  for(const row of rows){
    const el=document.createElement('div'); el.className='expense-row';
    el.innerHTML=`<div><div class="expense-title">${escapeHtml(row.subcategory||row.category)}</div><div class="expense-meta">${escapeHtml(row.category)} · ${escapeHtml(row.description||'-')}</div></div><div class="expense-amount">${money(row.amount)}<span class="expense-split">${escapeHtml(row.splitType||'')}</span></div>`;
    list.append(el);
  }
}
function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

async function load(){ state.data=await getDashboard(state.month); render(); }
$('prevMonth').addEventListener('click',()=>{state.month=shiftMonth(state.month,-1);load();});
$('nextMonth').addEventListener('click',()=>{state.month=shiftMonth(state.month,1);load();});
$('refreshBtn').addEventListener('click',load);
document.querySelectorAll('.chip').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.chip').forEach(x=>x.classList.remove('active'));btn.classList.add('active');state.filter=btn.dataset.filter;renderExpenses();}));

const dlg=$('expenseDialog'); $('addExpenseBtn').addEventListener('click',()=>{ $('expenseMonth').value=state.month; dlg.showModal(); });
$('expenseForm').addEventListener('submit',async(e)=>{
  const submitter=e.submitter; if(submitter?.value==='cancel') return;
  e.preventDefault(); const fd=new FormData(e.currentTarget); const row=Object.fromEntries(fd.entries()); row.amount=Number(row.amount||0);
  try{
    const res=await fetch('/api/expenses',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(row)});
    if(!res.ok) throw new Error(); dlg.close(); await load();
  }catch{
    if(row.month===state.month){state.data.expenses.push(row); state.data.summary.living+=row.amount; state.data.summary.total+=row.amount; render();}
    dlg.close();
  }
});

load();
