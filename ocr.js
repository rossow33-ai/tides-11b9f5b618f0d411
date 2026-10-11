// Load order: on-device OCR of order screenshots (Tesseract.js, lazy-loaded from CDN). No server, no keys.
(function(){
const TESS='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const ALIAS={glp3rt:'Retatrutide',glp3:'Retatrutide',retatrutide:'Retatrutide',reta:'Retatrutide',glp1s:'Semaglutide',glp2t:'Tirzepatide',mt2:'Melanotan II',melanotan2:'Melanotan II',nad:'NAD+',tesa:'Tesamorelin',ss31:'SS-31',elamipretide:'SS-31'};
let rows=[],busy=false;
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
function lev(a,b){const m=a.length,n=b.length;if(!m||!n)return Math.max(m,n);let p=[...Array(n+1).keys()];for(let i=1;i<=m;i++){const c=[i];for(let j=1;j<=n;j++)c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(a[i-1]===b[j-1]?0:1));p=c}return p[n]}
function matchName(raw){const k=norm(raw);if(!k)return{name:raw,how:'none'};
 if(ALIAS[k])return{name:ALIAS[k],how:norm(ALIAS[k])===k?'known name':'from "'+raw.trim()+'"'};
 const cands=[...S.peptides.map(p=>[p.name,'library']),...(window.PEPTIDE_REF||[]).map(g=>[g.name,'reference'])];
 for(const[c,src]of cands)if(norm(c)===k)return{name:c,how:src};
 let best=null,bs=0;for(const[c,src]of cands){const n=norm(c),s=1-lev(k,n)/Math.max(k.length,n.length);if(s>bs){bs=s;best=[c,src]}}
 return bs>=0.75?{name:best[0],how:best[1]+' ~'+Math.round(bs*100)+'%'}:{name:raw.trim(),how:'unmatched'}}
// Parse OCR text into items. Each item in these receipts ends with "Vial(s)"; names, quantities and prices may be split across lines.
function parse(text){const out=[];let t=' '+text.replace(/[|]/g,' ').replace(/\s+/g,' ')+' ';
 t=t.replace(/[\$€£]\s?\d[\d,]*\.\d{2}\b/g,' ');
 let segs=t.split(/\bvials?\b/i);if(segs.length<2)segs=t.split(/(?<=\d\s?(?:mg|mcg|iu)\b[^a-z]{0,6})/i);
 for(let s of segs){let qty=null;s=s.replace(/(?:^|\s)[x×X]\s?(\d{1,2})(?=\s|$)/g,(m,n)=>{qty=qty||+n;return ' '});
  const bac=/\b(bac|bacteriostatic)\b|\bwater\b/i.test(s);
  const m0=s.match(/(\d+(?:[.,]\d+)?)\s*(mg|mcg|iu|ml)\b/i);const m=m0&&[null,s.slice(0,m0.index),m0[1],m0[2]];
  if(!m){if(bac)out.push({name:'BAC water',size:'',unit:'mL',qty:qty||1,include:false,supply:true,how:'supply'});continue}
  let name=m[1].split(/[!?]|\b(?:subtotal|total|shipping|tax|qty|quantity|order|items?|way)\b/i).pop().replace(/[-–—:,\s]+$/,'').replace(/^[\s\-–—:,.]+/,'').trim();
  name=name.split(/\s{2,}|\b(?:\d+\s?vials?)\b/i).pop().trim();
  if(/total|shipping|tax/i.test(name)||!name)continue;
  if(bac||/water/i.test(name)){out.push({name:'BAC water',size:+m[2].replace(',','.'),unit:m[3].toLowerCase(),qty:qty||1,include:false,supply:true,how:'supply'});continue}
  const mt=bestName(name);name=mt.raw;out.push({name:mt.name,raw:name,size:+m[2].replace(',','.'),unit:m[3].toLowerCase(),qty:qty||1,include:true,how:mt.how})}
 return out}
// OCR clean-up: drop thumbnail noise tokens, fix common misreads ($8-31 -> SS-31, Il -> II), then pick the best-matching word run.
function cleanTokens(s){return s.replace(/[\[\]|“”«»~]/g,' ').split(/\s+/).map(w=>/^(Il|ll|1l|lI|11)$/.test(w)?'II':w).filter(w=>w&&!(/^[a-z]{1,2}$/.test(w)||/^[A-Z]$/.test(w)&&w!=='I'||/^[-–—,.:]+$/.test(w)))}
function variants(s){return[s,s.replace(/\$/g,'S').replace(/^S8/,'SS').replace(/^\$?8(?=-)/,'SS'),s.replace(/0/g,'O'),s.replace(/5/g,'S')]}
function bestName(name){const toks=cleanTokens(name);let best={name:toks.join(' ')||name,raw:toks.join(' ')||name,how:'unmatched',score:0};
 for(let i=0;i<toks.length;i++){const cand=toks.slice(i).join(' ');for(const v of variants(cand)){const m=matchName(v);let sc=m.how==='unmatched'?0:(m.how==='known name'||m.how.startsWith('from'))||!m.how.includes('~')?1:+m.how.match(/~(\d+)/)[1]/100;
  if(sc>best.score+1e-9||(sc===best.score&&sc>0&&cand.length>best.raw.length))best={name:m.name,raw:cand,how:m.how,score:sc}}}
 return best}
window.__parseOrder=parse;window.__matchName=matchName;
function loadScript(src){return new Promise((res,rej)=>{if(window.Tesseract)return res();const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=()=>rej(new Error('Could not load OCR engine (offline?)'));document.head.appendChild(s)})}
async function prep(file){const img=await createImageBitmap(file);const sc=Math.min(3,2400/Math.max(img.width,img.height))||1;
 const c=document.createElement('canvas');c.width=img.width*sc;c.height=img.height*sc;const x=c.getContext('2d');x.drawImage(img,0,0,c.width,c.height);
 const d=x.getImageData(0,0,c.width,c.height),p=d.data;let sum=0;for(let i=0;i<p.length;i+=4)sum+=(p[i]+p[i+1]+p[i+2])/3;const dark=sum/(p.length/4)<128;
 for(let i=0;i<p.length;i+=4){let g=(p[i]*.3+p[i+1]*.59+p[i+2]*.11);if(dark)g=255-g;g=g<150?0:255;p[i]=p[i+1]=p[i+2]=g}x.putImageData(d,0,0);return c}
async function ocr(files,onp){await loadScript(TESS);const w=await Tesseract.createWorker('eng',1,{logger:m=>{if(m.status==='recognizing text')onp(m.progress)}});
 const texts=[];for(let i=0;i<files.length;i++){onp(0,`Reading screenshot ${i+1} of ${files.length}…`);const c=await prep(files[i]);const r=await w.recognize(c);texts.push(r.data.text)}await w.terminate();return texts}
window.__ocrFiles=ocr;
function sheet(){const d=document.getElementById('dlg'),f=document.getElementById('dlgForm');
 f.innerHTML=`<h2>Review order</h2><p class="muted" style="margin-top:-6px">Check each line, then add. Nothing changes until you tap “Add to inventory”.</p>
 <div id="ocrProg" class="muted"></div><div style="overflow-x:auto"><table class="ref" id="ordT"><tr><th>✓</th><th>Name</th><th>Size</th><th>Unit</th><th>Qty</th></tr>
 ${rows.map((r,i)=>`<tr><td><input type="checkbox" data-i="${i}" data-k="include" ${r.include?'checked':''} style="width:auto"></td>
 <td><input data-i="${i}" data-k="name" value="${esc(r.name)}" style="min-width:96px"><div class="muted" style="font-size:10px">${esc(r.supply?'supply (optional)':r.how)}</div></td>
 <td><input data-i="${i}" data-k="size" type="number" step="any" value="${r.size}" style="width:58px"></td>
 <td><select data-i="${i}" data-k="unit" style="width:62px;padding:9px 4px">${['mg','mcg','iu','mL'].map(u=>`<option ${u.toLowerCase()===String(r.unit).toLowerCase()?'selected':''}>${u}</option>`).join('')}</select></td>
 <td><input data-i="${i}" data-k="qty" type="number" min="1" value="${r.qty}" style="width:46px"></td></tr>`).join('')}</table></div>
 ${rows.length?'':'<p class="muted">No items yet.</p>'}
 <div class="row" style="margin-top:10px"><button type="button" class="btn ghost sm" id="ordMore">+ Another screenshot</button><button type="button" class="btn ghost sm" id="ordRow">+ Add row</button></div>
 <div class="row" style="margin-top:14px"><span class="sp"></span><button type="button" class="btn ghost" id="ordCancel">Cancel</button><button type="button" class="btn" id="ordOk">Add to inventory</button></div>`;
 f.querySelectorAll('[data-i]').forEach(el=>el.onchange=()=>{const r=rows[+el.dataset.i],k=el.dataset.k;r[k]=k==='include'?el.checked:(k==='size'||k==='qty')?+el.value:el.value;if(k==='name'&&!r.supply){r.how=matchName(el.value).how}});
 f.querySelector('#ordMore').onclick=()=>pick();f.querySelector('#ordRow').onclick=()=>{rows.push({name:'',size:'',unit:'mg',qty:1,include:true,how:'manual'});sheet()};
 f.querySelector('#ordCancel').onclick=()=>{rows=[];d.close()};
 f.querySelector('#ordOk').onclick=()=>{const items=rows.filter(r=>r.include&&r.name&&!r.supply);const sup=rows.filter(r=>r.include&&r.supply);
  const res=window.applyItems(items.map(r=>[matchName(r.name).how==='unmatched'?r.name:matchName(r.name).name,r.unit==='mcg'?r.size/1000:+r.size,+r.qty||1,r.unit]),'Order loaded '+new Date().toLocaleDateString());
  if(sup.length){S.settings.supplies=S.settings.supplies||{};S.settings.supplies.bacWater=(S.settings.supplies.bacWater||0)+sup.reduce((a,r)=>a+(+r.qty||1),0);save()}
  rows=[];d.close();tab='inventory';render();toast(`Added ${res[1]} vials${res[0]?`, ${res[0]} new peptides`:''}${sup.length?' + BAC water':''}`)};
 if(!d.open)d.showModal()}
function pick(){const i=document.createElement('input');i.type='file';i.accept='image/*';i.multiple=true;i.style.display='none';document.body.appendChild(i);
 i.onchange=()=>{const fs=[...i.files];i.remove();if(fs.length)run(fs)};i.click()}
async function run(files){if(busy)return;busy=true;sheet();const pr=document.getElementById('ocrProg');
 const set=(p,msg)=>{if(pr)pr.innerHTML=`<div>${msg||'Reading text on this device…'} ${p?Math.round(p*100)+'%':''}</div><div class="syringe"><i style="width:${Math.round((p||0)*100)}%"></i></div>`};set(0,'Loading OCR engine (first time can take ~10 s)…');
 try{const texts=await ocr(files,set);texts.forEach(t=>rows.push(...parse(t)));if(!rows.length)toast('No order lines found; add rows manually')}catch(e){alert(e.message)}finally{busy=false;sheet()}}
window.loadOrder=()=>{rows=[];pick()};window.__orderRows=()=>rows;window.__runOrder=run;
})();
