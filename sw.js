// Tides service worker: network-first for app files (auto-updates), cache fallback offline.
const VERSION='41',C='tides-v'+VERSION;
const CORE=['./','index.html','styles.css','app.js','reference.js','tide.js','schedule.js','ocr.js','manifest.webmanifest','icon.svg','icon-192.png','icon-512.png','apple-touch-icon.png','kiter.svg','favicon.png'];
const CDN='https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>Promise.all([...CORE,CDN].map(u=>c.add(new Request(u,{cache:'reload'})).catch(()=>{})))))});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);
 if(u.origin!==location.origin){e.respondWith(caches.match(r).then(m=>m||fetch(r).then(res=>{const cp=res.clone();caches.open(C).then(c=>c.put(r,cp));return res})));return}
 e.respondWith(fetch(r,{cache:'no-store'}).then(res=>{if(res.ok){const cp=res.clone();caches.open(C).then(c=>c.put(r,cp))}return res})
  .catch(()=>caches.match(r,{ignoreSearch:true}).then(m=>m||(r.mode==='navigate'?caches.match('index.html'):Response.error()))))});
