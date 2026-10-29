import sys
from playwright.sync_api import sync_playwright
U=sys.argv[1].split('#')[0];errs=[];SS='/workspace/peptide-tracker/screenshots/'
snap="JSON.stringify([S.peptides.filter(p=>p.name!=='MitoStack'),S.protocols.filter(r=>r.peptideId!==(S.peptides.find(p=>p.name==='MitoStack')||{}).id),S.logs])"
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome');pg=b.new_context(service_workers='block',viewport={'width':390,'height':844},device_scale_factor=2).new_page()
    pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('console',lambda m:m.type=='error' and errs.append(m.text))
    pg.goto(U);pg.wait_for_timeout(600)
    print('version',pg.evaluate('APP_VERSION'))
    pg.evaluate("""S={peptides:[{id:'s',name:'SS-31',vialMg:10,bacMl:2,vials:1,remainingMg:6,reorderAt:0,expiryDays:28,reconDate:'2026-10-11',notes:''}],
     protocols:[{id:'s1',peptideId:'s',doseMcg:2000,time:'08:00',freq:'daily',start:'2026-10-11',active:true}],
     logs:[{id:'a',peptideId:'s',protocolId:'s1',ts:+new Date('2026-10-28T08:00'),doseMcg:2000}],settings:{imports:{}}};save()""")
    s0=pg.evaluate(snap)
    pg.goto(U+'#add=mitostack-20261029');pg.wait_for_timeout(1200)
    print('toast:',pg.evaluate("(document.querySelector('#toast')||{}).textContent"))
    print('peptide:',pg.evaluate("JSON.stringify(S.peptides.filter(p=>p.name==='MitoStack').map(p=>[p.vialMg,p.bacMl,p.vials,p.remainingMg]))"))
    print('protocol:',pg.evaluate("JSON.stringify(S.protocols.filter(r=>r.id==='ms-20261029-1').map(r=>[r.doseMcg,r.time,r.freq,r.active]))"))
    print('others untouched:',pg.evaluate(snap)==s0,'| hash cleared:',pg.evaluate("location.hash===''"),'| tab',pg.evaluate('tab'))
    pg.screenshot(path=SS+'F0-mitostack-detail.png')
    N="JSON.stringify([S.peptides.map(p=>[p.name,p.vialMg,p.bacMl,p.vials,p.remainingMg]),S.protocols.map(r=>[r.id,r.doseMcg,r.active,r.start]),S.logs.map(l=>[l.id,l.doseMcg,l.ts])])"
    s1=pg.evaluate(N)
    pg.goto(U+'?again=1#add=mitostack-20261029');pg.wait_for_timeout(1200)
    print('2nd run toast:',pg.evaluate("(document.querySelector('#toast')||{}).textContent"),'| no-op:',pg.evaluate(N)==s1,'| count',pg.evaluate("S.peptides.filter(p=>p.name==='MitoStack').length"))
    pg.evaluate("tab='reference';refQ='mito';render()");pg.wait_for_timeout(300)
    pg.evaluate("document.querySelector('#view details').open=true");pg.wait_for_timeout(200)
    print('ref text:',pg.evaluate("document.querySelector('#view').innerText.replace(/\\n/g,' | ')")[:700])
    pg.screenshot(path=SS+'F1-mitostack-reference.png',full_page=False)
    pg.evaluate("tab='today';render()");pg.wait_for_timeout(300)
    print('errors',errs);b.close()
