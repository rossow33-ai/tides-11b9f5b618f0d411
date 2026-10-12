'use strict';
const KEY='peptideTracker.v1';
const SITES=['L Abdomen','R Abdomen','L Thigh','R Thigh','L Delt','R Delt','L Glute','R Glute'];
const COLORS=['#8FD3FF','#FFD166','#ffffff','#7cc4ff','#9af0b8','#ffb3b3','#c9b6ff','#4fb0ff'];
const DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
let NEWQ=[],RQ={ids:[],i:0,bac:2,dose:null,id:null};
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
 $('#view').innerHTML=({today,peptides,reference,protocols,history:historyView,inventory,data,calc:calcView,settings,suggested,recon,rpick,dplan,pconfirm,list,pdetail})[tab]()+'<p class="disc">Personal log · not medical advice</p>';
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
 return`<h2>Today <button class="btn sm ghost" onclick="logDlg()">+ Log</button></h2><button class="btn" style="width:100%;margin:4px 0 10px" onclick="startRecon()">🧪 Reconstitute vial</button>
 <div class="subtle">${items.filter(i=>!i.done).length} due · ${items.filter(i=>i.done).length} done · next site ${esc(suggestSite())}${streak()?` · ${streak()}-day streak`:''}</div>
 ${al.length?`<a class="alertline" onclick="tab='inventory';render()">⚠ ${esc(al[0][1])}${al.length>1?` · +${al.length-1} more`:''} ›</a>`:''}
 ${items.length?[['AM',items.filter(x=>!x.r.time||x.r.time<'12:00')],['PM',items.filter(x=>x.r.time&&x.r.time>='12:00')]].filter(g=>g[1].length).map(([lab,its])=>`<div class="tsec" style="margin:14px 0 6px;font-weight:700;letter-spacing:.04em;color:#cfe6ff">${lab==='AM'?'☀️ AM':'🌙 PM'} <span class="muted">${its.filter(i=>!i.done).length} due</span></div>`+its.map(({r,p,done})=>`<div class="card row duebig ${done?'done':''}" style="border-left:4px solid ${color(p.id)}">
  <div class="sp"><h3>${esc(p.name)} <span class="muted">${r.time?'· '+r.time:''}</span></h3>
  <div style="font-size:15px">${fmt(r.doseMcg)} mcg · <b style="color:var(--ac)">${fmt(units(p,r.doseMcg),1)} units</b>${units(p,r.doseMcg)>100?' <span class="pill bad">2 draws</span>':''}</div><div class="muted">${freqText(r)}${r.freq==='xweek'?` · ${weekLogs(r,d)}/${r.timesPerWeek} this week`:''}</div></div>
  ${done?'<span class="pill ok">✓ Logged</span>':`<button class="btn" onclick="quickLog('${r.id}')">Log</button>`}
  <button class="btn sm ghost" onclick="logDlg('${r.id}')" aria-label="Log with details">⋯</button></div>`).join('')).join('')
  :empty(S.peptides.length?'Nothing scheduled today.':'Welcome! Add a peptide to get started.',S.peptides.length?`<button class="btn" onclick="protoDlg()">Add protocol</button>`:`<button class="btn" onclick="pepDlg()">Add peptide</button> <button class="btn ghost" onclick="loadDemo()">Load demo data</button>`)}
 ${todays.length?`<details class="card"><summary>Logged today (${todays.length})</summary>${todays.map(logRow).join('')}</details>`:''}`}
function streak(){let n=0,d=new Date();const set=new Set(S.logs.map(l=>ymd(l.ts)));if(!set.has(ymd(d)))d.setDate(d.getDate()-1);while(set.has(ymd(d))){n++;d.setDate(d.getDate()-1)}return n}
function logRow(l){const p=pep(l.peptideId);return`<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)"><i style="width:9px;height:9px;border-radius:50%;background:${color(l.peptideId)}"></i>
 <div class="sp"><b>${esc(p?p.name:(l.deletedName?l.deletedName+' (deleted)':'(deleted)'))}</b> ${fmt(l.doseMcg)} mcg <span class="muted">· ${new Date(l.ts).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})} · ${esc(l.site||'')}</span>
 ${l.side?`<div class="muted">Side effects: ${esc(l.side)}</div>`:''}${l.notes?`<div class="muted">${esc(l.notes)}</div>`:''}</div>
 <button class="btn sm ghost" onclick="logDlg(null,'${l.id}')">Edit</button></div>`}

function peptides(){return`<h2>Peptide library <button class="btn sm" onclick="pepDlg()">+ Add</button></h2>
 ${S.peptides.length?S.peptides.map(p=>`<div class="card swipe" data-pid="${p.id}" style="border-left:4px solid ${color(p.id)}"><div class="row"><h3 class="sp">${esc(p.name)}</h3><button class="btn sm ghost" onclick="pepDlg('${p.id}')">Edit</button></div>
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

function inventory(){return`<h2>Inventory</h2><button class="btn" style="width:100%;margin:4px 0 12px" onclick="startRecon()">🧪 Reconstitute vial</button>${S.peptides.length?S.peptides.map(p=>{const st=invStatus(p),e=expiry(p);const pct=p.vialMg?Math.min(100,(p.remainingMg||0)/p.vialMg*100):0;
 return`<div class="card swipe" data-pid="${p.id}" style="border-left:4px solid ${color(p.id)}"><div class="row"><h3 class="sp">${esc(p.name)}</h3>${st.out.map(o=>`<span class="pill ${o[0]}">${o[1]}</span>`).join(' ')||'<span class="pill ok">OK</span>'}</div>
 <div class="muted" style="margin-top:4px">${fmt(p.remainingMg||0,2)} mg left in open vial · ${p.vials||0} sealed · ${isFinite(st.daysLeft)?'~'+Math.floor(st.daysLeft)+' days supply':'—'}</div><details><summary>Details & actions</summary><div class="grid" style="margin-top:8px"><div class="stat"><b>${fmt(p.remainingMg||0,2)} mg</b><span class="muted">in open vial (${Math.round(pct)}%)</span></div>
 <div class="stat"><b>${p.vials||0}</b><span class="muted">sealed vials</span></div><div class="stat"><b>${isFinite(st.daysLeft)?Math.floor(st.daysLeft)+'d':'—'}</b><span class="muted">est. supply</span></div>
 <div class="stat"><b>${e?e.toLocaleDateString(undefined,{month:'short',day:'numeric'}):'—'}</b><span class="muted">open vial expires</span></div></div>
 <div class="row" style="margin-top:10px"><button class="btn sm" onclick="openVial('${p.id}')">Open new vial</button> <button class="btn sm ghost" onclick="mixNow('${p.id}')">Mix / units</button><button class="btn sm danger" onclick="delPep('${p.id}')">Delete</button><button class="btn sm ghost" onclick="addVials('${p.id}')">+ Add sealed vials</button><button class="btn sm ghost" onclick="pepDlg('${p.id}')">Edit</button></div></details></div>`}).join(''):empty('No peptides yet.')}`}
window.openVial=id=>{const p=pep(id);if(!(p.vials>0)&&!confirm('No sealed vials recorded. Open anyway?'))return;if(p.vials>0)p.vials--;p.remainingMg=+p.vialMg;p.reconDate=ymd(new Date());save();render();toast('New vial reconstituted')};
window.addVials=id=>{const n=parseInt(prompt('How many sealed vials to add?','1'));if(n>0){pep(id).vials=(+pep(id).vials||0)+n;save();render()}};

function data(){return`<h2>Data</h2><div class="card"><h3>Backup</h3><p class="muted">Stored only on this device. Last backup: <b>${S.settings.lastBackup?new Date(S.settings.lastBackup).toLocaleString():"never"}</b></p><p class="muted" style="font-size:12px">Saves as tides-backup.json. In Files, pick the same folder and tap Replace (iOS may add “ 2” otherwise).</p>
 <div class="row"><button class="btn" onclick="exportJSON()">Export JSON</button><button class="btn ghost" onclick="exportCSV()">Export logs CSV</button>
 <label class="btn ghost" style="margin:0;color:var(--tx)">Import JSON<input type="file" accept=".json,application/json" hidden onchange="importJSON(this)"></label></div></div>
  <div class="card"><h3>Stats</h3><div class="muted">${S.peptides.length} peptides · ${S.protocols.length} protocols · ${S.logs.length} logs</div></div>
 <div class="card"><h3>Demo / reset</h3><div class="row"><button class="btn ghost" onclick="loadDemo()">Load demo data</button><button class="btn danger" onclick="if(confirm('Delete ALL data?')){S={peptides:[],protocols:[],logs:[],settings:{}};save();render()}">Erase everything</button></div></div>`}
function dl(name,txt,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([txt],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
window.exportJSON=()=>saveBackup();
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
/* delPep: see v25 delete flow below */
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
const APP_VERSION='33';
if('serviceWorker'in navigator&&location.protocol.startsWith('http')){const had=!!navigator.serviceWorker.controller;let reloading=false;
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!had||reloading)return;reloading=true;location.reload()});
 navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(reg=>{reg.update();document.addEventListener('visibilitychange',()=>{if(!document.hidden)reg.update()})}).catch(()=>{})}

// ---- Peptide Reference (data from peptidedosages.com, see reference.js)
function BAC(){return +(S.settings&&S.settings.defaultBac)||2}
// Per-peptide BAC default: large vials (>=100 mg, e.g. NAD+) use the site's mix volume when larger than the global default, else 5 mL; normal peptides use the global default (2 mL).
function bacInfo(name,mg){const i=refFind(name);let e=null;if(i>=0){const es=REF()[i].entries;e=es.find(x=>+x.vialMg===+mg)||(mg==null?es[0]:null)}
 const m=e&&(e.recon||[]).join(' ').match(/with\s+([\d.]+)\s*mL/i),site=m?+m[1]:null,g=BAC();
 if(+mg>=100){if(site&&site>g)return{ml:site,src:'site',url:e.url};if(!site)return{ml:Math.max(5,g),src:'default'}}return{ml:g,src:'global'}}
function bacFor(name,mg){return bacInfo(name,mg).ml}
const REF=()=>window.PEPTIDE_REF||[];
let refQ='';
const mcgTxt=v=>v==null?'—':v>=1000?fmt(v/1000,3)+' mg':fmt(v,1)+' mcg';
const u100=(vialMg,mcg,bac)=>vialMg&&mcg!=null?mcg/(vialMg*1000/bac)*100:null;
function refFind(name){if(!name)return-1;const n=name.toLowerCase();return REF().findIndex(g=>g.name.toLowerCase()===n)}
function refTable(g,bac0){const B=e=>bac0||bacFor(g.name,e.vialMg);const bac=bacFor(g.name,(g.entries.find(x=>x.vialMg)||{}).vialMg);return`<table class="ref"><tr><th>Vial</th><th>BAC · conc</th><th>Dose range</th><th>Units (U-100)</th><th>Freq</th><th>Site's mix</th></tr>
 ${g.entries.map(e=>{const a=u100(e.vialMg,e.minMcg,B(e)),b=u100(e.vialMg,e.maxMcg,B(e));return`<tr><td>${esc(e.vialLabel||(e.vialMg?fmt(e.vialMg)+' mg':'—'))}</td>
 <td>${e.vialMg?fmt(B(e),2)+' mL · '+fmt(e.vialMg/B(e),3)+' mg/mL':'—'}</td><td>${esc(e.doseRange)}</td>
 <td>${a==null?'<span class="muted">n/a</span>':`<b style="color:${(b||a)>100?'var(--bad)':'var(--ac)'}">${fmt(a,1)}${b!==a?'–'+fmt(b,1):''}</b>${(b||a)>100?'<br><span class="muted" style="font-size:10px">&gt;100u: 2 draws</span>':''}`}</td><td>${esc(e.freq)}</td><td class="muted">${esc(e.siteConc)} <a href="${esc(e.url)}" target="_blank" rel="noopener">src</a></td></tr>`}).join('')}</table>`}
function refCard(g,i,full){const e0=g.entries[0];return`<div class="card"><div class="row"><h3 class="sp">${esc(g.name)} <span class="pill">${esc(g.type)}</span></h3>
 <button class="btn sm" onclick="refAdd(${i})">+ Add to library</button></div>
 <div class="muted">Dose range: ${[...new Set(g.entries.map(e=>e.doseRange))].map(esc).join(' / ')} · ${[...new Set(g.entries.map(e=>e.freq))].map(esc).join(' / ')}</div>
 <details><summary>Units per vial size & notes</summary><div style="overflow-x:auto;margin-top:6px">${refTable(g)}</div>
 ${full!==false?[...new Set(g.entries.flatMap(e=>e.cycle||[]))].slice(0,2).map(c=>`<div class="ex">Cycle: “${esc(c)}”</div>`).join('')+[...new Set(g.entries.flatMap(e=>e.recon||[]))].slice(0,1).map(c=>`<div class="ex">Site reconstitution: “${esc(c)}”</div>`).join(''):''}</details>
 <div class="muted" style="margin-top:6px">Source: <a href="${esc(e0.url)}" target="_blank" rel="noopener">peptidedosages.com</a> · Units use ${fmt(BAC())} mL BAC water, or the site's larger mix volume where it uses more (e.g. NAD+). Not medical advice.</div></div>`}
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
 if(kind==='pep'){f.name.value=g.name;const ev=g.entries.find(x=>x.vialMg)||{};if(ev.vialMg){f.vialMg.value=ev.vialMg;f.remainingMg.value=ev.vialMg}f.bacMl.value=bacFor(g.name,ev.vialMg);if(!f.notes.value)f.notes.value='Ref: '+e.doseRange+' · '+e.freq+' — '+e.url}
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
function sgUnits(m,vial,name){return m/(vial*1000/(name?bacFor(name,vial):BAC()))*100}
function unitsCell(u){return u>100?`<span style="color:var(--bad)">${fmt(u,1)}u</span><br><span class="muted" style="font-size:10px">2 draws</span>`:`<span style="color:var(--ac)">${fmt(u,1)}u</span>`}
function sgProtocols(){const out=[];SG().items.forEach(it=>it.phases.forEach((ph,i)=>out.push({id:'sg-'+it.key+'-'+(i+1),peptideName:it.name,doseMcg:ph.mcg,
 freq:it.days.length===7?'daily':'weekdays',weekdays:it.days.length===7?[]:it.days,timesPerWeek:1,everyN:1,cycleOn:0,cycleOff:0,
 time:it.slot==='AM'?'08:00':'21:00',start:sgDate(ph.w[0]),end:sgDate(ph.w[1],true),active:false,note:'Suggested from '+it.url})));return out}
function mergeAdd(data){let np=0,nr=0;
 (data.peptides||[]).forEach(p=>{if(!S.peptides.some(x=>x.name.toLowerCase()===p.name.toLowerCase())){S.peptides.push({id:uid(),vialMg:0,vials:0,remainingMg:0,reorderAt:1,expiryDays:EXP(),reconDate:'',notes:'',...p,bacMl:p.bacMl||bacFor(p.name,p.vialMg)});np++}});
 (data.protocols||[]).forEach(r=>{if(r.id&&S.protocols.some(x=>x.id===r.id))return;let p=S.peptides.find(x=>x.name.toLowerCase()===String(r.peptideName||'').toLowerCase());
  if(!p){const it=(SG().items.find(i=>i.name===r.peptideName)||{vials:[0]});p={id:uid(),name:r.peptideName,vialMg:it.vials[0],bacMl:bacFor(r.peptideName,it.vials[0]),vials:0,remainingMg:0,reorderAt:1,expiryDays:EXP(),reconDate:'',notes:'Vial size not confirmed; edit to match your vial.'};S.peptides.push(p);np++}
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
 ${it.phases.map(ph=>`<tr><td>${ph.w[0]===ph.w[1]?ph.w[0]:ph.w[0]+'–'+ph.w[1]}</td><td>${sgMcgTxt(ph.mcg)}${it.days.length===1?' /wk':' /day'}</td>${it.vials.map(v=>`<td>${unitsCell(sgUnits(ph.mcg,v,it.name))}</td>`).join('')}${p&&p.vialMg&&!it.vials.includes(+p.vialMg)?`<td>${unitsCell(sgUnits(ph.mcg,p.vialMg))}</td>`:''}</tr>`).join('')}</table>
 <details><summary>From the site & why this slot</summary><div class="ex">${esc(it.site)}</div><div class="ex">Slot: ${esc(it.why)}</div></details>
 <div class="muted" style="margin-top:6px"><a href="${esc(it.url)}" target="_blank" rel="noopener">Source: peptidedosages.com</a></div></div>`}).join('')}
 <p class="muted">Red = over 100 units: more than one 1 mL U-100 syringe, so it needs 2 draws. AM/PM placement is not from the source. Educational reference only, not medical advice; review with a qualified clinician before starting.</p>`}
const ORDERS={'order-20261011':{note:'Direct Peptides order 10/11/2026',items:[['Retatrutide',10,2],['Tesamorelin',10,2],['NAD+',500,2],['SS-31',10,2],['GLOW',70,1],['Melanotan II',10,2]]}};
function applyItems(items,note){let np=0,nv=0;items.forEach(([name,mg,n,unit])=>{let p=S.peptides.find(x=>x.name.toLowerCase()===name.toLowerCase());
  if(!p){p={id:uid(),name,vialMg:mg,bacMl:bacFor(name,mg),vials:0,remainingMg:0,reorderAt:1,expiryDays:EXP(),reconDate:'',notes:''};S.peptides.push(p);np++;NEWQ.push(p.id)}
  if(unit!=='iu'&&unit!=='mL')p.vialMg=mg;p.vials=(+p.vials||0)+n;nv+=n;p.notes=[(p.notes||'').replace('Vial size not confirmed; edit to match your vial.','').trim(),`${note}: ${n}× ${mg}${unit&&unit!=='mg'?' '+unit:' mg'}`].filter(Boolean).join(' · ')});save();return[np,nv]}
window.applyItems=applyItems;
function applyOrder(key){const o=ORDERS[key];S.settings.imports=S.settings.imports||{};if(S.settings.imports[key])return null;let np=0,nv=0;
 o.items.forEach(([name,mg,n])=>{let p=S.peptides.find(x=>x.name.toLowerCase()===name.toLowerCase());
  if(!p){p={id:uid(),name,vialMg:mg,bacMl:bacFor(name,mg),vials:0,remainingMg:0,reorderAt:1,expiryDays:EXP(),reconDate:'',notes:''};S.peptides.push(p);np++;NEWQ.push(p.id)}
  p.vialMg=mg;p.vials=(+p.vials||0)+n;nv+=n;p.notes=((p.notes||'').replace('Vial size not confirmed; edit to match your vial.','').trim()+(p.notes?' · ':'')+o.note+`: ${n}× ${mg} mg`).replace(/^ · /,'')});
 S.settings.imports[key]=new Date().toISOString();save();return[np,nv]}
window.applyOrder=applyOrder;
function handleAddHash(){const m=location.hash.match(/^#add=(.+)$/);if(!m)return;
 if(m[1]==='plan-update-20261011'||m[1]==='plan-update-20261011b'){history.replaceState(null,'',location.pathname);setTimeout(()=>m[1].endsWith('b')?applyRetaB(m[1]):applyPlanUpdate(m[1]),0);return}
 if(ORDERS[m[1]]){const r=applyOrder(m[1]);window.history.replaceState(null,'',location.pathname);tab='inventory';render();toast(r?`Order added: ${r[1]} sealed vials${r[0]?`, ${r[0]} new peptides`:''}`:'Order already imported');return}if(m[1]==='suggested'){const[np,nr]=mergeAdd({protocols:sgProtocols()});history.replaceState(null,'',location.pathname);tab='suggested';render();toast(nr?`Added ${nr} paused protocols${np?`, ${np} peptides`:''}`:'Suggested schedule already added');return}try{let b=m[1].replace(/-/g,'+').replace(/_/g,'/');while(b.length%4)b+='=';
 const data=JSON.parse(decodeURIComponent(escape(atob(b))));const[np,nr]=mergeAdd(data);history.replaceState(null,'',location.pathname);tab='suggested';render();toast(`Imported ${np} peptides, ${nr} protocols (paused)`)}catch(e){console.warn('bad #add link',e)}}
window.addEventListener('hashchange',handleAddHash);setTimeout(handleAddHash,0);

// ---- Reconstitution screen (v24)

window.mixFlow=ids=>{ids=ids.filter(id=>pep(id));if(!ids.length)return;RQ={ids,i:0,id:ids[0],bac:+pep(ids[0]).bacMl||BAC(),dose:null};tab='recon';render();scrollTo(0,0)};
function reconDose(p){const r=S.protocols.find(x=>x.peptideId===p.id&&x.doseMcg);if(r)return +r.doseMcg;const i=refFind(p.name);if(i>=0){const e=REF()[i].entries.find(x=>x.minMcg!=null);if(e)return +e.minMcg}return 250}
function syringe(u){const f=Math.min(u,100),W=300,x0=40,L=220,fx=x0+L*f/100;let t='';for(let k=0;k<=100;k+=5){const x=x0+L*k/100,big=k%10===0;t+=`<line x1="${x}" y1="18" x2="${x}" y2="${big?34:28}" stroke="#cfe6ff" stroke-width="${big?1.4:.8}"/>`+(k%20===0?`<text x="${x}" y="52" fill="#cfe6ff" font-size="10" text-anchor="middle">${k}</text>`:'')}
 return`<svg viewBox="0 0 ${W} 60" width="100%" role="img" aria-label="Syringe filled to ${fmt(f,1)} units"><rect x="${x0}" y="14" width="${L}" height="24" rx="5" fill="rgba(255,255,255,.08)" stroke="#cfe6ff"/><rect x="${x0}" y="15" width="${Math.max(0,fx-x0)}" height="22" rx="4" fill="#8FD3FF" opacity=".75"/>${t}<rect x="${x0+L}" y="20" width="22" height="12" fill="#cfe6ff"/><rect x="${x0+L+22}" y="8" width="6" height="36" fill="#cfe6ff"/><line x1="${x0}" y1="26" x2="10" y2="26" stroke="#cfe6ff" stroke-width="2"/><rect x="${fx-2}" y="10" width="4" height="32" fill="#FFD166"/></svg>`}
function recon(){const p=(RQ.flow?(RQ.id?{...pep(RQ.id),vialMg:RQ.draft.vialMg}:RQ.draft):pep(RQ.id));if(!p){tab='inventory';return inventory()}
 const mg=+p.vialMg||0,bac=RQ.bac,c=bac>0?mg/bac:0,n=RQ.ids.length,last=RQ.i>=n-1;
 return`<h2>Mix ${esc(p.name)}${n>1?` <span class="muted">${RQ.i+1} of ${n}</span>`:''}</h2>
 <div class="card"><div class="row" style="gap:12px;flex-wrap:wrap"><div><label>Vial (mg)</label><input type="number" min="0" step="any" value="${mg}" style="width:110px" onchange="if(RQ.flow){RQ.draft.vialMg=+this.value||0;RQ.newSize=+this.value||0}else{pep('${p.id}').vialMg=+this.value||0;save()}render()"></div>
 <div><label>BAC water (mL)</label><div class="row" style="gap:6px;flex-wrap:wrap">${[1,2,3,5,10].map(v=>`<button class="btn sm ${bac===v?'':'ghost'}" onclick="RQ.bac=${v};render()">${v} mL</button>`).join('')}<input type="number" min="0.1" step="0.1" value="${bac}" aria-label="Custom mL" style="width:80px" onchange="RQ.bac=+this.value||2;render()"></div>${(()=>{const bi=bacInfo(p.name,mg);return`<div class="muted" style="margin-top:6px;font-size:12px">Suggested: ${fmt(bi.ml,2)} mL ${bi.src==='site'?`(peptidedosages.com mix for this vial)`:bi.src==='default'?'(large vial, no site volume: app default)':'(app default)'}</div>`})()}</div></div>
 <div style="margin-top:12px"><div class="muted">Concentration</div><b style="font-size:22px">${fmt(c,3)} mg/mL</b></div>
 ${bac>3?`<div class="muted" style="margin-top:6px">Note: ${fmt(bac,1)} mL needs a vial with that much headroom; check your vial's capacity.</div>`:''}</div>
 <div class="card"><b>Mixing checklist</b>${['Wash hands; swab both vial tops with alcohol and let dry','Draw '+fmt(bac,2)+' mL bacteriostatic water','Inject slowly down the inside wall of the peptide vial','Swirl gently until clear; do not shake','Label with today\'s date and refrigerate (2–8 °C)'].map((s,k)=>`<label style="display:flex;align-items:flex-start;gap:10px;margin:10px 0;font-size:15px;color:#fff"><input type="checkbox" style="width:20px;height:20px;margin:2px 0 0;flex:none"><span>${k+1}. ${esc(s)}</span></label>`).join('')}</div>
 ${RQ.flow?`<div class="row" style="gap:10px;flex-wrap:wrap"><button class="btn" onclick="flowMixed()">✓ Mixed</button><button class="btn ghost" onclick="startRecon()">‹ Back</button></div>`:`<div class="row" style="gap:10px;flex-wrap:wrap"><button class="btn" onclick="markMixed('${p.id}');autoPlan(pep('${p.id}'));tab='pconfirm';render();scrollTo(0,0)">✓ Mixed</button><button class="btn ghost" onclick="reconNext()">${last?'Not now':'Skip ›'}</button></div>`}
 <p class="muted" style="margin-top:10px">${p.reconDate?`Current vial mixed ${esc(p.reconDate)}, expires ${expiry(p).toLocaleDateString()}. `:''}Sealed vials on hand: ${+p.vials||0}.</p>`}
window.markMixed=id=>{const p=pep(id);if(p.vials>0)p.vials--;p.bacMl=RQ.bac;p.remainingMg=+p.vialMg;p.reconDate=ymd(new Date());save();render();toast('Vial mixed · expires '+expiry(p).toLocaleDateString())};
window.reconNext=()=>{const p=pep(RQ.id);if(p&&!p.reconDate){p.bacMl=RQ.bac;save()}if(RQ.i<RQ.ids.length-1){RQ.i++;RQ.id=RQ.ids[RQ.i];RQ.bac=+pep(RQ.id).bacMl||BAC();RQ.dose=null;tab='recon';render();scrollTo(0,0)}else{tab='list';render();scrollTo(0,0)}};
window.mixNow=id=>mixFlow([id]);
const _r3=render;
render=function(){if(NEWQ.length){const q=NEWQ.splice(0);RQ={ids:q.filter(id=>pep(id)),i:0,id:q[0],bac:+(pep(q[0])||{}).bacMl||BAC(),dose:null};if(RQ.ids.length)tab='recon'}_r3()};

// v25 migration: NAD+ (and other large vials) still at 2 mL and never mixed -> per-peptide default
(function(){let ch=0;S.peptides.forEach(p=>{if(+p.bacMl===2&&!p.reconDate&&!(S.logs||[]).some(l=>l.peptideId===p.id)){const b=bacFor(p.name,p.vialMg);if(b!==2){p.bacMl=b;ch++}}});if(ch)save()})();

// ---- v25 peptide delete with confirm, keep/delete logs, 5 s undo
window.delPep=id=>{const p=pep(id);if(!p)return;const np=S.protocols.filter(r=>r.peptideId===id).length,nl=S.logs.filter(l=>l.peptideId===id).length,nv=+p.vials||0;
 let d=$('#delDlg');if(!d){d=document.createElement('dialog');d.id='delDlg';document.body.appendChild(d)}
 d.innerHTML=`<h3 style="margin-top:0">Delete ${esc(p.name)}?</h3><p>This also removes ${np} protocol${np===1?'':'s'} and its inventory (${nv} sealed vial${nv===1?'':'s'}${+p.remainingMg?` + open vial, ${fmt(p.remainingMg,2)} mg left`:''}).</p>
 ${nl?`<p><b>${nl} past dose log${nl===1?'':'s'}</b>:</p><label style="display:flex;gap:10px;margin:6px 0"><input type="radio" name="dl" value="keep" checked style="width:auto"> Keep in History (marked as deleted peptide)</label><label style="display:flex;gap:10px;margin:6px 0"><input type="radio" name="dl" value="del" style="width:auto"> Delete them too</label>`:'<p class="muted">No dose logs.</p>'}
 <div class="row" style="gap:10px;justify-content:flex-end;margin-top:14px"><button class="btn ghost" id="delNo">Cancel</button><button class="btn danger" id="delYes">Delete</button></div>`;
 d.querySelector('#delNo').onclick=()=>d.close();
 d.querySelector('#delYes').onclick=()=>{const keep=!d.querySelector('input[name=dl][value=del]:checked');d.close();doDelete(id,keep)};
 const dl=$('#dlg');if(dl&&dl.open)dl.close();d.showModal()};
function doDelete(id,keep){const snap=JSON.stringify(S),p=pep(id);S.peptides=S.peptides.filter(x=>x.id!==id);S.protocols=S.protocols.filter(r=>r.peptideId!==id);
 if(keep)S.logs.forEach(l=>{if(l.peptideId===id)l.deletedName=p.name});else S.logs=S.logs.filter(l=>l.peptideId!==id);save();if(tab==='recon')tab='inventory';render();undoBar(`Deleted ${p.name}`,()=>{S=JSON.parse(snap);save();render();toast('Restored '+p.name)})}
window.doDelete=doDelete;
function undoBar(msg,fn){let u=$('#undoBar');if(!u){u=document.createElement('div');u.id='undoBar';u.style.cssText='position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom) + 76px);z-index:99;background:#062b57;color:#fff;border:1px solid rgba(255,255,255,.3);border-radius:12px;padding:10px 14px;display:flex;gap:14px;align-items:center;box-shadow:0 6px 24px rgba(0,0,0,.4);font-size:15px';document.body.appendChild(u)}
 clearTimeout(u._t);u.innerHTML=`<span>${esc(msg)}</span><button class="btn sm" id="undoBtn">Undo</button>`;u.style.display='flex';u.querySelector('#undoBtn').onclick=()=>{clearTimeout(u._t);u.style.display='none';fn()};u._t=setTimeout(()=>u.style.display='none',5000)}
// swipe left on a peptide card to delete
(function(){let sx=0,sy=0,el=null;document.addEventListener('touchstart',e=>{el=e.target.closest('.card.swipe');if(!el)return;sx=e.touches[0].clientX;sy=e.touches[0].clientY},{passive:true});
 document.addEventListener('touchmove',e=>{if(!el)return;const dx=e.touches[0].clientX-sx,dy=e.touches[0].clientY-sy;if(Math.abs(dy)>Math.abs(dx)){el.style.transform='';return}if(dx<0)el.style.transform=`translateX(${Math.max(dx,-120)}px)`},{passive:true});
 document.addEventListener('touchend',e=>{if(!el)return;const dx=e.changedTouches[0].clientX-sx,c=el;el=null;c.style.transition='transform .2s';c.style.transform='';setTimeout(()=>c.style.transition='',220);if(dx<-90)delPep(c.dataset.pid)})})();

// ---- v26 Reconstitute-vial flow: pick -> mix -> auto protocol
const SLOT_RULES=[[/tesamorelin|cjc|ipamorelin|sermorelin|ghrp|hexarelin|mk-?677|ghrh|modgrf/i,'PM','GH secretagogue: bedtime on an empty stomach (common convention)'],
 [/melanotan|\bmt-?2\b|\bmt-?ii\b/i,'PM','Common convention: evening dosing to sleep through nausea/flushing; the site says any consistent time'],
 [/semaglutide|tirzepatide|retatrutide|glp|cagrilintide|liraglutide|survodutide|mazdutide/i,'AM','GLP-1 type: weekly, morning (app default)'],
 [/nad|ss-?31|mots/i,'AM','Energy/mitochondrial: morning (app default)'],[/bpc|tb-?500|thymosin beta|wolverine/i,'AM','Healing peptide: morning (app default)'],[/pt-?141|bremelanotide/i,'PM','Evening (app default)']];
function slotFor(name){const i=refFind(name);if(i>=0){const t=JSON.stringify(REF()[i]);if(/\b(at bedtime|before bed(time)?)\b/i.test(t))return{slot:'PM',src:'site',why:'Site: "at bedtime"'};if(/\bin the morning\b/i.test(t)&&!/evening/i.test(t))return{slot:'AM',src:'site',why:'Site: "in the morning"'}}
 for(const[re,sl,why]of SLOT_RULES)if(re.test(name))return{slot:sl,src:'app default',why};return{slot:'AM',src:'app default',why:'No timing guidance; morning default'}}
function sgItem(name){const n=(name||'').toLowerCase();return(SG().items||[]).find(it=>it.name.toLowerCase()===n||(it.alias||'').toLowerCase()===n)}
function planFor(name,mg){const sl=slotFor(name),it=sgItem(name),base={slot:sl.slot,slotSrc:sl.src,slotWhy:sl.why,time:sl.slot==='AM'?'08:00':'21:00'};
 if(it)return{...base,...(it.user&&it.user.slot?{slot:it.user.slot,slotSrc:'your setting',slotWhy:'your setting',time:it.user.slot==='AM'?'08:00':'21:00'}:{}),phases:it.phases.map(ph=>({w:ph.w,mcg:ph.mcg})),freq:it.days.length===7?'daily':'weekdays',weekdays:it.days.length===7?[]:(it.user&&it.user.anchor?[new Date().getDay()]:it.days),timesPerWeek:1,src:it.user?'your setting':'site (titration from suggested schedule)',url:it.url};
 const i=refFind(name);if(i>=0){const es=REF()[i].entries,e=es.find(x=>+x.vialMg===+mg&&x.minMcg!=null)||es.find(x=>x.minMcg!=null);
  if(e){const xw=e.appFreq==='xweek';return{...base,phases:[{w:null,mcg:+e.minMcg}],freq:xw?'xweek':'daily',timesPerWeek:+e.timesPerWeek||1,weekdays:[],src:'site reference low dose · '+e.freq,url:e.url}}}
 return{...base,phases:[{w:null,mcg:0}],freq:'daily',timesPerWeek:1,weekdays:[],src:'no Reference dose data',url:'',noDose:true}}
let RP={q:'',name:null,mg:null,pid:null};
window.startRecon=()=>{RP={q:'',name:null,mg:null,pid:null};tab='rpick';render();scrollTo(0,0)};
function rpList(){const q=RP.q.toLowerCase(),mine=S.peptides.filter(p=>!q||p.name.toLowerCase().includes(q)),own=new Set(S.peptides.map(p=>p.name.toLowerCase())),
 ref=REF().map((g,i)=>[g,i]).filter(([g])=>!own.has(g.name.toLowerCase())&&(!q||g.name.toLowerCase().includes(q)));
 return(mine.length?`<div class="muted" style="margin:8px 0 4px">Your peptides</div>`+mine.map(p=>`<button class="btn ghost" style="display:block;width:100%;text-align:left;margin:4px 0" onclick="rpChoose('${esc(p.name).replace(/'/g,"\\'")}','${p.id}')">${esc(p.name)} <span class="muted">· ${fmt(p.vialMg)} mg · ${+p.vials||0} sealed</span></button>`).join(''):'')
 +(ref.length?`<div class="muted" style="margin:12px 0 4px">Reference (${ref.length})</div>`+ref.slice(0,60).map(([g,i])=>`<button class="btn ghost" style="display:block;width:100%;text-align:left;margin:4px 0" onclick="rpChoose(REF()[${i}].name,'')">${esc(g.name)} <span class="muted">· ${[...new Set(g.entries.map(e=>e.vialMg).filter(Boolean))].map(v=>fmt(v)+' mg').join(', ')}</span></button>`).join(''):'')
 +(q&&!mine.some(p=>p.name.toLowerCase()===q)&&!ref.some(([g])=>g.name.toLowerCase()===q)?`<button class="btn ghost" style="display:block;width:100%;margin:8px 0" onclick="rpChoose(RP.q,'')">+ Use “${esc(RP.q)}” (not in Reference)</button>`:'')}
window.rpChoose=(name,pid)=>{RP.name=name;RP.pid=pid||null;const p=pid?pep(pid):null,i=refFind(name);RP.mg=p?+p.vialMg:(i>=0?+(REF()[i].entries.find(e=>e.vialMg)||{}).vialMg||null:null);render();scrollTo(0,0)};
function rpick(){if(!RP.name)return`<h2>Reconstitute vial</h2><div class="card"><label>Step 1 · Choose a peptide</label><input id="rpq" placeholder="Search your peptides or the Reference…" value="${esc(RP.q)}" oninput="RP.q=this.value;$('#rpl').innerHTML=rpList()" autocomplete="off"><div id="rpl">${rpList()}</div></div>`;
 const i=refFind(RP.name),p=RP.pid?pep(RP.pid):null,sizes=[...new Set([...(p?[+p.vialMg]:[]),...(i>=0?REF()[i].entries.map(e=>+e.vialMg).filter(Boolean):[])])];
 return`<h2>Reconstitute ${esc(RP.name)}</h2><div class="card"><label>Step 2 · Vial size</label><div class="row" style="gap:8px;flex-wrap:wrap;margin:6px 0">${sizes.map(v=>`<button class="btn sm ${RP.mg===v?'':'ghost'}" onclick="RP.mg=${v};render()">${fmt(v)} mg</button>`).join('')}</div>
 <label>Custom (mg)</label><input type="number" min="0" step="any" value="${RP.mg??''}" onchange="RP.mg=+this.value||null;render()">
 <div class="row" style="gap:10px;margin-top:14px"><button class="btn ghost" onclick="RP.name=null;render()">‹ Back</button><button class="btn" ${RP.mg?'':'disabled'} onclick="rpGo()">Continue ›</button></div></div>`}
window.rpGo=()=>{const ex=RP.pid?pep(RP.pid):S.peptides.find(x=>x.name.toLowerCase()===RP.name.toLowerCase()),plan=planFor(RP.name,RP.mg);
 const draft={id:'__draft',name:ex?ex.name:RP.name,vialMg:RP.mg,bacMl:bacFor(RP.name,RP.mg),vials:ex?ex.vials:0,reconDate:'',remainingMg:0};
 RQ={ids:[],i:0,id:ex?ex.id:null,draft,flow:true,plan,keep:'update',bac:bacFor(RP.name,RP.mg),dose:plan.phases[0].mcg};if(ex&&+ex.vialMg!==+RP.mg)RQ.newSize=RP.mg;tab='recon';render();scrollTo(0,0)};
const FQ={daily:'day',xweek:'week'};
function flowFreqTxt(pl){return pl.freq==='daily'?'every day':pl.freq==='xweek'?(pl.timesPerWeek===1?'once a week':pl.timesPerWeek+'× a week'):(pl.weekdays||[]).map(i=>DOW[i]).join(', ')}
function flowCard(p,u){const pl=RQ.plan,ex=RQ.id?S.protocols.filter(r=>r.peptideId===RQ.id&&r.active!==false):[];
 return`<div class="card" style="border:1px solid rgba(255,255,255,.4)"><b>Your protocol</b>
 <div style="font-size:18px;margin:8px 0">Take <b>${sgMcgTxt(RQ.dose)}</b> (<b style="color:var(--ac)">${fmt(u,1)} units</b>) ${flowFreqTxt(pl)}, <b>${pl.slot}</b> (${pl.time}), starting today</div>
 ${pl.phases.length>1?`<div class="muted">Titration: ${pl.phases.map((ph,k)=>`wk ${ph.w[0]}–${ph.w[1]}: ${sgMcgTxt(k===0?RQ.dose:ph.mcg)}`).join(' → ')}</div>`:''}
 <div class="f2" style="margin-top:8px"><div><label>Frequency</label><select onchange="RQ.plan.freq=this.value;render()"><option value="daily" ${pl.freq==='daily'?'selected':''}>Daily</option><option value="xweek" ${pl.freq==='xweek'?'selected':''}>× per week</option>${pl.freq==='weekdays'?'<option value="weekdays" selected>Set weekdays</option>':''}</select></div>
 <div><label>${pl.freq==='xweek'?'Times per week':'Slot'}</label>${pl.freq==='xweek'?`<input type="number" min="1" max="7" value="${pl.timesPerWeek}" onchange="RQ.plan.timesPerWeek=+this.value||1;render()">`:`<select onchange="RQ.plan.slot=this.value;RQ.plan.time=this.value==='AM'?'08:00':'21:00';render()"><option ${pl.slot==='AM'?'selected':''}>AM</option><option ${pl.slot==='PM'?'selected':''}>PM</option></select>`}</div></div>
 ${pl.freq==='xweek'?`<label>Slot</label><select onchange="RQ.plan.slot=this.value;RQ.plan.time=this.value==='AM'?'08:00':'21:00';render()"><option ${pl.slot==='AM'?'selected':''}>AM</option><option ${pl.slot==='PM'?'selected':''}>PM</option></select>`:''}
 <label>Time</label><input type="time" value="${pl.time}" onchange="RQ.plan.time=this.value;RQ.plan.slot=this.value<'12:00'?'AM':'PM';render()">
 <details class="info"><summary>ⓘ</summary><div class="muted" style="font-size:13px">Dose: ${esc(pl.src)}${pl.url?` · <a href="${esc(pl.url)}" target="_blank" rel="noopener">source</a>`:''}<br>Time slot: <b>${esc(pl.slotSrc)}</b>, ${esc(pl.slotWhy)}</div></details>
 ${ex.length?`<div style="margin-top:10px"><b>${esc(p.name)} already has ${ex.length} active protocol${ex.length>1?'s':''}</b> (${ex.map(r=>fmt(r.doseMcg)+' mcg '+freqText(r)).map(esc).join('; ')})
 <label style="display:flex;gap:10px;margin:6px 0"><input type="radio" name="kp" style="width:auto" ${RQ.keep==='update'?'checked':''} onchange="RQ.keep='update'"> Update it to this plan</label><label style="display:flex;gap:10px;margin:6px 0"><input type="radio" name="kp" style="width:auto" ${RQ.keep==='keep'?'checked':''} onchange="RQ.keep='keep'"> Keep existing, don't add</label></div>`:''}</div>`}
function addDays(n){const d=new Date();d.setDate(d.getDate()+n);return ymd(d)}
window.flowMixed=()=>{const d=RQ.draft;let p=RQ.id?pep(RQ.id):null,isNew=!p;
 if(!p){p={id:uid(),name:d.name,vialMg:+d.vialMg,bacMl:RQ.bac,vials:0,remainingMg:0,reorderAt:1,expiryDays:EXP(),reconDate:'',notes:''};S.peptides.push(p)}
 if(RQ.newSize)p.vialMg=+RQ.newSize;if(p.vials>0)p.vials--;p.bacMl=RQ.bac;p.remainingMg=+p.vialMg;p.reconDate=ymd(new Date());save();
 RQ.isNew=isNew;autoPlan(p);tab='pconfirm';render();scrollTo(0,0)};
function dplan(){const p=pep(RQ.id);if(!p||!RQ.plan){tab='today';return today()}const u=units(p,RQ.dose);
 return`<h2>Dosing plan · ${esc(p.name)}</h2><div class="muted" style="margin-bottom:8px">${fmt(p.vialMg)} mg vial in ${fmt(p.bacMl,2)} mL (${fmt(p.vialMg/p.bacMl,3)} mg/mL). Educational reference only, not medical advice.</div>
 <div class="card"><label>Dose (mcg)</label><input type="number" min="0" step="any" value="${RQ.dose}" onchange="RQ.dose=+this.value||0;render()">
 <div style="margin:10px 0 2px;font-size:24px;font-weight:700;color:var(--ac)">${fmt(u,1)} units${u>100?' <span class="pill bad">2 draws</span>':''}</div>${syringeView(u)}<div class="muted">U-100 syringe</div></div>
 ${flowCard(p,u)}
 <div class="row" style="gap:10px;flex-wrap:wrap"><button class="btn" onclick="planSave()">Save plan</button><button class="btn ghost" onclick="tab=RQ.conf?'pconfirm':'pdetail';render();scrollTo(0,0)">Cancel</button></div>`}
function savePlan(p,pl,dose,keep){let made=0;const ex=S.protocols.filter(r=>r.peptideId===p.id&&r.active!==false);
 if(!(ex.length&&keep==='keep')){const keepId=ex[0]&&ex[0].id;S.protocols=S.protocols.filter(r=>!(r.peptideId===p.id&&r.active!==false));
  pl.phases.forEach((ph,k)=>{const mcg=k===0?dose:ph.mcg;S.protocols.push({id:k===0&&keepId?keepId:uid(),peptideId:p.id,doseMcg:+mcg||0,time:pl.time,freq:pl.freq,timesPerWeek:+pl.timesPerWeek||1,everyN:1,weekdays:pl.weekdays||[],cycleOn:0,cycleOff:0,
   start:ph.w?addDays((ph.w[0]-1)*7):ymd(new Date()),end:ph.w&&k<pl.phases.length-1?addDays(ph.w[1]*7-1):'',active:true,note:'Auto plan ('+pl.src+'; slot '+pl.slotSrc+')'});made++})}
 save();return{made,updated:ex.length>0}}
window.planSave=()=>{const p=pep(RQ.id),r=savePlan(p,RQ.plan,RQ.dose,RQ.keep);if(!RQ.flow&&!RQ.conf&&tab==='dplan'&&DP===p.id){toast('Plan saved');tab='pdetail';render();return}RQ.conf=confText(p,RQ.plan,RQ.dose,r.updated);tab='pconfirm';render();scrollTo(0,0)};
function t12(t){const[h,m]=(t||'08:00').split(':').map(Number);return`${h%12||12}:${String(m).padStart(2,'0')}`}
function confText(p,pl,dose,updated){const u=units(p,dose),f=pl.freq==='daily'?'daily':flowFreqTxt(pl);
 return{title:`${p.name} ${updated?'plan updated':'added'}`,line:pl.noDose||!dose?`Enter your dose · ${f}, ${pl.slot} ${t12(pl.time)}`:`${sgMcgTxt(dose)} (${Math.round(u)}u) ${f}, ${pl.slot} ${t12(pl.time)}`,
  tit:pl.phases.length>1?'Titration: '+pl.phases.map((ph,k)=>`wk ${ph.w[0]}–${ph.w[1]} ${sgMcgTxt(k===0?dose:ph.mcg)}`).join(' → '):'',src:`Dose: ${pl.src} · slot: ${pl.slotSrc}`,noDose:pl.noDose||!dose}}
// auto plan for a peptide (after its vial is marked mixed)
function autoPlan(p){const pl=planFor(p.name,p.vialMg),dose=pl.phases[0].mcg,r=savePlan(p,pl,dose,'update');RQ.id=p.id;RQ.plan=pl;RQ.dose=dose;RQ.keep='update';RQ.conf=confText(p,pl,dose,r.updated)}
function pconfirm(){const c=RQ.conf;if(!c){tab='today';return today()}const more=RQ.ids.length&&RQ.i<RQ.ids.length-1;
 return`<h2>Vial mixed ✓</h2><div class="card" style="border:1px solid rgba(255,255,255,.4)"><div class="muted">${esc(c.title)}</div><div style="font-size:21px;font-weight:700;margin:6px 0">${esc(c.line)}</div>
 ${c.noDose?'<div class="pill warn" style="display:inline-block;margin:4px 0">⚠ No dose in the Reference: tap Edit plan to enter your dose</div>':''}${c.tit?`<div class="muted">${esc(c.tit)}</div>`:''}<details class="info"><summary>ⓘ</summary><div class="muted" style="font-size:12px">${esc(c.src)} · starting today. Not medical advice.</div></details></div>
 <div class="row" style="gap:10px"><button class="btn" onclick="pconfDone()">${more?'Next peptide ›':'Done'}</button><button class="btn ghost" onclick="RQ.steps=null;RQ.conf.edit=1;tab='dplan';render();scrollTo(0,0)">Edit plan</button></div>`}
window.pconfDone=()=>{RQ.conf=null;if(RQ.ids.length&&RQ.i<RQ.ids.length-1){reconNext()}else{RQ.flow=false;RQ.ids=[];tab='today';render();scrollTo(0,0)}};

// ---- v29 simplification: Today = AM/PM lists, Peptides = one list + detail
const slotOf=t=>t&&t>='12:00'?'PM':'AM';
function curProto(pid){const d=new Date(),act=S.protocols.filter(r=>r.peptideId===pid&&r.active!==false);return act.find(r=>isDue(r,d))||act.find(r=>!r.start||r.start>=ymd(d))||act[0]||null}
window.toggleSlot=pid=>{const ps=S.protocols.filter(r=>r.peptideId===pid&&r.active!==false);if(!ps.length)return;const to=slotOf(ps[0].time)==='AM'?'21:00':'08:00';ps.forEach(r=>r.time=to);save();render();toast('Moved to '+slotOf(to))};
window.setTime=(pid,v)=>{if(!v)return;S.protocols.filter(r=>r.peptideId===pid&&r.active!==false).forEach(r=>r.time=v);save();render()};
function slotCtl(pid,r){return`<button class="pill slot ${slotOf(r.time)}" onclick="event.stopPropagation();toggleSlot('${pid}')" aria-label="Toggle AM/PM">${slotOf(r.time)}</button><input class="tm" type="time" value="${r.time||'08:00'}" onclick="event.stopPropagation()" onchange="setTime('${pid}',this.value)" aria-label="Time">`}
function lowLine(){const al=S.peptides.flatMap(p=>invStatus(p).out.map(o=>[o[0],p.name+': '+o[1]])).sort((x,y)=>(y[0]==='bad')-(x[0]==='bad'));return al.length?`<a class="subline" onclick="tab='list';render()">⚠ ${esc(al[0][1])}${al.length>1?` +${al.length-1}`:''}</a>`:''}
today=function(){const d=new Date(),items=[];
 S.protocols.forEach(r=>{if(!isDue(r,d))return;const p=pep(r.peptideId);if(!p)return;const done=r.freq==='xweek'?weekLogs(r,d)>=r.timesPerWeek:logsOn(p.id,d).filter(l=>l.protocolId===r.id).length>0;items.push({r,p,done})});
 items.sort((a,b)=>(a.r.time||'').localeCompare(b.r.time||''));
 const row=({r,p,done})=>{const lg=logsOn(p.id,d).find(l=>l.protocolId===r.id),diff=lg&&+lg.doseMcg!==+r.doseMcg;return`<div class="trow2 ${done?'done':''}"><button class="chk ${done?'on':''}" onclick="${lg?`unlog('${lg.id}')`:done?'':`quickLog('${r.id}')`}" aria-label="${done?'Undo taken':'Mark taken'}">${done?'✓':''}</button>
  <div class="sp" onclick="doseSheet('${r.id}')"><b>${esc(p.name)}</b><div class="muted">${diff?`<b style="color:#FFD166">${sgMcgTxt(lg.doseMcg)} · ${fmt(units(p,lg.doseMcg),1)}u</b> <s>${sgMcgTxt(r.doseMcg)}</s>`:r.doseMcg?sgMcgTxt(r.doseMcg)+' · '+fmt(units(p,r.doseMcg),1)+'u':'set dose'}${lg?' · '+new Date(lg.ts).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):''}</div></div>${slotCtl(p.id,r)}</div>`};
 const sec=(lab,its)=>`<div class="slothd">${lab==='AM'?'☀️ AM':'🌙 PM'}</div>${its.length?its.map(row).join(''):'<div class="muted" style="padding:6px 2px">Nothing</div>'}`;
 return`<h2>Today</h2><button class="btn big" onclick="startRecon()">🧪 Reconstitute vial</button>${lowLine()}
 ${items.length?sec('AM',items.filter(x=>slotOf(x.r.time)==='AM'))+sec('PM',items.filter(x=>slotOf(x.r.time)==='PM')):`<div class="muted" style="margin-top:16px;text-align:center">${S.peptides.length?'Nothing due today.':'No peptides yet. Tap Reconstitute vial to start.'}</div>`}`};
let DP=null;window.openPep=id=>{DP=id;tab='pdetail';render();scrollTo(0,0)};
function list(){return`<h2>Peptides <button class="btn sm ghost" onclick="pepDlg()">+ Add</button></h2>
 ${S.peptides.length?S.peptides.map(p=>{const r=curProto(p.id),st=invStatus(p);return`<div class="card swipe pcard" data-pid="${p.id}" onclick="openPep('${p.id}')">
  <div class="row"><b class="sp" style="font-size:17px">${esc(p.name)}</b>${r?slotCtl(p.id,r):''}</div>
  <div class="muted">${r&&r.doseMcg?sgMcgTxt(r.doseMcg)+' · ':''}${+p.vials||0} sealed${p.reconDate?` · ${fmt(p.remainingMg||0,1)} mg open`:''}${st.out.some(o=>o[0]==='bad')?' · <span style="color:var(--bad)">⚠</span>':''}</div></div>`}).join(''):`<div class="muted" style="text-align:center;margin-top:20px">No peptides yet.</div>`}`}
function pdetail(){const p=pep(DP);if(!p){tab='list';return list()}const e=expiry(p),ps=S.protocols.filter(r=>r.peptideId===p.id).sort((a,b)=>(a.start||'').localeCompare(b.start||'')),act=ps.filter(r=>r.active!==false),r=curProto(p.id);
 return`<h2 style="justify-content:flex-start;gap:10px"><button class="btn sm ghost" onclick="tab='list';render()" aria-label="Back">‹</button>${esc(p.name)}</h2>
 <div class="card"><div class="grid"><div class="stat"><b>${+p.vials||0}</b><span class="muted">sealed</span></div><div class="stat"><b>${fmt(p.remainingMg||0,1)} mg</b><span class="muted">open vial</span></div><div class="stat"><b>${e?e.toLocaleDateString(undefined,{month:'short',day:'numeric'}):'—'}</b><span class="muted">expires</span></div></div>
 <div class="muted" style="margin-top:6px">${fmt(p.vialMg)} mg vial · ${fmt(p.bacMl,2)} mL BAC${p.bacMl?` · ${fmt(p.vialMg/p.bacMl,2)} mg/mL`:''}</div></div>
 <div class="card"><div class="row"><b class="sp">Plan</b>${r?slotCtl(p.id,r):''}</div>
 ${act.length?act.map(x=>`<div class="row" style="padding:6px 0;border-top:1px solid var(--line)"><div class="sp">${x.doseMcg?sgMcgTxt(x.doseMcg)+' · '+fmt(units(p,x.doseMcg),1)+'u':'set dose'} <span class="muted">${freqText(x)}${x.start&&x.start>ymd(new Date())?' · from '+x.start.slice(5):''}</span></div><button class="btn sm ghost" onclick="protoDlg('${x.id}')" aria-label="Edit">✎</button></div>`).join(''):'<div class="muted">No plan yet.</div>'}
 ${act[0]&&act[0].note?`<details class="info"><summary>ⓘ</summary><div class="muted">${esc(act[0].note)}</div></details>`:''}
 <div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap"><button class="btn sm" onclick="pdPlan('${p.id}')">${act.length?'Edit plan':'Auto plan'}</button>${ps.length>act.length?`<span class="muted">${ps.length-act.length} paused</span>`:''}</div></div>
 <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" onclick="mixNow('${p.id}')">🧪 Mix vial</button><button class="btn ghost" onclick="addVials('${p.id}')">+ Vials</button><button class="btn ghost" onclick="pepDlg('${p.id}')">Edit</button><button class="btn danger" onclick="delPep('${p.id}')">Delete</button></div>`}
window.pdPlan=id=>{const p=pep(id),pl=planFor(p.name,p.vialMg),r=curProto(id);if(r){pl.time=r.time||pl.time;pl.slot=slotOf(pl.time)}RQ={ids:[],i:0,id,flow:false,plan:pl,dose:r&&r.doseMcg?r.doseMcg:pl.phases[0].mcg,keep:'update',bac:p.bacMl};tab='dplan';render();scrollTo(0,0)};
const ALIAS={inventory:'list',peptides:'list',protocols:'list'};
const _r4=render;render=function(){if(ALIAS[tab])tab=ALIAS[tab];_r4();document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===tab||(b.dataset.tab==='list'&&tab==='pdetail')))};

// ---- v30 un-log + edit amount
function invSnap(p){return{vials:+p.vials||0,remainingMg:+p.remainingMg||0,reconDate:p.reconDate||''}}
function logDose(rid,mcg,ts){const r=S.protocols.find(x=>x.id===rid),p=pep(r.peptideId),inv=invSnap(p);applyInventory(p.id,+mcg,1);
 const l={id:uid(),peptideId:p.id,protocolId:r.id,ts:ts||Date.now(),doseMcg:+mcg,site:suggestSite(),notes:'',side:'',inv};S.logs.push(l);save();return l}
window.quickLog=rid=>{const r=S.protocols.find(x=>x.id===rid);if(!r)return;logDose(rid,r.doseMcg);render();toast('Logged')};
function reverseLog(l){const p=pep(l.peptideId);if(!p)return;const later=S.logs.some(x=>x.peptideId===l.peptideId&&x.id!==l.id&&x.ts>l.ts);
 if(l.inv&&!later){p.vials=l.inv.vials;p.remainingMg=l.inv.remainingMg;p.reconDate=l.inv.reconDate}
 else{let mg=(+p.remainingMg||0)+l.doseMcg/1000;while(mg>+p.vialMg&&+p.vialMg>0){mg-=+p.vialMg;p.vials=(+p.vials||0)+1}p.remainingMg=+mg.toFixed(4)}}
window.unlog=lid=>{const l=S.logs.find(x=>x.id===lid);if(!l)return;const snap=JSON.stringify(S);reverseLog(l);S.logs=S.logs.filter(x=>x.id!==lid);save();render();
 undoBar('Dose un-logged',()=>{S=JSON.parse(snap);save();render()})};
let DS=null;
window.doseSheet=rid=>{const r=S.protocols.find(x=>x.id===rid),p=pep(r.peptideId),lg=logsOn(p.id,new Date()).find(l=>l.protocolId===rid),now=new Date();
 DS={rid,lid:lg?lg.id:null,plan:+r.doseMcg||0,mcg:lg?+lg.doseMcg:+r.doseMcg||0,time:(lg?new Date(lg.ts):now).toTimeString().slice(0,5)};
 let d=$('#doseDlg');if(!d){d=document.createElement('dialog');d.id='doseDlg';document.body.appendChild(d)}dsDraw();d.showModal()};
function dsDraw(){const r=S.protocols.find(x=>x.id===DS.rid),p=pep(r.peptideId),d=$('#doseDlg'),u=units(p,DS.mcg),big=DS.plan>=1000;
 d.innerHTML=`<h3 style="margin:0 0 4px">${esc(p.name)}</h3><div class="muted" style="margin-bottom:10px">Plan ${DS.plan?sgMcgTxt(DS.plan):'—'}</div>
 <div style="display:flex;flex-wrap:nowrap;gap:8px;align-items:center"><button class="btn ghost" onclick="dsSet(DS.mcg-${big?250:10})" aria-label="Less">−</button>
 <input id="dsAmt" type="number" step="any" min="0" value="${big?fmt(DS.mcg/1000,3):fmt(DS.mcg)}" style="text-align:center;font-size:20px;width:auto;flex:1;min-width:0" onchange="dsSet(this.value*${big?1000:1})"><span>${big?'mg':'mcg'}</span>
 <button class="btn ghost" onclick="dsSet(DS.mcg+${big?250:10})" aria-label="More">+</button></div>
 <div style="font-size:22px;font-weight:700;color:var(--ac);margin:8px 0">${fmt(u,1)} units</div><div id="dsSyr" style="margin:2px 0 10px">${syringeView(u)}</div>
 ${DS.plan?`<div class="row" style="gap:8px">${[['½',.5],['Full',1],['1.5×',1.5]].map(([t,k])=>`<button class="btn sm ${DS.mcg===DS.plan*k?'':'ghost'}" onclick="dsSet(${DS.plan*k})">${t}</button>`).join('')}</div>`:''}
 <label style="margin-top:10px">Time</label><input id="dsTime" type="time" value="${DS.time}" onchange="DS.time=this.value">
 <div class="row" style="gap:10px;justify-content:flex-end;margin-top:14px"><button class="btn ghost" onclick="$('#doseDlg').close()">Cancel</button><button class="btn" onclick="dsSave()">${DS.lid?'Save':'Log dose'}</button></div>`}
window.dsSet=v=>{DS.mcg=Math.max(0,+(+v).toFixed(3));DS.time=$('#dsTime')?$('#dsTime').value:DS.time;dsDraw()};
window.dsSave=()=>{const t=new Date(),[h,m]=(DS.time||'08:00').split(':');t.setHours(+h,+m,0,0);
 if(DS.lid){const l=S.logs.find(x=>x.id===DS.lid),delta=DS.mcg-l.doseMcg;if(delta>0)applyInventory(l.peptideId,delta,1);else if(delta<0){const p=pep(l.peptideId);p.remainingMg=+((+p.remainingMg||0)-delta/1000).toFixed(4)}
  l.doseMcg=DS.mcg;l.ts=+t;delete l.inv;save()}else logDose(DS.rid,DS.mcg,+t);
 $('#doseDlg').close();render();toast('Saved')};

// ---- v31 realistic U-100 1 mL syringe
function syr1(u){u=Math.max(0,Math.min(100,u));const X0=44,L=180,k=L/100,fx=X0+u*k,cy=30;let t='';
 for(let i=2;i<=100;i+=2){const x=X0+i*k,maj=i%10===0;t+=`<line x1="${x.toFixed(1)}" y1="${cy-14}" x2="${x.toFixed(1)}" y2="${cy-14+(maj?9:i%10===5?6:4)}" stroke="#0b2f5e" stroke-width="${maj?1.1:.6}"/>`+(maj?`<text x="${x.toFixed(1)}" y="${cy+26}" font-size="10.5" fill="#cfe6ff" text-anchor="middle">${i}</text>`:'')}
 const rodEnd=fx+118;
 return`<svg viewBox="0 0 356 62" width="100%" style="display:block;max-width:100%" role="img" aria-label="Syringe filled to ${fmt(u,1)} units">
 <defs><linearGradient id="brl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".95"/><stop offset=".5" stop-color="#eaf6ff" stop-opacity=".85"/><stop offset="1" stop-color="#bfe0ff" stop-opacity=".9"/></linearGradient>
 <linearGradient id="fld" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fdcff"/><stop offset="1" stop-color="#4fb0ff"/></linearGradient></defs>
 <line x1="2" y1="${cy}" x2="32" y2="${cy}" stroke="#dfe9f3" stroke-width="1.6" stroke-linecap="round"/><path d="M30 ${cy-4}h8l6 2v4l-6 2h-8z" fill="#FFB547"/>
 <rect x="${X0}" y="${cy-14}" width="${L+9}" height="28" rx="3" fill="url(#brl)" stroke="#e6f2ff"/>
 ${u>0?`<rect x="${X0+1}" y="${cy-12}" width="${Math.max(0,fx-X0-1).toFixed(1)}" height="24" fill="url(#fld)" opacity=".85"/>`:''}${t}
 <rect x="${(fx).toFixed(1)}" y="${cy-13}" width="7" height="26" rx="1.5" fill="#1d2633"/><rect x="${(fx+7).toFixed(1)}" y="${cy-3}" width="${(rodEnd-fx-7).toFixed(1)}" height="6" fill="#f4f8fc" stroke="#cfe6ff" stroke-width=".6"/>
 <rect x="${X0+L+9}" y="${cy-22}" width="6" height="44" rx="2" fill="#f4f8fc" stroke="#cfe6ff" stroke-width=".6"/>
 <rect x="${rodEnd.toFixed(1)}" y="${cy-15}" width="6" height="30" rx="2" fill="#f4f8fc" stroke="#cfe6ff" stroke-width=".6"/></svg>`}
function syringeView(u){if(!(u>0))return syr1(0);if(u<=100.0001)return syr1(u);const n=Math.ceil(u/100-1e-9);let h='',left=u;for(let i=0;i<n;i++){const v=Math.min(100,left);left-=v;h+=`<div class="muted" style="font-size:12px;margin-top:4px">Draw ${i+1}: ${fmt(v,1)}u</div>`+syr1(v)}
 return`<div class="pill bad" style="display:inline-block;margin:4px 0">${n} draws</div>`+h}

// ---- v32 backup prompt + fixed-name backup
function backupText(){return JSON.stringify({app:'Tides',version:1,exported:new Date().toISOString(),...S},null,2)}
window.saveBackup=async()=>{const txt=backupText(),name='tides-backup.json',f=new File([txt],name,{type:'application/json'});
 const mark=()=>{S.settings.lastBackup=Date.now();save();if(tab==='data')render();toast('Backup saved')};
 if(navigator.canShare&&navigator.canShare({files:[f]})){try{await navigator.share({files:[f],title:'Tides backup'});mark();return}catch(e){if(e&&e.name==='AbortError')return}}
 const a=document.createElement('a');a.href=URL.createObjectURL(f);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000);mark()};
function dueToday(){const d=new Date(),it=[];S.protocols.forEach(r=>{if(!isDue(r,d))return;const p=pep(r.peptideId);if(!p)return;it.push(r.freq==='xweek'?weekLogs(r,d)>=r.timesPerWeek:logsOn(p.id,d).some(l=>l.protocolId===r.id))});return it}
function checkAllDone(){const it=dueToday(),k=ymd(new Date()),all=it.length&&it.every(Boolean);
 if(!all){if(S.settings.bkPrompt===k){delete S.settings.bkPrompt;save()}return}
 if(S.settings.bkPrompt===k)return;S.settings.bkPrompt=k;save();
 let d=$('#bkDlg');if(!d){d=document.createElement('dialog');d.id='bkDlg';document.body.appendChild(d)}
 d.innerHTML=`<h3 style="margin:0 0 6px">All done today ✓</h3><p style="margin:0 0 4px">Save backup?</p><p class="muted" style="font-size:12px;margin:0 0 12px">Saves tides-backup.json. Pick the same folder and choose Replace.</p>
 <div class="row" style="gap:10px;justify-content:flex-end"><button class="btn ghost" onclick="$('#bkDlg').close()">Not now</button><button class="btn" onclick="$('#bkDlg').close();saveBackup()">Save</button></div>`;d.showModal()}
for(const fn of ['quickLog','dsSave','unlog']){const o=window[fn];window[fn]=(...a)=>{const r=o(...a);setTimeout(checkAllDone,50);return r}}

// ---- v32 Tom's personal dosing defaults (override Reference/suggested)
const USER_DEFAULTS={'ss-31':{slot:'AM',days:[0,1,2,3,4,5,6],phases:[{w:[1,8],mcg:2000}],note:'Your setting: 2 mg daily, flat (no titration).'},
 'retatrutide':{anchor:true,phases:[{w:[1,1],mcg:1000},{w:[2,5],mcg:2000},{w:[6,12],mcg:4000}],note:'Your setting: 1 mg week 1 only, then the site\'s steps: 2 mg weeks 2–5, 4 mg from week 6. Weekly on the weekday of the first dose.'}};
(SG().items||[]).forEach(it=>{const u=USER_DEFAULTS[it.name.toLowerCase()]||USER_DEFAULTS[(it.alias||'').toLowerCase()];if(!u)return;it.phases=u.phases;if(u.days)it.days=u.days;if(u.slot)it.slot=u.slot;it.user=u;it.site=u.note+' Site: '+it.site;it.why=(u.slot?'Your setting: '+u.slot+'. ':'')+it.why});
function applyPlanUpdate(key){S.settings.imports=S.settings.imports||{};if(S.settings.imports[key]){tab='list';render();toast('Plan update already applied');return}
 const out=[];['SS-31','Retatrutide'].forEach(n=>{const p=S.peptides.find(x=>x.name.toLowerCase()===n.toLowerCase()||(n==='Retatrutide'&&/glp-?3/i.test(x.name)));if(!p)return;
  const act=S.protocols.filter(r=>r.peptideId===p.id&&r.active!==false),paused=S.protocols.filter(r=>r.peptideId===p.id&&r.active===false),pl=planFor(n,p.vialMg);
  if(act[0]&&act[0].time){pl.time=act[0].time;pl.slot=slotOf(pl.time)}if(n==='SS-31'){pl.time=act[0]&&slotOf(act[0].time)==='AM'?act[0].time:'08:00';pl.slot='AM'}
  if(act.length){savePlan(p,pl,pl.phases[0].mcg,'update');out.push(n)}
  else if(paused.length){S.protocols=S.protocols.filter(r=>!(r.peptideId===p.id&&r.active===false));savePlan(p,pl,pl.phases[0].mcg,'update');S.protocols.forEach(r=>{if(r.peptideId===p.id)r.active=false});out.push(n+' (paused)')}});
 S.settings.imports[key]=new Date().toISOString();save();tab='list';render();toast(out.length?'Updated: '+out.join(', '):'No SS-31/Retatrutide plans found')}

// ---- v33 Retatrutide correction link: 1 mg wk1, 2 mg wk2-5, 4 mg wk6+, weekly on start weekday
function applyRetaB(key){S.settings.imports=S.settings.imports||{};if(S.settings.imports[key]){tab='list';render();toast('Retatrutide update already applied');return}
 const p=S.peptides.find(x=>/retatrutide|glp-?3/i.test(x.name));if(!p){toast('No Retatrutide found');return}
 const mine=S.protocols.filter(r=>r.peptideId===p.id),act=mine.filter(r=>r.active!==false),use=act.length?act:mine;if(!use.length){toast('No Retatrutide plan to update');return}
 const prev=S.settings.imports['plan-update-20261011'],ex=use.map(r=>r.start).filter(Boolean).sort()[0],t=ymd(new Date());
 const start=prev&&ex?ex:t,sd=parseD(start),dow=sd.getDay(),active=act.length>0,time=use[0].time||'08:00';
 const add=n=>{const d=parseD(start);d.setDate(d.getDate()+n);return ymd(d)},keepId=use[0].id;
 S.protocols=S.protocols.filter(r=>!use.includes(r));
 [[0,6,1000],[7,34,2000],[35,null,4000]].forEach(([a,b,mcg],k)=>S.protocols.push({id:k===0?keepId:uid(),peptideId:p.id,doseMcg:mcg,time,freq:'weekdays',weekdays:[dow],timesPerWeek:1,everyN:1,cycleOn:0,cycleOff:0,start:add(a),end:b==null?'':add(b),active,note:'Your setting: 1 mg wk 1, 2 mg wk 2–5, 4 mg wk 6+ (site steps)'}));
 S.settings.imports[key]=new Date().toISOString();save();tab='list';render();toast(`Retatrutide: 1 mg ${add(0)}, 2 mg from ${add(7)}, 4 mg from ${add(35)}`)}

// ---- v33 step editor for plans
function stepsFromProtos(list){const ps=list.slice().sort((a,b)=>(a.start||'').localeCompare(b.start||''));return ps.map((r,k)=>({mcg:+r.doseMcg||0,weeks:k<ps.length-1&&r.start&&r.end?Math.max(1,Math.round((parseD(r.end)-parseD(r.start))/864e5+1)/7):null}))}
function stepsFromPlan(pl,dose){return pl.phases.map((ph,k)=>({mcg:k===0?+dose||0:+ph.mcg,weeks:k<pl.phases.length-1&&ph.w?ph.w[1]-ph.w[0]+1:null}))}
function planInit(){if(RQ.steps)return;const act=S.protocols.filter(r=>r.peptideId===RQ.id&&r.active!==false);
 if(act.length){RQ.steps=stepsFromProtos(act);const f=act[0];RQ.plan=Object.assign(RQ.plan||{},{freq:f.freq,timesPerWeek:f.timesPerWeek||1,weekdays:f.weekdays||[],time:f.time||'08:00'});RQ.plan.slot=slotOf(RQ.plan.time);RQ.start=act.map(r=>r.start).filter(Boolean).sort()[0]||ymd(new Date())}
 else{RQ.steps=stepsFromPlan(RQ.plan,RQ.dose);RQ.start=(act.map(r=>r.start).filter(Boolean).sort()[0])||ymd(new Date())}}
const dAdd=(s,n)=>{const d=parseD(s);d.setDate(d.getDate()+n);return d};
const dFmt=d=>d.toLocaleDateString(undefined,{month:'short',day:'numeric'});
dplan=function(){const p=pep(RQ.id);if(!p||!RQ.plan){tab='today';return today()}planInit();const pl=RQ.plan;let off=0;
 const rows=RQ.steps.map((st,k)=>{const last=k===RQ.steps.length-1,w=st.weeks,a=dAdd(RQ.start,off*7),b=w?dAdd(RQ.start,(off+w)*7-1):null;off+=w||0;const u=units(p,st.mcg);
  return`<div class="card" style="padding:10px 12px;margin-bottom:8px"><div style="display:flex;gap:8px;align-items:center;flex-wrap:nowrap">
  <span class="muted" style="width:18px">${k+1}</span><input type="number" step="any" min="0" value="${fmt(st.mcg/1000,4)}" style="width:auto;flex:1;min-width:0" onchange="RQ.steps[${k}].mcg=(+this.value||0)*1000;render()" aria-label="Dose mg"><span>mg</span>
  <input type="number" min="1" step="1" placeholder="∞" value="${w||''}" style="width:58px" onchange="RQ.steps[${k}].weeks=+this.value||null;render()" aria-label="Weeks"><span class="muted">wk</span>
  <button class="btn sm ghost" ${RQ.steps.length<2?'disabled':''} onclick="RQ.steps.splice(${k},1);render()" aria-label="Delete step">✕</button></div>
  <div class="muted" style="margin-top:4px">${fmt(u,1)}u${u>100?' · <span style="color:var(--bad)">2 draws</span>':''} · ${dFmt(a)} – ${b?dFmt(b):'ongoing'}${!w&&!last?' · <span style="color:#FFD166">set weeks</span>':''}</div></div>`}).join('');
 return`<h2 style="justify-content:flex-start;gap:10px"><button class="btn sm ghost" onclick="tab=RQ.conf?'pconfirm':'pdetail';render()" aria-label="Back">‹</button>Plan · ${esc(p.name)}</h2>
 <div class="card"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button class="pill slot ${pl.slot}" onclick="RQ.plan.slot=RQ.plan.slot==='AM'?'PM':'AM';RQ.plan.time=RQ.plan.slot==='AM'?'08:00':'21:00';render()">${pl.slot}</button>
 <input class="tm" type="time" value="${pl.time}" onchange="RQ.plan.time=this.value;RQ.plan.slot=slotOf(this.value);render()">
 <select style="width:auto" onchange="RQ.plan.freq=this.value;if(this.value==='weekdays'&&!(RQ.plan.weekdays||[]).length)RQ.plan.weekdays=[parseD(RQ.start).getDay()];render()"><option value="daily" ${pl.freq==='daily'?'selected':''}>Daily</option><option value="weekdays" ${pl.freq==='weekdays'?'selected':''}>Weekly (${pl.freq==='weekdays'?(pl.weekdays||[]).map(i=>DOW[i]).join(','):DOW[parseD(RQ.start).getDay()]})</option><option value="xweek" ${pl.freq==='xweek'?'selected':''}>× per week</option></select>
 ${pl.freq==='xweek'?`<input type="number" min="1" max="7" value="${pl.timesPerWeek||1}" style="width:60px" onchange="RQ.plan.timesPerWeek=+this.value||1;render()">`:''}</div>
 <label style="margin-top:8px">Start</label><input type="date" value="${RQ.start}" onchange="RQ.start=this.value||ymd(new Date());if(RQ.plan.freq==='weekdays')RQ.plan.weekdays=[parseD(RQ.start).getDay()];render()"></div>
 ${rows}<button class="btn sm ghost" onclick="const l=RQ.steps[RQ.steps.length-1];if(!l.weeks)l.weeks=4;RQ.steps.push({mcg:l.mcg,weeks:null});render()">+ Add step</button>
 <div class="row" style="gap:10px;margin-top:14px"><button class="btn" onclick="planSave()">Save plan</button><button class="btn ghost" onclick="tab=RQ.conf?'pconfirm':'pdetail';render();scrollTo(0,0)">Cancel</button></div>`};
window.planSave=()=>{const p=pep(RQ.id),pl=RQ.plan;const old=S.protocols.filter(r=>r.peptideId===p.id&&r.active!==false),keepId=old[0]&&old[0].id;
 S.protocols=S.protocols.filter(r=>!(r.peptideId===p.id&&r.active!==false));let off=0;
 RQ.steps.forEach((st,k)=>{const w=k<RQ.steps.length-1?(st.weeks||1):st.weeks,a=dAdd(RQ.start,off*7),b=w?dAdd(RQ.start,(off+w)*7-1):null;off+=w||0;
  S.protocols.push({id:k===0&&keepId?keepId:uid(),peptideId:p.id,doseMcg:+st.mcg,time:pl.time,freq:pl.freq,timesPerWeek:+pl.timesPerWeek||1,everyN:1,weekdays:pl.freq==='weekdays'?(pl.weekdays&&pl.weekdays.length?pl.weekdays:[parseD(RQ.start).getDay()]):[],cycleOn:0,cycleOff:0,start:ymd(a),end:b?ymd(b):'',active:true,note:(old[0]&&old[0].note)||'Edited plan'})});
 let o2=0;const ph=RQ.steps.map(st=>{const w=st.weeks,r={w:w?[o2+1,o2+w]:[o2+1,o2+1],mcg:st.mcg};o2+=w||0;return r});save();RQ.steps=null;if(RQ.conf){RQ.conf=confText(p,{...pl,phases:ph},ph[0].mcg,true);tab='pconfirm'}else{DP=p.id;tab='pdetail'}render();scrollTo(0,0);toast('Plan saved')};
window.pdPlan=id=>{const p=pep(id),pl=planFor(p.name,p.vialMg);RQ={ids:[],i:0,id,flow:false,plan:pl,dose:pl.phases[0].mcg,keep:'update',bac:p.bacMl,steps:null,conf:null};DP=id;tab='dplan';render();scrollTo(0,0)};
