// Wind & tide report (Wind tab).
(function(){
const API='https://api.tidesandcurrents.noaa.gov/api/prod/datagetter',MD='https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions';
const DEF=[{id:'8723651',name:'Largo Sound, Key Largo',label:'Key Largo',state:'FL',lat:25.14,lng:-80.395,tz:-5,type:'S'}];
const NODST=['HI','PR','VI','AS','GU','MP','UM'];
const LS={get:(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch(e){return d}},set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
let slots=LS.get('tideSlots',null)||DEF.slice(),cur=Math.max(0,Math.min(LS.get('tideCur',0),slots.length-1)),data={},wind={},obsD=[];
const el=document.getElementById('tide');const $t=s=>el.querySelector(s);
const pad=n=>String(n).padStart(2,'0');
function nthSun(y,m,n){const d=new Date(Date.UTC(y,m,1));const f=(7-d.getUTCDay())%7;return 1+f+7*(n-1)}
function offset(st,utcMs){let o=+st.tz;if(NODST.includes(st.state)||o<=-10)return o;const d=new Date(utcMs+o*3600e3),y=d.getUTCFullYear();
 const s=Date.UTC(y,2,nthSun(y,2,2),2)-o*3600e3,e=Date.UTC(y,10,nthSun(y,10,1),2)-(o+1)*3600e3;return utcMs>=s&&utcMs<e?o+1:o}
const localNow=st=>{const u=Date.now();return u+offset(st,u)*3600e3}; // ms where UTC getters read station-local wall time
const parseT=s=>{const[a,b]=s.split(' ');const[y,m,d]=a.split('-').map(Number);const[h,mi]=b.split(':').map(Number);return Date.UTC(y,m-1,d,h,mi)};
const ymd=ms=>{const d=new Date(ms);return d.getUTCFullYear()+pad(d.getUTCMonth()+1)+pad(d.getUTCDate())};
const hm=ms=>{const d=new Date(ms);let h=d.getUTCHours(),m=d.getUTCMinutes();const ap=h<12?'AM':'PM';h=h%12||12;return h+':'+pad(m)+' '+ap};
const dayName=ms=>['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(ms).getUTCDay()];
async function getJSON(u){const r=await fetch(u,{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);const j=await r.json();if(j.error)throw new Error(j.error.message);return j}
async function load(st,force){const key='tideCache:'+st.id,c=LS.get(key,null),now=localNow(st);
 if(c&&!force&&Date.now()-c.at<3600e3&&c.day===ymd(now))return c;
 const q=`&station=${st.id}&product=predictions&datum=MLLW&units=english&time_zone=lst_ldt&format=json&application=tides_app`;
 try{const y=ymd(now-864e5),t=ymd(now);
  const hl=await getJSON(`${API}?begin_date=${y}&range=96&interval=hilo${q}`);
  let curve=null;try{const cv=await getJSON(`${API}?begin_date=${t}&range=48${q}`);curve=cv.predictions.map(p=>[parseT(p.t),+p.v])}catch(e){}
  const out={at:Date.now(),day:t,hilo:hl.predictions.map(p=>[parseT(p.t),+p.v,p.type]),curve,src:curve?'6-minute predictions':'interpolated from high/low predictions'};
  LS.set(key,out);return out}catch(e){if(c)return{...c,stale:true,err:e.message};throw e}}
function valAt(d,t){if(d.curve){const c=d.curve;for(let i=1;i<c.length;i++)if(c[i][0]>=t){const[a,va]=c[i-1],[b,vb]=c[i];return va+(vb-va)*(t-a)/(b-a)}}
 const h=d.hilo;for(let i=1;i<h.length;i++)if(h[i][0]>=t){const[a,va]=h[i-1],[b,vb]=h[i];const f=(t-a)/(b-a);return va+(vb-va)*(1-Math.cos(Math.PI*f))/2}return null}
// Sunrise/sunset (NOAA solar approximation), returns station-local ms
function sun(st,dayMs){const d=new Date(dayMs),N=Math.floor((Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())-Date.UTC(d.getUTCFullYear(),0,0))/864e5);
 const g=2*Math.PI/365*(N-1),eq=229.18*(0.000075+0.001868*Math.cos(g)-0.032077*Math.sin(g)-0.014615*Math.cos(2*g)-0.040849*Math.sin(2*g)),
 dec=0.006918-0.399912*Math.cos(g)+0.070257*Math.sin(g)-0.006758*Math.cos(2*g)+0.000907*Math.sin(2*g)-0.002697*Math.cos(3*g)+0.00148*Math.sin(3*g),la=st.lat*Math.PI/180;
 const ha=Math.acos(Math.cos(90.833*Math.PI/180)/(Math.cos(la)*Math.cos(dec))-Math.tan(la)*Math.tan(dec))*180/Math.PI;
 const base=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()),off=offset(st,base+12*3600e3);
 const f=m=>base+(m+off*60)*6e4;return[f(720-4*(st.lng+ha)-eq),f(720-4*(st.lng-ha)-eq)]}
function chart(st,d,now){const W=340,H=150,t0=Date.UTC(new Date(now).getUTCFullYear(),new Date(now).getUTCMonth(),new Date(now).getUTCDate()),t1=t0+864e5;
 const pts=[];for(let t=t0;t<=t1;t+=12*6e4){const v=valAt(d,t);if(v!=null)pts.push([t,v])}if(!pts.length)return'';
 const vs=pts.map(p=>p[1]),mn=Math.min(...vs)-0.3,mx=Math.max(...vs)+0.3,X=t=>(t-t0)/(t1-t0)*W,Y=v=>H-8-(v-mn)/(mx-mn)*(H-30);
 const line=pts.map((p,i)=>(i?'L':'M')+X(p[0]).toFixed(1)+' '+Y(p[1]).toFixed(1)).join('');
 const ev=d.hilo.filter(h=>h[0]>=t0&&h[0]<=t1).map(h=>`<circle cx="${X(h[0])}" cy="${Y(h[1])}" r="3" fill="#fff"/><text x="${Math.min(W-30,Math.max(2,X(h[0])-22))}" y="${h[2]==='H'?Y(h[1])-8:Y(h[1])+16}" class="tl">${h[1].toFixed(1)}′ ${hm(h[0]).replace(':00','')}</text>`).join('');
 const nv=valAt(d,now),[sr,ss]=sun(st,now);
 return`<svg viewBox="0 0 ${W} ${H}" class="tchart" preserveAspectRatio="none"><defs><linearGradient id="tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8FD3FF" stop-opacity=".55"/><stop offset="1" stop-color="#8FD3FF" stop-opacity="0"/></linearGradient></defs>
 <rect x="0" y="0" width="${X(sr)}" height="${H}" fill="rgba(0,0,0,.18)"/><rect x="${X(ss)}" y="0" width="${W-X(ss)}" height="${H}" fill="rgba(0,0,0,.18)"/>
 <path d="${line}L${W} ${H}L0 ${H}Z" fill="url(#tg)"/><path d="${line}" fill="none" stroke="#8FD3FF" stroke-width="2.5" stroke-linecap="round"/>${ev}
 ${nv!=null?`<line x1="${X(now)}" x2="${X(now)}" y1="0" y2="${H}" stroke="#fff" stroke-dasharray="3 3" opacity=".7"/><circle cx="${X(now)}" cy="${Y(nv)}" r="6" fill="#FFD166" stroke="#0A4D9C" stroke-width="2"/>`:''}</svg>
 <div class="taxis"><span>12a</span><span>6a</span><span>12p</span><span>6p</span><span>12a</span></div>`}
function view(st,d){const now=localNow(st),v=valAt(d,now),rising=valAt(d,now+6*6e4)>v;
 const nextH=d.hilo.find(h=>h[0]>now&&h[2]==='H'),nextL=d.hilo.find(h=>h[0]>now&&h[2]==='L'),[sr,ss]=sun(st,now);
 const days=[0,1].map(k=>{const t0=Date.UTC(new Date(now).getUTCFullYear(),new Date(now).getUTCMonth(),new Date(now).getUTCDate())+k*864e5;return[t0,d.hilo.filter(h=>h[0]>=t0&&h[0]<t0+864e5)]});
 return`<div class="tnow"><div class="tbig">${v!=null?v.toFixed(1):'–'}<small> ft</small></div><div class="tdir">${rising?'▲ Rising':'▼ Falling'}<br><span>${hm(now)} local time</span></div></div>
 <div class="tnext"><div><span>Next high</span><b>${nextH?hm(nextH[0]):'–'}</b><em>${nextH?nextH[1].toFixed(1)+' ft':''}</em></div><div><span>Next low</span><b>${nextL?hm(nextL[0]):'–'}</b><em>${nextL?nextL[1].toFixed(1)+' ft':''}</em></div></div>
 <div class="tcard">${chart(st,d,now)}</div>
 <div class="tcard tsun"><span>☀︎ Sunrise ${hm(sr)}</span><span>☾ Sunset ${hm(ss)}</span></div>
 ${days.map(([t0,ev],k)=>`<div class="tcard"><div class="tday">${k?'Tomorrow':'Today'} · ${dayName(t0)} ${new Date(t0).getUTCMonth()+1}/${new Date(t0).getUTCDate()}</div>${ev.map(h=>`<div class="trow"><span>${h[2]==='H'?'High':'Low'}</span><span>${hm(h[0])}</span><span>${h[1].toFixed(2)} ft</span></div>`).join('')||'<div class="trow">No data</div>'}</div>`).join('')}
 <div class="tfoot">${esc2(st.name)} (NOAA ${st.id})${d.stale?' · <b>offline, showing saved data</b>':''}<br>Heights in feet above MLLW · ${d.src} · updated ${new Date(d.at).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</div>`}
// Wind (Open-Meteo, mph)
const CMP=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];const cmp=d=>CMP[Math.round(((d%360)+360)%360/22.5)%16];
const arrow=(d,s=18)=>`<svg width="${s}" height="${s}" viewBox="0 0 24 24" style="transform:rotate(${(d+180)%360}deg);vertical-align:middle"><path d="M12 2l6 18-6-4-6 4z" fill="currentColor"/></svg>`;
async function loadWind(st,force){const key='windCache2:'+st.id,c=LS.get(key,null);if(c&&!force&&Date.now()-c.at<20*6e4)return c;
 const v='wind_speed_10m,wind_gusts_10m,wind_direction_10m';
 try{const j=await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${st.lat}&longitude=${st.lng}&current=${v}&hourly=${v}&wind_speed_unit=kn&timezone=auto&forecast_days=7`);
  const out={at:Date.now(),cur:j.current,h:j.hourly};LS.set(key,out);return out}catch(e){if(c)return{...c,stale:true};return null}}
let unit=LS.get('windUnit','kn');const U=k=>unit==='kn'?k:k*1.15078,UL=()=>unit==='kn'?'kt':'mph',R=k=>Math.round(U(k));
// Kite size: m² ≈ rider kg / steady wind kt × 2.2 (twin-tip), snapped to common sizes.
const SIZES=[7,8,9,10,12,14,17];const kg=()=>(+LS.get('kiteWeightLb',195)||195)*0.4536;
function snap(m){return SIZES.reduce((b,s)=>Math.abs(s-m)<Math.abs(b-m)?s:b,SIZES[0])}
function kiteSize(kt,gust){if(kt<11)return{txt:'too light',n:null};if(kt<12)return{txt:'17m+ / foil',n:17};if(kt>30)return{txt:'small kite / caution',n:null};
 const n=snap(kg()/kt*2.2);let note='';if(gust&&(gust-kt>=8||gust>=kt*1.4)){const d=snap(kg()/((kt+gust)/2)*2.2);if(d<n)note=`gusty: ${d}m if overpowered`}return{txt:n+'m',n,note}}
// Live observations via NWS API (CORS-enabled). Alligator Reef (ALRF1) first; it is currently offline, so fresh nearby stations fill in.
// Only the two reef stations Tom uses. Alligator Reef via the NWS API (CORS). Carysfort Reef Light is a WeatherFlow
// sensor whose live data requires a paid login, so no public feed exists; its tile always shows "no recent data".
const SHOW_TILES=false; // station tiles dormant; set true to re-enable
const TILES=[{id:'ALRF1',name:'Alligator Reef',lat:24.9,lng:-80.6},{id:null,name:'Carysfort Reef',lat:25.2217,lng:-80.2117}];
const OBS=TILES.filter(t=>t.id).map(t=>t.id),MARINE=OBS,FRESH=90;
const OBSNAME={ALRF1:'Alligator Reef'};
function miles(a1,o1,a2,o2){const r=Math.PI/180,h=Math.sin((a2-a1)*r/2)**2+Math.cos(a1*r)*Math.cos(a2*r)*Math.sin((o2-o1)*r/2)**2;return 7917.6*Math.asin(Math.sqrt(h))}
async function loadObs(st,force){const key='obsCache',c=LS.get(key,null);if(c&&!force&&Date.now()-c.at<8*6e4)return c.list;
 const res=await Promise.all(OBS.map(async id=>{try{const r=await fetch(`https://api.weather.gov/stations/${id}/observations?limit=${MARINE.includes(id)?80:14}`,{headers:{Accept:'application/geo+json'}});if(!r.ok)return null;const j=await r.json();
  const f=j.features.filter(x=>x.properties.windSpeed&&x.properties.windSpeed.value!=null);if(!f.length)return null;const[lon,lat]=f[0].geometry.coordinates;
  const hist=f.map(x=>({t:Date.parse(x.properties.timestamp),s:x.properties.windSpeed.value/1.852,g:x.properties.windGust&&x.properties.windGust.value!=null?x.properties.windGust.value/1.852:null,d:x.properties.windDirection?x.properties.windDirection.value:null})).filter(h=>Date.now()-h.t<12*36e5).sort((x,y)=>x.t-y.t);
  const L=hist[hist.length-1],rg=hist.filter(h=>L.t-h.t<=30*6e4&&h.g!=null).map(h=>h.g);
  return{id,name:OBSNAME[id]||id,marine:MARINE.includes(id),dist:miles(st.lat,st.lng,lat,lon),t:L.t,s:L.s,g:L.g!=null?L.g:(rg.length?Math.max(...rg):null),d:L.d,hist}}catch(e){return null}}));
 const list=res.filter(Boolean);if(list.length)LS.set(key,{at:Date.now(),list});else if(c)return c.list;return list}
const ago=t=>{const m=Math.round((Date.now()-t)/6e4);return m<60?m+' min ago':Math.floor(m/60)+' h '+(m%60)+' min ago'};
function liveCard(obs){return`<div class="ktiles">${TILES.map(t=>{const o=(obs||[]).find(x=>x.id===t.id),fresh=o&&Date.now()-o.t<=FRESH*6e4;
 if(!fresh)return`<div class="ktile stale"><div class="ktn">${t.name}</div><div class="ktv">--<small> ${UL()}</small></div><div class="ktm">no recent data</div><div class="kta">${o?'last report '+ago(o.t):'last report unavailable'}</div></div>`;
 return`<div class="ktile" style="border-color:${kcol(o.s)}"><div class="ktn">${t.name}</div><div class="ktv" style="color:${kcol(o.s)}">${R(o.s)}<small> ${UL()}</small></div><div class="ktm">${o.g!=null?'G '+R(o.g):'no gust'} · ${o.d!=null?arrow(o.d,13)+' '+cmp(o.d):'–'}</div><div class="kta">${ago(o.t)}</div></div>`}).join('')}</div>`}
function obsChart(o){const h=o.hist;if(h.length<3)return'';const W=340,H=60,t0=h[0].t,t1=h[h.length-1].t,mx=Math.max(15,...h.map(x=>x.g||x.s))*1.1,X=t=>(t-t0)/(t1-t0||1)*W,Y=v=>H-4-v/mx*(H-10);
 const ln=h.map((x,i)=>(i?'L':'M')+X(x.t).toFixed(1)+' '+Y(x.s).toFixed(1)).join(''),gs=h.filter(x=>x.g!=null).map(x=>`<circle cx="${X(x.t)}" cy="${Y(x.g)}" r="1.6" fill="#FFD166"/>`).join('');
 return`<svg viewBox="0 0 ${W} ${H}" class="obsch" preserveAspectRatio="none"><path d="${ln}" fill="none" stroke="#8FD3FF" stroke-width="2"/>${gs}</svg><div class="taxis"><span>${Math.round((t1-t0)/36e5)}h ago</span><span>observed wind · dots = gusts</span><span>now</span></div>`}
const SHORE=90; // Key Largo ocean side faces east
function shore(d){let x=Math.abs(((d-SHORE)%360+540)%360-180);return x<=45?['on','Onshore / side-on']:x<=100?['side','Side-shore']:['off','Offshore ⚠']}
const kcol=k=>k<12?'#7d8fa6':k<18?'#2ecc71':k<25?'#f5a623':'#e74c3c';
function hrs(st,w){const H=w.h;return H.time.map((t,i)=>{const ms=parseT(t.replace('T',' '));const[sr,ss]=sun(st,ms);const s=H.wind_speed_10m[i],d=H.wind_direction_10m[i];
 const day=ms>=sr&&ms<=ss,sh=shore(d)[0];return{t,ms,s,g:H.wind_gusts_10m[i],d,day,kite:day&&s>=14&&sh!=='off',sh}})}
function windows(list){let best=null,run=[];for(const h of list.concat([{kite:false}])){if(h.kite)run.push(h);else{if(run.length&&(!best||run.length>best.length))best=run;run=[]}}return best}
const hh=ms=>{const h=new Date(ms).getUTCHours();return(h%12||12)+(h<12?'a':'p')};
function windView(st,w,obs){if(!w)return`<div class="tcard">Wind forecast unavailable right now.</div>`;
 const live=(obs||[]).filter(o=>Date.now()-o.t<=FRESH*6e4).sort((x,y)=>y.t-x.t)[0];
 const c=live?{wind_speed_10m:live.s,wind_gusts_10m:live.g,wind_direction_10m:live.d??w.cur.wind_direction_10m}:w.cur,now=localNow(st),all=hrs(st,w);
 const next=all.filter(h=>h.ms>=now-36e5).slice(0,48),dayKey=ms=>new Date(ms).toISOString().slice(0,10),today=dayKey(now);
 const restToday=all.filter(h=>dayKey(h.ms)===today&&h.ms>=now-36e5),win=windows(restToday),[,ss]=sun(st,now),cs=shore(c.wind_direction_10m);
 const ks=live?kiteSize(c.wind_speed_10m,c.wind_gusts_10m):win?kiteSize(win.reduce((x,h)=>x+h.s,0)/win.length,Math.max(...win.map(h=>h.g))):kiteSize(c.wind_speed_10m,c.wind_gusts_10m);
 let go,why;const nowDay=now>=sun(st,now)[0]&&now<=ss;
 if(live){const sh=shore(c.wind_direction_10m)[0],s=c.wind_speed_10m;const fw=win?` · forecast window ${hh(win[0].ms)}–${hh(win[win.length-1].ms+36e5)}`:'';
  if(!nowDay){go='no';why='After dark'+fw}else if(sh==='off'){go='no';why='Offshore wind now'+fw}else if(s>=14){go='go';why=`Live ${R(s)} ${UL()} now`+fw}else if(s>=12){go='maybe';why=`Live ${R(s)} ${UL()}, marginal`+fw}else{go='no';why=`Live ${R(s)} ${UL()}, too light`+fw}}
 else if(win&&win.length>=2){go='go';why=`Kiteable ${hh(win[0].ms)}–${hh(win[win.length-1].ms+36e5)} · avg ${R(win.reduce((a,h)=>a+h.s,0)/win.length)} ${UL()}`}
 else if(win){go='maybe';why=`Short window around ${hh(win[0].ms)}`}

 else{go='no';why=now>ss?'After sunset':restToday.some(h=>h.day&&h.s>=14)?'Offshore wind':'Too light'}
 const days=[...new Set(all.map(h=>dayKey(h.ms)))].slice(0,7).map(k=>{const dl=all.filter(h=>dayKey(h.ms)===k&&h.day);if(!dl.length)return'';
  const avg=dl.reduce((a,h)=>a+h.s,0)/dl.length,gmax=Math.max(...dl.map(h=>h.g)),vx=dl.reduce((a,h)=>a+Math.sin(h.d*Math.PI/180),0),vy=dl.reduce((a,h)=>a+Math.cos(h.d*Math.PI/180),0),dir=(Math.atan2(vx,vy)*180/Math.PI+360)%360,b=windows(dl);
  const dn=k===today?'Today':['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(k+'T12:00Z').getUTCDay()];
  return`<div class="krow"><span class="kd">${dn}</span><span class="kc" style="background:${kcol(avg)}">${R(avg)}</span><span class="kg">G${R(gmax)}</span><span class="kdir">${arrow(dir,14)} ${cmp(dir)}</span><span class="kw">${b?`🪁 ${hh(b[0].ms)}–${hh(b[b.length-1].ms+36e5)} · <b>${kiteSize(b.reduce((x,h)=>x+h.s,0)/b.length).txt}</b>`:'<span class="kn">no window</span>'}</span></div>`}).join('');
 const mx=Math.max(25,...next.map(h=>h.g));
 return`<div class="khero"><div class="khin"><div class="khead"><span class="kloc">${esc2(st.label)}${w.stale?' · saved':''}</span><span class="kunit"><button data-u="kn" class="${unit==='kn'?'on':''}">kt</button><button data-u="mph" class="${unit==='mph'?'on':''}">mph</button></span></div>
 <div class="wnow"><div class="wdial">${arrow(c.wind_direction_10m,44)}</div><div><div class="wbig">${R(c.wind_speed_10m)}<small> ${UL()}</small></div>
 <div class="wsub">Gusts <b>${c.wind_gusts_10m!=null?R(c.wind_gusts_10m):'–'}</b> · ${cmp(c.wind_direction_10m)} ${Math.round(c.wind_direction_10m)}°</div><div class="wsrc">${live?`Observed · ${esc2(live.name)} · ${Math.round(live.dist)} mi · ${ago(live.t)}`:'Model estimate (Open-Meteo)'}</div><div class="kshore ${cs[0]}">${cs[1]}</div></div></div></div></div>
 <div class="kgo ${go}"><b>${go==='go'?'GO':go==='maybe'?'MAYBE':'NO-GO'}</b><span class="sp">${why}</span><span class="ksz"><small>Kite</small>${ks.txt}${ks.note?`<em>${ks.note}</em>`:''}</span></div>
 ${live?`<div class="tcard"><div class="tday">${esc2(live.name)}, last ${Math.round((live.hist[live.hist.length-1].t-live.hist[0].t)/36e5)}h</div>${obsChart(live)}</div>`:''}${SHOW_TILES?liveCard(obs):""}
 <div class="tcard"><div class="tday">Next 48 hours (forecast) <span class="wleg"><i style="background:#7d8fa6"></i>&lt;12 <i style="background:#2ecc71"></i>12–17 <i style="background:#f5a623"></i>18–24 <i style="background:#e74c3c"></i>25+</span></div>
 <div class="kstrip">${next.map(h=>`<div class="kh ${h.day?'':'night'} ${h.kite?'kite':''}"><span class="kv">${R(h.s)}</span><div class="kbar"><i style="height:${h.g/mx*100}%" class="kgb"></i><i style="height:${h.s/mx*100}%;background:${kcol(h.s)}"></i></div><span class="ka">${arrow(h.d,12)}</span><span class="kt">${hh(h.ms)}</span>${h.kite&&kiteSize(h.s).n?`<span class="kz">${kiteSize(h.s).n}m</span>`:''}</div>`).join('')}</div>
 <div class="kfoot">Outlined = kiteable (14 kt+, daylight, not offshore) with kite size · shaded = night · faint bar = gust</div></div>
 <div class="tcard"><div class="tday">Daily outlook <span class="wleg">avg · gust · direction · best window</span></div>${days}</div>`}
const esc2=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
async function show(i,force){cur=(i+slots.length)%slots.length;LS.set('tideCur',cur);const st=slots[cur];
 $t('#tseg').hidden=slots.length<2;$t('#tloc').textContent=st.label;$t('#tseg').innerHTML=slots.map((s,k)=>`<button class="${k===cur?'on':''}" data-s="${k}">${esc2(s.label)}</button>`).join('');
 $t('#tbody').innerHTML='<div class="tload">Loading tides…</div>';
 try{const[d,w,o]=await Promise.all([load(st,force),loadWind(st,force),loadObs(st,force).catch(()=>[])]);data[st.id]=d;wind[st.id]=w;obsD=o;if(slots[cur]===st)$t('#tbody').innerHTML=windView(st,w,o)+'<div class="tsec">Tides</div>'+view(st,d)}catch(e){$t('#tbody').innerHTML=`<div class="tload">Couldn't reach NOAA. Check your connection and pull to refresh.<br><button class="tbtn" id="tretry">Try again</button></div>`}}
// station settings
let list=null;async function stations(){if(list)return list;const c=LS.get('tideStationList',null);if(c&&Date.now()-c.at<30*864e5)return list=c.s;
 const j=await getJSON(MD);list=j.stations.map(s=>({id:s.id,name:s.name,state:s.state,lat:+s.lat,lng:+s.lng,tz:+s.timezonecorr,type:s.type}));LS.set('tideStationList',{at:Date.now(),s:list});return list}
function settings(){const box=$t('#tset');box.hidden=false;box.innerHTML=`<div class="tsh"><b>Locations</b><button class="tx" id="tclose">Done</button></div>
 ${slots.map((s,k)=>`<div class="trow"><span>${esc2(s.label)}<br><small>${esc2(s.name)} · ${s.id}</small></span><span><button class="tbtn sm" data-rm="${k}" ${slots.length<2?'disabled':''}>Remove</button></span></div>`).join('')}
 <input id="tq" placeholder="Search NOAA stations (name, state or ID)" autocomplete="off"><div id="tres"></div>
 <label class="twl">Rider weight (lb) for kite size<input id="twt" type="number" min="60" max="400" value="${LS.get('kiteWeightLb',195)}"></label><button class="tbtn sm" id="treset">Reset to Key Largo</button>`;
 $t('#twt').onchange=e=>{const v=+e.target.value;if(v>=60&&v<=400)LS.set('kiteWeightLb',v)};
 $t('#tq').oninput=async e=>{const q=e.target.value.trim().toLowerCase();if(q.length<2){$t('#tres').innerHTML='';return}$t('#tres').innerHTML='<small>Searching…</small>';
  try{const L=await stations();$t('#tres').innerHTML=L.filter(s=>s.id.includes(q)||(s.name+' '+s.state).toLowerCase().includes(q)).slice(0,25).map(s=>`<button class="tpick" data-id="${s.id}">${esc2(s.name)}, ${s.state} <small>${s.id}</small></button>`).join('')||'<small>No matches</small>'}catch(err){$t('#tres').innerHTML='<small>Station list unavailable offline.</small>'}}}
el.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.u){unit=b.dataset.u;LS.set('windUnit',unit);show(cur)}else if(b.dataset.s!=null)show(+b.dataset.s);else if(b.id==='tgear')settings();else if(b.id==='tclose'){$t('#tset').hidden=true;show(cur)}
 else if(b.id==='tretry'||b.id==='trefresh')show(cur,true);
 else if(b.dataset.rm!=null){slots.splice(+b.dataset.rm,1);LS.set('tideSlots',slots);cur=0;settings()}
 else if(b.id==='treset'){slots=DEF.slice();LS.set('tideSlots',slots);cur=0;settings()}
 else if(b.dataset.id){const s=(await stations()).find(x=>x.id===b.dataset.id);const label=prompt('Short name for this location',s.name.split(',')[0])||s.name;slots.push({...s,label:label.slice(0,18)});LS.set('tideSlots',slots);cur=slots.length-1;settings()}});
let sx=null;el.addEventListener('touchstart',e=>{sx=e.touches[0].clientX},{passive:true});
el.addEventListener('touchend',e=>{if(sx==null||!$t('#tset').hidden)return;const dx=e.changedTouches[0].clientX-sx;sx=null;if(Math.abs(dx)>60)show(cur+(dx<0?1:-1))});
// (dormant) former hero-photo hit-area helpers; unused.
// Rider box as fractions of hero.jpg (1440x1080); mapped through background-size:cover + position 50% 30%.
const IMG={w:1440,h:1080,px:.5,py:.3},RIDER={x0:.37,x1:.60,y0:.22,y1:.58};
function riderRect(hero){const W=hero.clientWidth,H=hero.clientHeight,s=Math.max(W/IMG.w,H/IMG.h),iw=IMG.w*s,ih=IMG.h*s,ox=(W-iw)*IMG.px,oy=(H-ih)*IMG.py;
 return{x0:ox+RIDER.x0*iw,x1:ox+RIDER.x1*iw,y0:oy+RIDER.y0*ih,y1:oy+RIDER.y1*ih}}
function placeHit(){const h=$t('.khero'),z=$t('#khit');if(!h||!z)return;const r=riderRect(h);Object.assign(z.style,{left:r.x0+'px',top:r.y0+'px',width:(r.x1-r.x0)+'px',height:(r.y1-r.y0)+'px'})}
window.addEventListener('resize',placeHit);new MutationObserver(placeHit).observe($t('#tbody'),{childList:true});

window.__obs=()=>obsD;window.__ks=(k,g)=>kiteSize(k,g);window.__riderRect=()=>riderRect($t('.khero'));
window.tideShow=()=>show(cur);
setInterval(async()=>{if(el.style.display!=='none'){try{obsD=await loadObs(slots[cur])}catch(e){}}if(el.style.display!=='none'&&data[slots[cur].id])$t('#tbody').innerHTML=windView(slots[cur],wind[slots[cur].id],obsD)+'<div class="tsec">Tides</div>'+view(slots[cur],data[slots[cur].id])},60000);
show(cur);
})();
