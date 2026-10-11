'use strict';
const KEY='peptideTracker.v1';
const SITES=['L Abdomen','R Abdomen','L Thigh','R Thigh','L Delt','R Delt','L Glute','R Glute'];
const COLORS=['#8FD3FF','#FFD166','#ffffff','#7cc4ff','#9af0b8','#ffb3b3','#c9b6ff','#4fb0ff'];
const DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
let S=load(), tab='wind', calMonth=new Date(), charts=[];
const $=s=>document.querySelector(s), uid=()=>Math.random().toString(36).slice(2,10);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ymd=d=>{d=new Date(d);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const parseD=s=>{const[a,b,c]=s.split('-').map(Number);return new Date(a,b-1,c)};
const dayDiff=(a,b)=>Math.round((parseD(ymd(b))-parseD(ymd(a)))/864e5);
const fmt=(n,d=2)=>(+n).toFixed(d).replace(/\.?0+$/,'');
function load(){try{const s=JSON.parse(localStorage.getItem(KEY));if(s&&s.peptides)return s}catch(e){}return{peptides:[],protocols:[],logs:[],settings:{}}}
function save(){localStorage.setItem(KEY,JSON.stringify(S))}
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('on'),1800)}
const pep=id=>S.peptides.find(p=>p.id===id);
const color=id=>COLORS[Math.max(0,S.peptides.findIndex(p=>p.id===id))%COLORS.length];

// ---- calculations
function conc(p){return p.bacMl>0?p.vialMg*1000/p.bacMl:0} // mcg per mL
function units(p,mcg){const c=conc(p);return c?mcg/c*100:0} // U-100: 100 units = 1 mL
function expiry(p){if(!p.reconDate)return null;const d=parseD(p.reconDate);d.setDate(d.getDate()+(+p.expiryDays||28));return d}
function invStatus(p){const out=[];const e=expiry(p);
 if(e){const left=dayDiff(new Date(),e);if(left<0)out.push(['bad','Vial expired']);else if(left<=5)out.push(['warn',`Expires in ${left}d`]);}
 const totalMg=(+p.remainingMg||0)+(+p.vials||0)*p.vialMg;
 const daily=avgDailyMcg(p.id);const daysLeft=daily?totalMg*1000/daily:Infinity;
 if((+p.vials||0)<=(+p.reorderAt||0)&&daysLeft<30||totalMg<=0)out.push(['bad','Reorder']);
 else if(daysLeft<21)out.push(['warn','Low supply']);
 return{out,totalMg,daysLeft}}
function avgDailyMcg(pid){const since=Date.now()-28*864e5;const l=S.logs.filter(x=>x.peptideId===pid&&x.ts>=since);
 if(l.length)return l.reduce((a,x)=>a+ +x.doseMcg,0)/28;
 return S.protocols.filter(r=>r.peptideId===pid&&r.active!==false).reduce((a,r)=>a+r.doseMcg*perWeek(r)/7,0)}
function perWeek(r){const base={daily:7,xweek:+r.timesPerWeek||1,weekdays:(r.weekdays||[]).length,everyN:7/(+r.everyN||1)}[r.freq]||0;
 const on=+r.cycleOn||0,off=+r.cycleOff||0;return on&&off?base*on/(on+off):base}
function inCycle(r,d){const on=+r.cycleOn||0,off=+r.cycleOff||0;if(!on||!off)return true;const w=Math.floor(dayDiff(parseD(r.start),d)/7);return w%(on+off)<on}
function logsOn(pid,d){const k=ymd(d);return S.logs.filter(l=>l.peptideId===pid&&ymd(l.ts)===k)}
function weekLogs(r,d){const s=new Date(parseD(ymd(d)));s.setDate(s.getDate()-s.getDay());return S.logs.filter(l=>l.protocolId===r.id&&l.ts>=+s&&l.ts<+s+7*864e5).length}
function isDue(r,d){if(r.active===false)return false;const k=ymd(d);if(r.start&&k<r.start)return false;if(r.end&&k>r.end)return false;if(!inCycle(r,d))return false;
 switch(r.freq){case'daily':return true;case'weekdays':return(r.weekdays||[]).includes(d.getDay());
  case'everyN':return dayDiff(parseD(r.start||k),d)%(+r.everyN||1)===0;case'xweek':return true}return false}
function freqText(r){let t={daily:'Daily',xweek:`${r.timesPerWeek}×/week`,weekdays:(r.weekdays||[]).map(i=>DOW[i]).join(', ')||'No days',everyN:`Every ${r.everyN} days`}[r.freq];
 if(+r.cycleOn&&+r.cycleOff)t+=` · ${r.cycleOn}w on / ${r.cycleOff}w off`;return t}
function suggestSite(){const last={};SITES.forEach(s=>last[s]=0);S.logs.forEach(l=>{if(l.site in last)last[l.site]=Math.max(last[l.site],l.ts)});return SITES.slice().sort((a,b)=>last[a]-last[b])[0]}
function applyInventory(pid,mcg,sign){const p=pep(pid);if(!p)return;let mg=(+p.remainingMg||0)-sign*mcg/1000;
 while(mg<0&&sign>0&&(+p.vials||0)>0){p.vials--;mg+=+p.vialMg;p.reconDate=ymd(new Date());toast('Opened new vial of '+p.name)}
 if(sign<0&&mg>p.vialMg){/* restoring beyond one vial */}
 p.remainingMg=Math.max(0,+mg.toFixed(4))}

// ---- rendering
function render(){charts.forEach(c=>c.destroy());charts=[];
 document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===tab));
 const W=tab==='wind',td=document.getElementById('tide');document.documentElement.classList.toggle('wind',W);if(td){const was=td.style.display==='block';td.style.display=W?'block':'none';if(W&&!was&&window.tideShow)tideShow()}if(W)return;
 $('#hdrDate').textContent=new Date().toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
 $('#view').innerHTML=({today,peptides,reference,protocols,history:historyView,inventory,data,calc:calcView,settings,suggested,recon})[tab]()+'<p class="disc">⚠️ For personal record-keeping only. Not medical advice. Consult a qualified healthcare professional.</p>';
 if(tab==='history')drawCharts()}
function empty(msg,btn){return`<div class="card muted" style="text-align:center;padding:30px">${msg}<br><br>${btn||''}</div>`}

function today(){const d=new Date();const items=[];
 S.protocols.forEach(r=>{if(!isDue(r,d))return;const p=pep(r.peptideId);if(!p)return;
  const done=r.freq==='xweek'?weekLogs(r,d)>=r.timesPerWeek:logsOn(p.id,d).filter(l=>l.protocolId===r.id).length>0;
  items.push({r,p,done})});
 items.sort((a,b)=>a.done-b.done||(a.r.time||'').localeCompare(b.r.time||''));
 const todays=S.logs.filter(l=>ymd(l.ts)===ymd(d)).sort((a,b)=>b.ts-a.ts);
 const alerts=S.peptides.flatMap(p=>invStatus(p).out.map(o=>`<span class="pill ${o[0]}">${esc(p.name)}: ${o[1]}</span>`));
 const al=S.peptides.flatMap(p=>invStatus(p).out.map(o=>[o[0],p.name+': '+o[1]])).sort((x,y)=>(y[0]==='bad')-(x[0]==='bad'));
 return`<h2>Today <button class="btn sm ghost" onclick="logDlg()">+ Log</button></h2>
 <div class="subtle">${items.filter(i=>!i.done).length} due · ${items.filter(i=>i.done).length} done · next site ${esc(suggestSite())}${streak()?` · ${streak()}-day streak`:''}</div>
 ${al.length?`<a class="alertline" onclick="tab='inventory';render()">⚠ ${esc(al[0][1])}${al.length>1?` · +${al.length-1} more`:''} ›</a>`:''}
 ${items.length?items.map(({r,p,done})=>`<div class="card row duebig ${done?'done':''}" style="border-left:4px solid ${color(p.id)}">
  <div class="sp"><h3>${esc(p.name)} <span class="muted">${r.time?'· '+r.time:''}</span></h3>
  <div style="font-size:15px">${fmt(r.doseMcg)} mcg · <b style="color:var(--ac)">${fmt(units(p,r.doseMcg),1)} units</b>${units(p,r.doseMcg)>100?' <span class="pill bad">2 draws</span>':''}</div><div class="muted">${freqText(r)}${r.freq==='xweek'?` · ${weekLogs(r,d)}/${r.timesPerWeek} this week`:''}</div></div>
  ${done?'<span class="pill ok">✓ Logged</span>':`<button class="btn" onclick="quickLog('${r.id}')">Log</button>`}
  <button class="btn sm ghost" onclick="logDlg('${r.id}')" aria-label="Log with details">⋯</button></div>`).join('')
  :empty(S.peptides.length?'Nothing scheduled today.':'Welcome! Add a peptide to get started.',S.peptides.length?`<button class="btn" onclick="protoDlg()">Add protocol</button>`:`<button class="btn" onclick="pepDlg()">Add peptide</button> <button class="btn ghost" onclick="loadDemo()">Load demo data</button>`)}
 ${todays.length?`<details class="card"><summary>Logged today (${todays.length})</summary>${todays.map(logRow).join('')}</details>`:''}`}
function streak(){let n=0,d=new Date();const set=new Set(S.logs.map(l=>ymd(l.ts)));if(!set.has(ymd(d)))d.setDate(d.getDate()-1);while(set.has(ymd(d))){n++;d.setDate(d.getDate()-1)}return n}
function logRow(l){const p=pep(l.peptideId);return`<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)"><i style="width:9px;height:9px;border-radius:50%;background:${color(l.peptideId)}"></i>
 <div class="sp"><b>${esc(p?p.name:'(deleted)')}</b> ${fmt(l.doseMcg)} mcg <span class="muted">· ${new Date(l.ts).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})} · ${esc(l.site||'')}</span>
 ${l.side?`<div class="muted">Side effects: ${esc(l.side)}</div>`:''}${l.notes?`<div class="muted">${esc(l.notes)}</div>`:''}</div>
 <button class="btn sm ghost" onclick="logDlg(null,'${l.id}')">Edit</button></div>`}

function peptides(){return`<h2>Peptide library <button class="btn sm" onclick="pepDlg()">+ Add</button></h2>
 ${S.peptides.length?S.peptides.map(p=>`<div class="card" style="border-left:4px solid ${color(p.id)}"><div class="row"><h3 class="sp">${esc(p.name)}</h3><button class="btn sm ghost" onclick="pepDlg('${p.id}')">Edit</button></div>
 <div class="muted">${fmt(p.vialMg)} mg vial + ${fmt(p.bacMl)} mL BAC water → <b style="color:var(--ac)">${fmt(conc(p),1)} mcg/mL</b> (${fmt(conc(p)/100,2)} mcg per unit)</div>
 <details><summary>Dose calculator${p.notes?' & notes':''}</summary>${p.notes?`<div class="muted" style="margin-top:4px">${esc(p.notes)}</div>`:''}
 <div class="calc"><div class="row"><span class="muted">Target dose (mcg)</span><input type="number" style="width:110px" value="${p.lastCalc||250}" oninput="calc(this,'${p.id}')"><span class="sp"></span><span id="cr_${p.id}"></span></div><div class="syringe"><i id="cb_${p.id}"></i></div></div></details></div>`).join('')
 :empty('No peptides yet.',`<button class="btn" onclick="pepDlg()">Add peptide</button>`)}
`}
function calcView(){return`<h2>Calculator</h2> <div class="card"><h3>Quick reconstitution calculator</h3><div class="f2">
 <div><label>Vial (mg)</label><input id="qv" type="number" value="5" oninput="qcalc()"></div><div><label>BAC water (mL)</label><input id="qb" type="number" value="${BAC()}" oninput="qcalc()"></div>
 <div><label>Dose (mcg)</label><input id="qd" type="number" value="250" oninput="qcalc()"></div><div><label>Syringe</label><select id="qs" onchange="qcalc()"><option value="100">1 mL (100 U)</option><option value="50">0.5 mL (50 U)</option><option value="30">0.3 mL (30 U)</option></select></div></div>
 <div class="calc" id="qr"></div></div>`}
window.calc=(el,id)=>{const p=pep(id),mcg=+el.value;p.lastCalc=mcg;save();const u=units(p,mcg);
 $('#cr_'+id).innerHTML=`<b>${fmt(u,1)} units</b> <span class="muted">(${fmt(u/100,3)} mL)</span>`;$('#cb_'+id).style.width=Math.min(100,u)+'%'};
window.qcalc=()=>{if(!$('#qv'))return;const v=+$('#qv').value,b=+$('#qb').value,d=+$('#qd').value,s=+$('#qs').value;if(!v||!b){$('#qr').textContent='Enter vial and water amounts';return}
 const c=v*1000/b,u=d/c*100;$('#qr').innerHTML=`Concentration <b>${fmt(c,1)} mcg/mL</b> · Draw <b>${fmt(u,1)} units</b> (${fmt(u/100,3)} mL) · ${Math.floor(v*1000/d)} doses per vial
 <div class="syringe"><i style="width:${Math.min(100,u/s*100)}%"></i></div>${u>s?'<div class="pill bad" style="margin-top:6px">Exceeds syringe capacity</div>':''}`};

function protocols(){return`<h2>Protocols <button class="btn sm" onclick="protoDlg()">+ Add</button></h2>
 ${S.protocols.length?S.protocols.map(r=>{const p=pep(r.peptideId);return`<div class="card row ${r.active===false?'done':''}" style="border-left:4px solid ${color(r.peptideId)}"><div class="sp">
 <h3>${esc(p?p.name:'?')} — ${fmt(r.doseMcg)} mcg ${r.time?'@ '+r.time:''}</h3><div class="muted">${freqText(r)}</div>
 <div class="muted">${r.start||'?'} → ${r.end||'ongoing'} ${r.active===false?'· paused':''} ${inCycle(r,new Date())?'':'· <span class="pill warn">off-cycle week</span>'}</div></div>
 <button class="btn sm ghost" onclick="protoDlg('${r.id}')">Edit</button></div>`}).join('')
 :empty(S.peptides.length?'No protocols yet.':'Add a peptide first.',S.peptides.length?`<button class="btn" onclick="protoDlg()">Add protocol</button>`:'')}`}

function historyView(){const y=calMonth.getFullYear(),m=calMonth.getMonth();const first=new Date(y,m,1);const start=new Date(first);start.setDate(1-first.getDay());
 let cells=DOW.map(d=>`<div class="h">${d}</div>`).join('');
 for(let i=0;i<42;i++){const d=new Date(start);d.setDate(start.getDate()+i);const ls=S.logs.filter(l=>ymd(l.ts)===ymd(d));
  cells+=`<div class="${d.getMonth()!==m?'x':''} ${ymd(d)===ymd(new Date())?'t':''}" onclick="dayDetail('${ymd(d)}')">${d.getDate()}<div class="dots">${ls.map(l=>`<i style="background:${color(l.peptideId)}"></i>`).join('')}</div></div>`}
 const logs=S.logs.slice().sort((a,b)=>b.ts-a.ts);
 return`<h2>History</h2><div class="card"><div class="row" style="margin-bottom:8px"><button class="btn sm ghost" onclick="mv(-1)">‹</button><b class="sp" style="text-align:center">${first.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</b><button class="btn sm ghost" onclick="mv(1)">›</button></div><div class="cal">${cells}</div><div id="dayDetail"></div></div>
 <div class="card"><h3>Daily dose (mcg), last 30 days</h3><div id="c1w" style="position:relative;height:220px"><canvas id="c1" height="200"></canvas></div></div>
 <div class="card"><h3>Injection sites</h3><div id="c2w" style="position:relative;height:240px;max-width:340px;margin:auto"><canvas id="c2" height="220"></canvas></div></div>
 <details class="card"><summary>All logs (${logs.length})</summary>${logs.slice(0,100).map(logRow).join('')||'<span class="muted">No logs yet</span>'}</details>`}
window.mv=n=>{calMonth=new Date(calMonth.getFullYear(),calMonth.getMonth()+n,1);render()};
window.dayDetail=k=>{const ls=S.logs.filter(l=>ymd(l.ts)===k);$('#dayDetail').innerHTML=`<h3 style="margin-top:12px">${parseD(k).toDateString()}</h3>`+(ls.map(logRow).join('')||'<span class="muted">No doses</span>')};
function drawCharts(){const days=[...Array(30)].map((_,i)=>{const d=new Date();d.setDate(d.getDate()-29+i);return ymd(d)});
 const sets=S.peptides.map(p=>({label:p.name,backgroundColor:color(p.id),data:days.map(k=>S.logs.filter(l=>l.peptideId===p.id&&ymd(l.ts)===k).reduce((a,l)=>a+ +l.doseMcg,0))})).filter(s=>s.data.some(v=>v));
 const sc={};S.logs.forEach(l=>{if(l.site)sc[l.site]=(sc[l.site]||0)+1});
 if(window.Chart&&!window.__noChart){Chart.defaults.color='#cfe6ff';Chart.defaults.borderColor='rgba(255,255,255,.15)';
  charts.push(new Chart($('#c1'),{type:'bar',data:{labels:days.map(k=>k.slice(5)),datasets:sets},options:{responsive:true,maintainAspectRatio:false,scales:{x:{stacked:true},y:{stacked:true}}}}));
  charts.push(new Chart($('#c2'),{type:'doughnut',data:{labels:Object.keys(sc),datasets:[{data:Object.values(sc),backgroundColor:COLORS,borderWidth:0}]},options:{maintainAspectRatio:false}}));
 }else{ // fallback: CSS bars
  const tot=days.map((k,i)=>sets.reduce((a,s)=>a+s.data[i],0)),mx=Math.max(1,...tot);
  $('#c1w').innerHTML='<div class="bars">'+days.map((k,i)=>`<div><span style="width:44px">${k.slice(5)}</span><i style="width:${tot[i]/mx*70}%"></i>${tot[i]||''}</div>`).join('')+'</div><p class="muted">Chart.js unavailable offline — simple view shown.</p>';
  const ms=Math.max(1,...Object.values(sc));$('#c2w').innerHTML='<div class="bars">'+Object.entries(sc).map(([s,n])=>`<div><span style="width:80px">${esc(s)}</span><i style="width:${n/ms*60}%"></i>${n}</div>`).join('')+'</div>'}}

function inventory(){return`<h2>Inventory</h2>${S.peptides.length?S.peptides.map(p=>{const st=invStatus(p),e=expiry(p);const pct=p.vialMg?Math.min(100,(p.remainingMg||0)/p.vialMg*100):0;
 return`<div class="card" style="border-left:4px solid ${color(p.id)}"><div class="row"><h3 class="sp">${esc(p.name)}</h3>${st.out.map(o=>`<span class="pill ${o[0]}">${o[1]}</span>`).join(' ')||'<span class="pill ok">OK</span>'}</div>
 <div class="muted" style="margin-top:4px">${fmt(p.remainingMg||0,2)} mg left in open vial · ${p.vials||0} sealed · ${isFinite(st.daysLeft)?'~'+Math.floor(st.daysLeft)+' days supply':'—'}</div><details><summary>Details & actions</summary><div class="grid" style="margin-top:8px"><div class="stat"><b>${fmt(p.remainingMg||0,2)} mg</b><span class="muted">in open vial (${Math.round(pct)}%)</span></div>
 <div class="stat"><b>${p.vials||0}</b><span class="muted">sealed vials</span></div><div class="stat"><b>${isFinite(st.daysLeft)?Math.floor(st.daysLeft)+'d':'—'}</b><span class="muted">est. supply</span></div>
 <div class="stat"><b>${e?e.toLocaleDateString(undefined,{month:'short',day:'numeric'}):'—'}</b><span class="muted">open vial expires</span></div></div>
 <div class="row" style="margin-top:10px"><button class="btn sm" onclick="openVial('${p.id}')">Open new vial</button> <button class="btn sm ghost" onclick="mixNow('${p.id}')">Mix / units</button><button class="btn sm ghost" onclick="addVials('${p.id}')">+ Add sealed vials</button><button class="btn sm ghost" onclick="pepDlg('${p.id}')">Edit</button></div></details></div>`}).join(''):empty('No peptides yet.')}`}
window.openVial=id=>{const p=pep(id);if(!(p.vials>0)&&!confirm('No sealed vials recorded. Open anyway?'))return;if(p.vials>0)p.vials--;p.remainingMg=+p.vialMg;p.reconDate=ymd(new Date());save();render();toast('New vial reconstituted')};
window.addVials=id=>{const n=parseInt(prompt('How many sealed vials to add?','1'));if(n>0){pep(id).vials=(+pep(id).vials||0)+n;save();render()}};

function data(){return`<h2>Data</h2><div class="card"><h3>Backup</h3><p class="muted">All data lives only in this browser (localStorage). Export regularly.</p>
 <div class="row"><button class="btn" onclick="exportJSON()">Export JSON</button><button class="btn ghost" onclick="exportCSV()">Export logs CSV</button>
 <label class="btn ghost" style="margin:0;color:var(--tx)">Import JSON<input type="file" accept=".json,application/json" hidden onchange="importJSON(this)"></label></div></div>
  <div class="card"><h3>Stats</h3><div class="muted">${S.peptides.length} peptides · ${S.protocols.length} protocols · ${S.logs.length} logs</div></div>
 <div class="card"><h3>Demo / reset</h3><div class="row"><button class="btn ghost" onclick="loadDemo()">Load demo data</button><button class="btn danger" onclick="if(confirm('Delete ALL data?')){S={peptides:[],protocols:[],logs:[],settings:{}};save();render()}">Erase everything</button></div></div>`}
function dl(name,txt,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([txt],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
window.exportJSON=()=>dl(`peptide-tracker-${ymd(new Date())}.json`,JSON.stringify({app:'PeptideTracker',version:1,exported:new Date().toISOString(),...S},null,2),'application/json');
window.exportCSV=()=>{const q=v=>`"${String(v??'').replace(/"/g,'""')}"`;const rows=[['datetime','peptide','dose_mcg','units','site','side_effects','notes']];
 S.logs.slice().sort((a,b)=>a.ts-b.ts).forEach(l=>{const p=pep(l.peptideId);rows.push([new Date(l.ts).toISOString(),p?p.name:'',l.doseMcg,p?fmt(units(p,l.doseMcg),1):'',l.site,l.side,l.notes])});
 dl(`peptide-logs-${ymd(new Date())}.csv`,rows.map(r=>r.map(q).join(',')).join('\n'),'text/csv')};
window.importJSON=inp=>{const f=inp.files[0];if(!f)return;f.text().then(t=>{const d=JSON.parse(t);if(!Array.isArray(d.peptides))throw 0;
 if(!confirm('Replace current data with imported file?'))return;S={peptides:d.peptides,protocols:d.protocols||[],logs:d.logs||[],settings:d.settings||{}};save();render();toast('Imported')}).catch(()=>alert('Invalid backup file'))};

// ---- dialogs
function dlg(html,onSave){const f=$('#dlgForm');f.innerHTML=html+`<div class="row" style="margin-top:14px"><span class="sp"></span><button class="btn ghost" value="cancel" formnovalidate>Cancel</button><button class="btn" value="ok">Save</button></div>`;
 const d=$('#dlg');d.onclose=()=>{if(d.returnValue==='ok')onSave(Object.fromEntries(new FormData(f)),f)};d.returnValue='';d.showModal()}
window.pepDlg=id=>{const p=id?pep(id):{name:'',vialMg:5,bacMl:BAC(),vials:0,remainingMg:5,reorderAt:1,expiryDays:EXP(),reconDate:ymd(new Date()),notes:''};
 dlg(`<h2>${id?'Edit':'Add'} peptide</h2>${refPicker('pep')}<label>Name</label><input name="name" required value="${esc(p.name)}" placeholder="e.g. BPC-157">
 <div class="f2"><div><label>Vial size (mg)</label><input name="vialMg" type="number" step="any" min="0.01" required value="${p.vialMg}"></div><div><label>BAC water (mL)</label><input name="bacMl" type="number" step="any" min="0.01" required value="${p.bacMl}"></div>
 <div><label>Remaining in open vial (mg)</label><input name="remainingMg" type="number" step="any" min="0" value="${p.remainingMg}"></div><div><label>Sealed vials on hand</label><input name="vials" type="number" min="0" value="${p.vials}"></div>
 <div><label>Reconstituted on</label><input name="reconDate" type="date" value="${p.reconDate||''}"></div><div><label>Expires after (days)</label><input name="expiryDays" type="number" min="1" value="${p.expiryDays}"></div>
 <div><label>Reorder when sealed ≤</label><input name="reorderAt" type="number" min="0" value="${p.reorderAt}"></div></div>
 <label>Notes</label><textarea name="notes" rows="2">${esc(p.notes)}</textarea>
 ${id?`<button type="button" class="btn danger sm" style="margin-top:10px" onclick="delPep('${id}')">Delete peptide</button>`:''}`,v=>{
  ['vialMg','bacMl','remainingMg','vials','expiryDays','reorderAt'].forEach(k=>v[k]=+v[k]);
  if(id)Object.assign(p,v);else{const nw={id:uid(),...v};S.peptides.push(nw);NEWQ.push(nw.id)}save();render();toast('Saved')})};
window.delPep=id=>{if(!confirm('Delete peptide, its protocols and logs?'))return;S.peptides=S.peptides.filter(p=>p.id!==id);S.protocols=S.protocols.filter(r=>r.peptideId!==id);S.logs=S.logs.filter(l=>l.peptideId!==id);save();$('#dlg').close();render()};
window.protoDlg=id=>{if(!S.peptides.length){pepDlg();return}const r=id?S.protocols.find(x=>x.id===id):{peptideId:S.peptides[0].id,doseMcg:250,freq:'daily',timesPerWeek:3,weekdays:[1,3,5],everyN:2,cycleOn:0,cycleOff:0,start:ymd(new Date()),end:'',time:'08:00',active:true};
 dlg(`<h2>${id?'Edit':'Add'} protocol</h2>${refPicker('proto',(pep(r.peptideId)||{}).name)}<label>Peptide</label><select name="peptideId">${S.peptides.map(p=>`<option value="${p.id}" ${p.id===r.peptideId?'selected':''}>${esc(p.name)}</option>`).join('')}</select>
 <div class="f2"><div><label>Dose (mcg)</label><input name="doseMcg" type="number" step="any" min="0" required value="${r.doseMcg}"></div><div><label>Time</label><input name="time" type="time" value="${r.time||''}"></div></div>
 <label>Frequency</label><select name="freq" onchange="document.querySelectorAll('.fq').forEach(e=>e.hidden=e.dataset.f!==this.value)">
 ${[['daily','Daily'],['xweek','X times per week'],['weekdays','Specific weekdays'],['everyN','Every N days']].map(([v,t])=>`<option value="${v}" ${r.freq===v?'selected':''}>${t}</option>`).join('')}</select>
 <div class="fq" data-f="xweek" ${r.freq!=='xweek'?'hidden':''}><label>Times per week</label><input name="timesPerWeek" type="number" min="1" max="14" value="${r.timesPerWeek||3}"></div>
 <div class="fq" data-f="weekdays" ${r.freq!=='weekdays'?'hidden':''}><label>Days</label><div class="chk">${DOW.map((d,i)=>`<label><input type="checkbox" name="wd${i}" ${(r.weekdays||[]).includes(i)?'checked':''}>${d}</label>`).join('')}</div></div>
 <div class="fq" data-f="everyN" ${r.freq!=='everyN'?'hidden':''}><label>Every N days</label><input name="everyN" type="number" min="1" value="${r.everyN||2}"></div>
 <div class="f2"><div><label>Cycle: weeks on (0 = continuous)</label><input name="cycleOn" type="number" min="0" value="${r.cycleOn||0}"></div><div><label>Weeks off</label><input name="cycleOff" type="number" min="0" value="${r.cycleOff||0}"></div>
 <div><label>Start date</label><input name="start" type="date" required value="${r.start}"></div><div><label>End date (optional)</label><input name="end" type="date" value="${r.end||''}"></div></div>
 <div class="chk" style="margin-top:10px"><label><input type="checkbox" name="active" ${r.active!==false?'checked':''}>Active</label></div>
 ${id?`<button type="button" class="btn danger sm" style="margin-top:10px" onclick="S.protocols=S.protocols.filter(x=>x.id!=='${id}');save();$('#dlg').close();render()">Delete protocol</button>`:''}`,v=>{
  const o={peptideId:v.peptideId,doseMcg:+v.doseMcg,time:v.time,freq:v.freq,timesPerWeek:+v.timesPerWeek,everyN:+v.everyN,cycleOn:+v.cycleOn,cycleOff:+v.cycleOff,start:v.start,end:v.end,active:!!v.active,weekdays:DOW.map((_,i)=>v['wd'+i]?i:-1).filter(i=>i>=0)};
  if(id)Object.assign(r,o);else S.protocols.push({id:uid(),...o});save();render();toast('Saved')})};
window.quickLog=rid=>{const r=S.protocols.find(x=>x.id===rid);const l={id:uid(),peptideId:r.peptideId,protocolId:r.id,ts:Date.now(),doseMcg:r.doseMcg,site:suggestSite(),notes:'',side:''};
 S.logs.push(l);applyInventory(l.peptideId,l.doseMcg,1);save();render();toast(`Logged · ${l.site}`)};
window.logDlg=(rid,lid)=>{if(!S.peptides.length){pepDlg();return}const r=rid&&S.protocols.find(x=>x.id===rid);
 const l=lid?S.logs.find(x=>x.id===lid):{peptideId:r?r.peptideId:S.peptides[0].id,protocolId:r?r.id:'',ts:Date.now(),doseMcg:r?r.doseMcg:250,site:suggestSite(),notes:'',side:''};
 const sug=suggestSite();const dt=new Date(l.ts-new Date().getTimezoneOffset()*6e4).toISOString().slice(0,16);
 dlg(`<h2>${lid?'Edit':'Log'} dose</h2><label>Peptide</label><select name="peptideId">${S.peptides.map(p=>`<option value="${p.id}" ${p.id===l.peptideId?'selected':''}>${esc(p.name)}</option>`).join('')}</select>
 <div class="f2"><div><label>Dose (mcg)</label><input name="doseMcg" type="number" step="any" min="0" required value="${l.doseMcg}"></div><div><label>Date & time</label><input name="ts" type="datetime-local" required value="${dt}"></div></div>
 <label>Injection site <span class="muted">(suggested: ${sug} — least recently used)</span></label><input type="hidden" name="site" value="${esc(l.site)}">
 <div class="sites">${SITES.map(s=>`<button type="button" class="${s===l.site?'sel':''} ${s===sug?'sug':''}" onclick="this.form.site.value='${s}';this.parentNode.querySelectorAll('button').forEach(b=>b.classList.toggle('sel',b===this))">${s}</button>`).join('')}</div>
 <label>Side effects</label><input name="side" value="${esc(l.side)}" placeholder="e.g. redness, nausea, none">
 <label>Notes</label><textarea name="notes" rows="2">${esc(l.notes)}</textarea>
 ${lid?`<button type="button" class="btn danger sm" style="margin-top:10px" onclick="delLog('${lid}')">Delete log</button>`:''}`,v=>{
  const o={peptideId:v.peptideId,doseMcg:+v.doseMcg,ts:+new Date(v.ts),site:v.site,side:v.side,notes:v.notes};
  if(lid){applyInventory(l.peptideId,l.doseMcg,-1);Object.assign(l,o)}else S.logs.push(Object.assign(l,o));
  applyInventory(l.peptideId,l.doseMcg,1);save();render();toast('Logged')})};
window.delLog=id=>{const l=S.logs.find(x=>x.id===id);applyInventory(l.peptideId,l.doseMcg,-1);S.logs=S.logs.filter(x=>x.id!==id);save();$('#dlg').close();render()};

window.loadDemo=()=>{if(S.logs.length&&!confirm('Replace current data with demo data?'))return;
 const d0=new Date();d0.setDate(d0.getDate()-35);const st=ymd(d0);
 const P=[{id:'bpc',name:'BPC-157',vialMg:5,bacMl:BAC(),vials:2,remainingMg:5,reorderAt:1,expiryDays:28,reconDate:st,notes:'Demo entry'},
  {id:'tb5',name:'TB-500',vialMg:10,bacMl:2,vials:1,remainingMg:10,reorderAt:1,expiryDays:28,reconDate:st,notes:''},
  {id:'ipa',name:'Ipamorelin',vialMg:2,bacMl:2,vials:0,remainingMg:2,reorderAt:1,expiryDays:28,reconDate:st,notes:'Before bed'}];
 const R=[{id:'r1',peptideId:'bpc',doseMcg:250,freq:'daily',time:'08:00',start:st,end:'',active:true,weekdays:[],cycleOn:0,cycleOff:0},
  {id:'r2',peptideId:'tb5',doseMcg:2000,freq:'xweek',timesPerWeek:2,time:'09:00',start:st,end:'',active:true,weekdays:[],cycleOn:0,cycleOff:0},
  {id:'r3',peptideId:'ipa',doseMcg:200,freq:'weekdays',weekdays:[1,2,3,4,5],time:'22:00',start:st,end:'',active:true,cycleOn:5,cycleOff:1}];
 S={peptides:P,protocols:R,logs:[],settings:{}};
 for(let i=35;i>=1;i--){const d=new Date();d.setDate(d.getDate()-i);R.forEach(r=>{if(!isDue(r,d))return;if(r.freq==='xweek'&&![1,4].includes(d.getDay()))return;if(Math.random()<.1)return;
  const [h,m]=r.time.split(':');d.setHours(+h,+m);const l={id:uid(),peptideId:r.peptideId,protocolId:r.id,ts:+d,doseMcg:r.doseMcg,site:suggestSite(),notes:'',side:Math.random()<.08?'mild redness':''};S.logs.push(l);applyInventory(l.peptideId,l.doseMcg,1)})}
 save();render();toast('Demo data loaded')};

document.querySelectorAll('#tabs button').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;render();scrollTo(0,0)});
window.addEventListener('load',()=>{try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist()}catch(e){}render();if(tab==='peptides')qcalc()});
render();
const _r=render;render=function(){_r();if(tab==='peptides'){qcalc();S.peptides.forEach(p=>{const i=document.querySelector(`#cr_${p.id}`)?.closest('.calc').querySelector('input');if(i)calc(i,p.id)})}};
const APP_VERSION='24';
if('serviceWorker'in navigator&&location.protocol.startsWith('http')){const had=!!navigator.serviceWorker.controller;let reloading=false;
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!had||reloading)return;reloading=true;location.reload()});
 navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(reg=>{reg.update();document.addEventListener('visibilitychange',()=>{if(!document.hidden)reg.update()})}).catch(()=>{})}

// ---- Peptide Reference (data from peptidedosages.com, see reference.js)
function BAC(){return +(S.settings&&S.settings.defaultBac)||2}
const REF=()=>window.PEPTIDE_REF||[];
let refQ='';
const mcgTxt=v=>v==null?'—':v>=1000?fmt(v/1000,3)+' mg':fmt(v,1)+' mcg';
const u100=(vialMg,mcg,bac)=>vialMg&&mcg!=null?mcg/(vialMg*1000/bac)*100:null;
function refFind(name){if(!name)return-1;const n=name.toLowerCase();return REF().findIndex(g=>g.name.toLowerCase()===n)}
function refTable(g,bac){bac=bac||BAC();return`<table class="ref"><tr><th>Vial</th><th>Conc @ ${fmt(bac)} mL</th><th>Dose range</th><th>Units (U-100)</th><th>Freq</th><th>Site's mix</th></tr>
 ${g.entries.map(e=>{const a=u100(e.vialMg,e.minMcg,bac),b=u100(e.vialMg,e.maxMcg,bac);return`<tr><td>${esc(e.vialLabel||(e.vialMg?fmt(e.vialMg)+' mg':'—'))}</td>
 <td>${e.vialMg?fmt(e.vialMg/bac,3)+' mg/mL':'—'}</td><td>${esc(e.doseRange)}</td>
 <td>${a==null?'<span class="muted">n/a</span>':`<b style="color:${(b||a)>100?'var(--bad)':'var(--ac)'}">${fmt(a,1)}${b!==a?'–'+fmt(b,1):''}</b>${(b||a)>100?'<br><span class="muted" style="font-size:10px">&gt;100u: 2 draws</span>':''}`}</td><td>${esc(e.freq)}</td><td class="muted">${esc(e.siteConc)} <a href="${esc(e.url)}" target="_blank" rel="noopener">src</a></td></tr>`}).join('')}</table>`}
function refCard(g,i,full){const e0=g.entries[0];return`<div class="card"><div class="row"><h3 class="sp">${esc(g.name)} <span class="pill">${esc(g.type)}</span></h3>
 <button class="btn sm" onclick="refAdd(${i})">+ Add to library</button></div>
 <div class="muted">Dose range: ${[...new Set(g.entries.map(e=>e.doseRange))].map(esc).join(' / ')} · ${[...new Set(g.entries.map(e=>e.freq))].map(esc).join(' / ')}</div>
 <details><summary>Units per vial size & notes</summary><div style="overflow-x:auto;margin-top:6px">${refTable(g)}</div>
 ${full!==false?[...new Set(g.entries.flatMap(e=>e.cycle||[]))].slice(0,2).map(c=>`<div class="ex">Cycle: “${esc(c)}”</div>`).join('')+[...new Set(g.entries.flatMap(e=>e.recon||[]))].slice(0,1).map(c=>`<div class="ex">Site reconstitution: “${esc(c)}”</div>`).join(''):''}</details>
 <div class="muted" style="margin-top:6px">Source: <a href="${esc(e0.url)}" target="_blank" rel="noopener">peptidedosages.com</a> · Units are calculated at your ${fmt(BAC())} mL BAC water, which may differ from the site's mix. Not medical advice.</div></div>`}
function reference(){if(!REF().length)return`<h2>Peptide Reference</h2>`+empty('Reference data failed to load (reference.js).');
 const q=refQ.toLowerCase(),list=REF().map((g,i)=>[g,i]).filter(([g])=>!q||g.name.toLowerCase().includes(q));
 return`<h2>Peptide Reference <span class="muted">${REF().length} peptides</span></h2>
 <div class="card"><input id="refQ" placeholder="Search peptides…" value="${esc(refQ)}" oninput="refQ=this.value;const p=this.selectionStart;render();const n=$('#refQ');n.focus();n.setSelectionRange(p,p)">
 <p class="muted" style="margin:8px 0 0">Data copied from <a href="${window.PEPTIDE_REF_SOURCE}" target="_blank" rel="noopener">peptidedosages.com</a> (retrieved ${window.PEPTIDE_REF_DATE}). Units shown for ${fmt(BAC())} mL BAC water (${fmt(BAC()*100)} units total); change the default in Settings. Educational reference only, not medical advice. Verify against the source.</p></div>
 ${list.slice(0,60).map(([g,i])=>refCard(g,i)).join('')}${list.length>60?`<p class="muted">Showing 60 of ${list.length}; refine your search.</p>`:''}`}
function refPicker(kind,cur){if(!REF().length)return'';const ci=refFind(cur);
 return`<label>Fill from Peptide Reference (peptidedosages.com)</label><select onchange="refFill('${kind}',this)"><option value="">— choose to pre-fill —</option>${REF().map((g,i)=>`<option value="${i}" ${i===ci?'selected':''}>${esc(g.name)}</option>`).join('')}</select><div id="refInfo">${ci>=0?refInfo(ci):''}</div>`}
function refInfo(i){const g=REF()[i];return`<div class="refbox"><b>${esc(g.name)}</b>: ${[...new Set(g.entries.map(e=>e.doseRange+' · '+e.freq))].map(esc).join('; ')}<div style="overflow-x:auto">${refTable(g)}</div><div class="muted"><a href="${esc(g.entries[0].url)}" target="_blank" rel="noopener">Source</a> · Not medical advice.</div></div>`}
window.refFill=(kind,sel)=>{const i=sel.value;if(i===''){$('#refInfo').innerHTML='';return}const g=REF()[+i],f=sel.form,e=g.entries.find(x=>x.minMcg!=null)||g.entries[0];$('#refInfo').innerHTML=refInfo(+i);
 if(kind==='pep'){f.name.value=g.name;const ev=g.entries.find(x=>x.vialMg)||{};if(ev.vialMg){f.vialMg.value=ev.vialMg;f.remainingMg.value=ev.vialMg}f.bacMl.value=BAC();if(!f.notes.value)f.notes.value='Ref: '+e.doseRange+' · '+e.freq+' — '+e.url}
 else{const p=S.peptides.find(p=>p.name.toLowerCase()===g.name.toLowerCase());if(p)f.peptideId.value=p.id;if(e.minMcg!=null)f.doseMcg.value=e.minMcg;
  if(e.appFreq){f.freq.value=e.appFreq;if(e.timesPerWeek)f.timesPerWeek.value=e.timesPerWeek;f.freq.dispatchEvent(new Event('change'))}}};
window.refAdd=i=>{tab='peptides';render();pepDlg();const s=$('#dlgForm select');s.value=i;refFill('pep',s)};

function EXP(){return +(S.settings&&S.settings.defaultExpiry)||28}
function settings(){return`<h2>Settings</h2><div class="card"><label>Default BAC water per vial (mL) · 2 mL = 200 units on a U-100 syringe</label>
 <input type="number" step="any" min="0.1" value="${BAC()}" onchange="S.settings.defaultBac=+this.value||2;save();toast('Default BAC water: '+S.settings.defaultBac+' mL')">
 <label>Default vial expiry after reconstitution (days)</label><input type="number" min="1" value="${EXP()}" onchange="S.settings.defaultExpiry=+this.value||28;save();toast('Default expiry: '+S.settings.defaultExpiry+' days')">
 <p class="muted">Defaults apply to newly added peptides. Edit an existing peptide to change its own values.</p></div>
 <p class="muted" id="ver" style="text-align:center">Tides v${APP_VERSION}</p>`}
window.menu=o=>{$('#drawer').classList.toggle('on',o);$('#scrim').classList.toggle('on',o);$('#drawer').setAttribute('aria-hidden',!o)};
document.querySelectorAll('#drawer [data-go]').forEach(b=>b.onclick=()=>{tab=b.dataset.go;menu(false);render();scrollTo(0,0)});
const _r2=render;render=function(){_r2();document.querySelectorAll('#drawer [data-go]').forEach(b=>b.classList.toggle('on',b.dataset.go===tab));if(tab==='calc')qcalc()};

// ---- Suggested schedule (schedule.js) + #add= merge links
const SG=()=>window.SUGGESTED;
function sgDate(w,end){const d=parseD(SG().start);d.setDate(d.getDate()+(w-1)*7+(end?6:0));return ymd(d)}
function sgMcgTxt(m){return m>=1000?fmt(m/1000,3)+' mg':fmt(m)+' mcg'}
function sgUnits(m,vial){return m/(vial*1000/BAC())*100}
function unitsCell(u){return u>100?`<span style="color:var(--bad)">${fmt(u,1)}u</span><br><span class="muted" style="font-size:10px">2 draws</span>`:`<span style="color:var(--ac)">${fmt(u,1)}u</span>`}
function sgProtocols(){const out=[];SG().items.forEach(it=>it.phases.forEach((ph,i)=>out.push({id:'sg-'+it.key+'-'+(i+1),peptideName:it.name,doseMcg:ph.mcg,
 freq:it.days.length===7?'daily':'weekdays',weekdays:it.days.length===7?[]:it.days,timesPerWeek:1,everyN:1,cycleOn:0,cycleOff:0,
 time:it.slot==='AM'?'08:00':'21:00',start:sgDate(ph.w[0]),end:sgDate(ph.w[1],true),active:false,note:'Suggested from '+it.url})));return out}
function mergeAdd(data){let np=0,nr=0;
 (data.peptides||[]).forEach(p=>{if(!S.peptides.some(x=>x.name.toLowerCase()===p.name.toLowerCase())){S.peptides.push({id:uid(),vialMg:0,bacMl:BAC(),vials:0,remainingMg:0,reorderAt:1,expiryDays:EXP(),reconDate:'',notes:'',...p});np++}});
 (data.protocols||[]).forEach(r=>{if(r.id&&S.protocols.some(x=>x.id===r.id))return;let p=S.peptides.find(x=>x.name.toLowerCase()===String(r.peptideName||'').toLowerCase());
  if(!p){const it=(SG().items.find(i=>i.name===r.peptideName)||{vials:[0]});p={id:uid(),name:r.peptideName,vialMg:it.vials[0],bacMl:BAC(),vials:0,remainingMg:0,reorderAt:1,expiryDays:EXP(),reconDate:'',notes:'Vial size not confirmed; edit to match your vial.'};S.peptides.push(p);np++}
  const o={...r,peptideId:p.id};delete o.peptideName;S.protocols.push(o);nr++});
 save();return[np,nr]}
window.sgAdd=()=>{const[np,nr]=mergeAdd({protocols:sgProtocols()});render();toast(nr?`Added ${nr} paused protocols${np?`, ${np} peptides`:''}`:'Already added')};
function suggested(){const g=SG();if(!g)return empty('Schedule data missing.');const DAYS=[1,2,3,4,5,6,0];
 const cell=(slot,dow)=>g.items.filter(it=>it.slot===slot&&it.days.includes(dow)).map(it=>`<div style="color:${COLORS[g.items.indexOf(it)%COLORS.length]}">${esc(it.name)}<br><span class="muted">${sgMcgTxt(it.phases[0].mcg)}</span></div>`).join('')||'<span class="muted">—</span>';
 const lib=n=>S.peptides.find(p=>p.name.toLowerCase()===n.toLowerCase());
 return`<h2>Suggested schedule</h2><p class="subtle">Starts Mon ${g.start}. Week 1 shown; doses step up per the phases below. Units at ${fmt(BAC())} mL BAC water.</p>
 <div class="card" style="overflow-x:auto"><table class="ref"><tr><th></th>${DAYS.map(d=>`<th>${DOW[d]}</th>`).join('')}</tr>
 ${['AM','PM'].map(s=>`<tr><th>${s}</th>${DAYS.map(d=>`<td>${cell(s,d)}</td>`).join('')}</tr>`).join('')}</table></div>
 <button class="btn" style="width:100%;margin-bottom:12px" onclick="sgAdd()">Add as protocols (paused)</button>
 ${g.items.map((it,i)=>{const p=lib(it.name);return`<div class="card" style="border-left:4px solid ${COLORS[i%COLORS.length]}"><div class="row"><h3 class="sp">${esc(it.name)}${it.alias?` <span class="muted">(${esc(it.alias)})</span>`:''}</h3><span class="pill">${it.slot}</span></div>
 <table class="ref"><tr><th>Weeks</th><th>Dose</th>${it.vials.map(v=>`<th>${v} mg vial</th>`).join('')}${p&&p.vialMg&&!it.vials.includes(+p.vialMg)?`<th>Your ${fmt(p.vialMg)} mg</th>`:''}</tr>
 ${it.phases.map(ph=>`<tr><td>${ph.w[0]===ph.w[1]?ph.w[0]:ph.w[0]+'–'+ph.w[1]}</td><td>${sgMcgTxt(ph.mcg)}${it.days.length===1?' /wk':' /day'}</td>${it.vials.map(v=>`<td>${unitsCell(sgUnits(ph.mcg,v))}</td>`).join('')}${p&&p.vialMg&&!it.vials.includes(+p.vialMg)?`<td>${unitsCell(sgUnits(ph.mcg,p.vialMg))}</td>`:''}</tr>`).join('')}</table>
 <details><summary>From the site & why this slot</summary><div class="ex">${esc(it.site)}</div><div class="ex">Slot: ${esc(it.why)}</div></details>
 <div class="muted" style="margin-top:6px"><a href="${esc(it.url)}" target="_blank" rel="noopener">Source: peptidedosages.com</a></div></div>`}).join('')}
 <p class="muted">Red = over 100 units: more than one 1 mL U-100 syringe, so it needs 2 draws. AM/PM placement is not from the source. Educational reference only, not medical advice; review with a qualified clinician before starting.</p>`}
const ORDERS={'order-20261011':{note:'Direct Peptides order 10/11/2026',items:[['Retatrutide',10,2],['Tesamorelin',10,2],['NAD+',500,2],['SS-31',10,2],['GLOW',70,1],['Melanotan II',10,2]]}};
function applyItems(items,note){let np=0,nv=0;items.forEach(([name,mg,n,unit])=>{let p=S.peptides.find(x=>x.name.toLowerCase()===name.toLowerCase());
  if(!p){p={id:uid(),name,vialMg:mg,bacMl:2,vials:0,remainingMg:0,reorderAt:1,expiryDays:EXP(),reconDate:'',notes:''};S.peptides.push(p);np++;NEWQ.push(p.id)}
  if(unit!=='iu'&&unit!=='mL')p.vialMg=mg;p.vials=(+p.vials||0)+n;nv+=n;p.notes=[(p.notes||'').replace('Vial size not confirmed; edit to match your vial.','').trim(),`${note}: ${n}× ${mg}${unit&&unit!=='mg'?' '+unit:' mg'}`].filter(Boolean).join(' · ')});save();return[np,nv]}
window.applyItems=applyItems;
function applyOrder(key){const o=ORDERS[key];S.settings.imports=S.settings.imports||{};if(S.settings.imports[key])return null;let np=0,nv=0;
 o.items.forEach(([name,mg,n])=>{let p=S.peptides.find(x=>x.name.toLowerCase()===name.toLowerCase());
  if(!p){p={id:uid(),name,vialMg:mg,bacMl:2,vials:0,remainingMg:0,reorderAt:1,expiryDays:EXP(),reconDate:'',notes:''};S.peptides.push(p);np++;NEWQ.push(p.id)}
  p.vialMg=mg;p.vials=(+p.vials||0)+n;nv+=n;p.notes=((p.notes||'').replace('Vial size not confirmed; edit to match your vial.','').trim()+(p.notes?' · ':'')+o.note+`: ${n}× ${mg} mg`).replace(/^ · /,'')});
 S.settings.imports[key]=new Date().toISOString();save();return[np,nv]}
window.applyOrder=applyOrder;
function handleAddHash(){const m=location.hash.match(/^#add=(.+)$/);if(!m)return;
 if(ORDERS[m[1]]){const r=applyOrder(m[1]);window.history.replaceState(null,'',location.pathname);tab='inventory';render();toast(r?`Order added: ${r[1]} sealed vials${r[0]?`, ${r[0]} new peptides`:''}`:'Order already imported');return}if(m[1]==='suggested'){const[np,nr]=mergeAdd({protocols:sgProtocols()});history.replaceState(null,'',location.pathname);tab='suggested';render();toast(nr?`Added ${nr} paused protocols${np?`, ${np} peptides`:''}`:'Suggested schedule already added');return}try{let b=m[1].replace(/-/g,'+').replace(/_/g,'/');while(b.length%4)b+='=';
 const data=JSON.parse(decodeURIComponent(escape(atob(b))));const[np,nr]=mergeAdd(data);history.replaceState(null,'',location.pathname);tab='suggested';render();toast(`Imported ${np} peptides, ${nr} protocols (paused)`)}catch(e){console.warn('bad #add link',e)}}
window.addEventListener('hashchange',handleAddHash);handleAddHash();

// ---- Reconstitution screen (v24)
let NEWQ=[],RQ={ids:[],i:0,bac:2,dose:null,id:null};
window.mixFlow=ids=>{ids=ids.filter(id=>pep(id));if(!ids.length)return;RQ={ids,i:0,id:ids[0],bac:+pep(ids[0]).bacMl||BAC(),dose:null};tab='recon';render();scrollTo(0,0)};
function reconDose(p){const r=S.protocols.find(x=>x.peptideId===p.id&&x.doseMcg);if(r)return +r.doseMcg;const i=refFind(p.name);if(i>=0){const e=REF()[i].entries.find(x=>x.minMcg!=null);if(e)return +e.minMcg}return 250}
function syringe(u){const f=Math.min(u,100),W=300,x0=40,L=220,fx=x0+L*f/100;let t='';for(let k=0;k<=100;k+=5){const x=x0+L*k/100,big=k%10===0;t+=`<line x1="${x}" y1="18" x2="${x}" y2="${big?34:28}" stroke="#cfe6ff" stroke-width="${big?1.4:.8}"/>`+(k%20===0?`<text x="${x}" y="52" fill="#cfe6ff" font-size="10" text-anchor="middle">${k}</text>`:'')}
 return`<svg viewBox="0 0 ${W} 60" width="100%" role="img" aria-label="Syringe filled to ${fmt(f,1)} units"><rect x="${x0}" y="14" width="${L}" height="24" rx="5" fill="rgba(255,255,255,.08)" stroke="#cfe6ff"/><rect x="${x0}" y="15" width="${Math.max(0,fx-x0)}" height="22" rx="4" fill="#8FD3FF" opacity=".75"/>${t}<rect x="${x0+L}" y="20" width="22" height="12" fill="#cfe6ff"/><rect x="${x0+L+22}" y="8" width="6" height="36" fill="#cfe6ff"/><line x1="${x0}" y1="26" x2="10" y2="26" stroke="#cfe6ff" stroke-width="2"/><rect x="${fx-2}" y="10" width="4" height="32" fill="#FFD166"/></svg>`}
function recon(){const p=pep(RQ.id);if(!p){tab='inventory';return inventory()}
 if(RQ.dose==null)RQ.dose=reconDose(p);const mg=+p.vialMg||0,bac=RQ.bac,c=bac>0?mg/bac:0,u=c?RQ.dose/(c*1000)*100:0,per=RQ.dose>0?Math.floor(mg*1000/RQ.dose):0,ri=refFind(p.name),g=ri>=0?REF()[ri]:null;
 const n=RQ.ids.length,last=RQ.i>=n-1;
 return`<h2>Mix ${esc(p.name)}${n>1?` <span class="muted">${RQ.i+1} of ${n}</span>`:''}</h2>
 <div class="card"><div class="row" style="gap:12px;flex-wrap:wrap"><div><label>Vial (mg)</label><input type="number" min="0" step="any" value="${mg}" style="width:110px" onchange="pep('${p.id}').vialMg=+this.value||0;save();render()"></div>
 <div><label>BAC water (mL)</label><div class="row" style="gap:6px">${[1,2,3].map(v=>`<button class="btn sm ${bac===v?'':'ghost'}" onclick="RQ.bac=${v};render()">${v} mL</button>`).join('')}<input type="number" min="0.1" step="0.1" value="${bac}" style="width:80px" onchange="RQ.bac=+this.value||2;render()"></div></div></div>
 <div class="row" style="gap:18px;margin-top:12px;flex-wrap:wrap"><div><div class="muted">Concentration</div><b style="font-size:20px">${fmt(c,3)} mg/mL</b></div><div><div class="muted">Per unit</div><b style="font-size:20px">${fmt(c*10,2)} mcg/u</b></div></div></div>
 <div class="card"><label>Target dose (mcg)</label><input type="number" min="0" step="any" value="${RQ.dose}" onchange="RQ.dose=+this.value||0;render()">
 <div style="margin:12px 0 4px;font-size:26px;font-weight:700;color:var(--ac)">${fmt(u,1)} units${u>100?' <span class="pill bad">2 draws</span>':''}</div>${syringe(u)}
 <div class="muted">U-100 insulin syringe · about ${per} doses per vial</div>
 ${g?`<div class="refbox" style="margin-top:10px"><b>Reference</b>: ${[...new Set(g.entries.map(e=>e.doseRange+' · '+e.freq))].map(esc).join('; ')}<div class="muted"><a href="${esc(g.entries[0].url||'#')}" target="_blank" rel="noopener">Source: peptidedosages.com</a></div></div>`:'<div class="muted" style="margin-top:8px">No Reference entry for this peptide.</div>'}</div>
 <div class="card"><b>Mixing checklist</b>${['Wash hands; swab both vial tops with alcohol and let dry','Draw '+fmt(bac,2)+' mL bacteriostatic water','Inject slowly down the inside wall of the peptide vial','Swirl gently until clear; do not shake','Label with today\'s date and refrigerate (2–8 °C)'].map((s,k)=>`<label style="display:flex;align-items:flex-start;gap:10px;margin:10px 0;font-size:15px;color:#fff"><input type="checkbox" style="width:20px;height:20px;margin:2px 0 0;flex:none"><span>${k+1}. ${esc(s)}</span></label>`).join('')}</div>
 <div class="row" style="gap:10px;flex-wrap:wrap"><button class="btn" onclick="markMixed('${p.id}')">Mark vial mixed today</button><button class="btn ghost" onclick="reconNext()">${last?'Done':'Next peptide ›'}</button></div>
 <p class="muted" style="margin-top:10px">${p.reconDate?`Current vial mixed ${esc(p.reconDate)}, expires ${expiry(p).toLocaleDateString()}. `:''}Sealed vials on hand: ${+p.vials||0}.</p>`}
window.markMixed=id=>{const p=pep(id);if(p.vials>0)p.vials--;p.bacMl=RQ.bac;p.remainingMg=+p.vialMg;p.reconDate=ymd(new Date());save();render();toast('Vial mixed · expires '+expiry(p).toLocaleDateString())};
window.reconNext=()=>{const p=pep(RQ.id);if(p&&!p.reconDate){p.bacMl=RQ.bac;save()}if(RQ.i<RQ.ids.length-1){RQ.i++;RQ.id=RQ.ids[RQ.i];RQ.bac=+pep(RQ.id).bacMl||BAC();RQ.dose=null;render();scrollTo(0,0)}else{tab='inventory';render();scrollTo(0,0)}};
window.mixNow=id=>mixFlow([id]);
const _r3=render;render=function(){if(NEWQ.length){const q=NEWQ.splice(0);RQ={ids:q.filter(id=>pep(id)),i:0,id:q[0],bac:+(pep(q[0])||{}).bacMl||BAC(),dose:null};if(RQ.ids.length)tab='recon'}_r3()};
