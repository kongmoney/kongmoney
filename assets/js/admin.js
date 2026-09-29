import { unzipSync } from 'https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js';

const $ = (id) => document.getElementById(id);
let extractedFiles = [];
let deployPoll = null;
let targetCommitSha = '';

function toast(message, type='success'){
  const el=$('toast'); el.textContent=message; el.className=`toast show ${type}`;
  clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.className='toast',3000);
}
function adminKey(){ return sessionStorage.getItem('kongmoney_admin_key') || ''; }
function authHeaders(extra={}){ return {'x-admin-key':adminKey(),...extra}; }
function fmtBytes(n){ if(n<1024)return `${n} B`; if(n<1024**2)return `${(n/1024).toFixed(1)} KB`; return `${(n/1024**2).toFixed(1)} MB`; }
function fmtKst(iso){
  if(!iso) return '-';
  return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'2-digit',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(iso));
}
function bytesToBase64(bytes){
  let binary=''; const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk) binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));
  return btoa(binary);
}
function commonRoot(paths){
  if(!paths.length) return '';
  const first=paths[0].split('/')[0];
  if(!first || paths.some(p=>!p.startsWith(first+'/'))) return '';
  return first+'/';
}
function defaultCommitMessage(){
  const now=new Date();
  const stamp=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now).replace(/\. /g,'-');
  return `chore: kongmoney ZIP deploy ${stamp}`;
}

async function readZip(file){
  if(!file) return;
  $('deployProgress').textContent='ZIP 파일을 확인하는 중…';
  try{
    const raw=new Uint8Array(await file.arrayBuffer());
    const out=unzipSync(raw);
    let names=Object.keys(out).filter(name=>{
      const n=name.replace(/\\/g,'/');
      return !n.endsWith('/') && !n.includes('__MACOSX/') && !n.endsWith('.DS_Store') && !n.startsWith('.git/');
    });
    const root=commonRoot(names);
    extractedFiles=names.map(name=>{
      const path=(root ? name.slice(root.length) : name).replace(/^\/+/, '');
      const bytes=out[name];
      return {path,bytes,size:bytes.length};
    }).filter(f=>f.path && !f.path.startsWith('.git/'));
    const total=extractedFiles.reduce((s,f)=>s+f.size,0);
    $('zipInfo').hidden=false; $('zipName').textContent=file.name; $('zipCount').textContent=`${extractedFiles.length}개`; $('zipSize').textContent=fmtBytes(total);
    $('zipBadge').textContent='업로드 준비 완료'; $('deployBtn').disabled=!extractedFiles.length;
    $('deployProgress').textContent='';
    if(!$('commitMessage').value) $('commitMessage').value=defaultCommitMessage();
  }catch(err){
    extractedFiles=[]; $('deployBtn').disabled=true; $('zipBadge').textContent='ZIP 오류';
    $('deployProgress').textContent=''; toast(`ZIP을 읽지 못했습니다: ${err.message}`,'error');
  }
}

async function getStatus(silent=false){
  if(!adminKey()){ if(!silent) toast('관리자 키를 먼저 적용해주세요.','error'); return null; }
  $('refreshStatus').disabled=true;
  try{
    const res=await fetch('/api/admin/status',{headers:authHeaders({accept:'application/json'}),cache:'no-store'});
    const body=await res.json().catch(()=>({}));
    if(!res.ok||body.ok===false) throw new Error(body.error||`상태 조회 실패 (${res.status})`);
    renderStatus(body); return body;
  }catch(err){
    if(!silent) toast(err.message,'error');
    $('githubState').textContent='조회 실패'; $('githubState').className='status-main failure';
    return null;
  }finally{$('refreshStatus').disabled=false;}
}

function renderStatus(body){
  const gh=body.github||{}; const cf=body.cloudflare;
  $('githubState').textContent=gh.sha?'커밋 완료':'확인 불가'; $('githubState').className=`status-main ${gh.sha?'success':'failure'}`;
  $('githubDetail').innerHTML=gh.sha
    ? `<strong>${gh.shortSha}</strong> · <a href="${gh.url}" target="_blank" rel="noopener">커밋 보기 ↗</a><br><span>${escapeHtml((gh.message||'').split('\n')[0])}</span>`
    : 'GitHub 커밋 정보를 확인할 수 없습니다.';

  if(cf){
    const status=cf.status||'unknown';
    const label=status==='success'?'배포 완료':status==='failure'?'배포 실패':status==='canceled'?'배포 취소':'배포 중';
    const cls=status==='success'?'success':(status==='failure'||status==='canceled')?'failure':'active';
    $('cloudflareState').textContent=label; $('cloudflareState').className=`status-main ${cls}`;
    const match=cf.matchesLatestCommit?'최신 GitHub 커밋과 일치':'Cloudflare 반영 대기/다른 커밋';
    $('cloudflareDetail').innerHTML=`Cloudflare Pages · <a href="${cf.dashboardUrl}" target="_blank" rel="noopener">상세/로그 확인 ↗</a><br>${match}${cf.commitHash?` · ${cf.commitHash.slice(0,7)}`:''}`;
    if(targetCommitSha && cf.commitHash===targetCommitSha && ['success','failure','canceled'].includes(status)){
      clearInterval(deployPoll); deployPoll=null;
      if(status==='success') toast('GitHub 커밋과 Cloudflare Pages 배포가 모두 완료됐습니다.');
    }
  }else{
    $('cloudflareState').textContent='확인 불가'; $('cloudflareState').className='status-main failure';
    $('cloudflareDetail').textContent=body.cloudflareError||'Cloudflare API 설정을 확인해주세요.';
  }
  $('checkedAt').textContent=`확인 ${fmtKst(body.checkedAt)}`;
}

function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

async function deploy(){
  if(!adminKey()) return toast('관리자 키를 먼저 적용해주세요.','error');
  if(!extractedFiles.length) return toast('ZIP 파일을 먼저 선택해주세요.','error');
  const message=$('commitMessage').value.trim();
  if(!message) return toast('커밋 메시지를 입력해주세요.','error');

  const btn=$('deployBtn'); btn.disabled=true; btn.textContent='GitHub 커밋 중…';
  $('deployProgress').textContent=`${extractedFiles.length}개 파일을 GitHub 커밋 데이터로 준비하는 중…`;
  try{
    const files=extractedFiles.map(f=>({path:f.path,size:f.size,contentBase64:bytesToBase64(f.bytes)}));
    $('deployProgress').textContent='GitHub에 파일을 업로드하고 커밋을 생성하는 중…';
    const res=await fetch('/api/admin/deploy',{method:'POST',headers:authHeaders({'content-type':'application/json'}),body:JSON.stringify({message,files})});
    const body=await res.json().catch(()=>({}));
    if(!res.ok||body.ok===false) throw new Error(body.error||`배포 요청 실패 (${res.status})`);
    targetCommitSha=body.commit.sha;
    toast(`GitHub 커밋 완료 · ${body.commit.shortSha}`);
    $('deployProgress').textContent='GitHub 커밋 완료. Cloudflare Pages 자동 배포를 기다리는 중…';
    await getStatus(true);
    clearInterval(deployPoll);
    deployPoll=setInterval(()=>getStatus(true),5000);
  }catch(err){
    toast(err.message||'배포에 실패했습니다.','error');
    $('deployProgress').textContent='배포 실패 · 오류 내용을 확인해주세요.';
  }finally{btn.disabled=false;btn.textContent='GitHub 커밋 후 배포 시작';}
}

$('saveAdminKey').addEventListener('click',()=>{
  const value=$('adminKey').value.trim();
  if(!value){sessionStorage.removeItem('kongmoney_admin_key');return toast('관리자 키를 입력해주세요.','error');}
  sessionStorage.setItem('kongmoney_admin_key',value); toast('관리자 키를 이 탭에 적용했습니다.'); getStatus(true);
});
$('zipInput').addEventListener('change',e=>readZip(e.target.files?.[0]));
$('deployBtn').addEventListener('click',deploy);
$('refreshStatus').addEventListener('click',()=>getStatus(false));

const dz=$('dropZone');
['dragenter','dragover'].forEach(t=>dz.addEventListener(t,e=>{e.preventDefault();dz.classList.add('drag')}));
['dragleave','drop'].forEach(t=>dz.addEventListener(t,e=>{e.preventDefault();dz.classList.remove('drag')}));
dz.addEventListener('drop',e=>{const file=[...(e.dataTransfer?.files||[])].find(f=>f.name.toLowerCase().endsWith('.zip'));if(file)readZip(file);else toast('ZIP 파일만 업로드할 수 있습니다.','error')});

if(adminKey()) getStatus(true);
