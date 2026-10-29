import sys
from playwright.sync_api import sync_playwright
U=sys.argv[1].split('#')[0];errs=[];SS='/workspace/peptide-tracker/screenshots/'
N="JSON.stringify([S.peptides.filter(p=>p.name!=='MitoStack').map(p=>[p.id,p.name,p.vialMg,p.bacMl,p.vials,p.remainingMg]),S.protocols.filter(r=>r.id!=='ms-20261029-1').map(r=>[r.id,r.doseMcg,r.active,r.start]),S.logs.map(l=>[l.id,l.doseMcg,l.ts])])"
MS="JSON.stringify([S.peptides.filter(p=>p.name==='MitoStack').map(p=>[p.vialMg,p.bacMl,p.vials]),S.protocols.filter(r=>r.id==='ms-20261029-1').map(r=>[r.doseMcg,r.time,r.freq,r.active])])"
TOAST="(document.querySelector('#toast')||{}).textContent"
SEED="""S={peptides:[{id:'s',name:'SS-31',vialMg:10,bacMl:2,vials:1,remainingMg:6,reorderAt:0,expiryDays:28,reconDate:'2026-10-11',notes:''}],
 protocols:[{id:'s1',peptideId:'s',doseMcg:2000,time:'08:00',freq:'daily',start:'2026-10-11',active:true}],
 logs:[{id:'a',peptideId:'s',protocolId:'s1',ts:+new Date('2026-10-28T08:00'),doseMcg:2000}],settings:{imports:{}}};save()"""
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome');pg=b.new_context(service_workers='block',viewport={'width':390,'height':844},device_scale_factor=2).new_page()
    pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('console',lambda m:m.type=='error' and errs.append(m.text))
    pg.goto(U);pg.wait_for_timeout(800)
    print('version',pg.evaluate('APP_VERSION'))
    # FRESH: no MitoStack
    pg.evaluate(SEED);s0=pg.evaluate(N)
    pg.evaluate("tab='today';render()")
    pg.reload();pg.wait_for_timeout(250)
    print('FRESH toast:',pg.evaluate(TOAST));pg.screenshot(path=SS+'G0-auto-fresh-launch.png')
    pg.wait_for_timeout(600)
    print('FRESH mito:',pg.evaluate(MS),'| others untouched:',pg.evaluate(N)==s0,'| tab',pg.evaluate('tab'))
    # relaunch
    pg.reload();pg.wait_for_timeout(250)
    print('RELAUNCH toast:',repr(pg.evaluate(TOAST)),'| mito:',pg.evaluate(MS),'| untouched:',pg.evaluate(N)==s0)
    # user deletes it -> must not come back
    pg.evaluate("S.peptides=S.peptides.filter(p=>p.name!=='MitoStack');S.protocols=S.protocols.filter(r=>r.id!=='ms-20261029-1');save()")
    pg.reload();pg.wait_for_timeout(500)
    print('DELETED stays deleted:',pg.evaluate(MS)=='[[],[]]')
    # ALREADY ADDED via link earlier (no auto marker)
    pg.evaluate(SEED);pg.goto(U+'#add=mitostack-20261029');pg.wait_for_timeout(900)
    pg.evaluate("delete S.settings.imports['auto-mitostack-20261029'];save()")
    s1=pg.evaluate("JSON.stringify([S.peptides.map(p=>p.name),S.protocols.map(r=>r.id),S.logs.length])");m1=pg.evaluate(MS)
    pg.reload();pg.wait_for_timeout(250)
    print('ALREADY toast:',repr(pg.evaluate(TOAST)),'| unchanged:',pg.evaluate("JSON.stringify([S.peptides.map(p=>p.name),S.protocols.map(r=>r.id),S.logs.length])")==s1 and pg.evaluate(MS)==m1)
    pg.screenshot(path=SS+'G1-auto-already-added.png')
    # fresh + hash together -> single add
    pg.evaluate(SEED);pg.goto(U+'#add=mitostack-20261029');pg.wait_for_timeout(900)
    print('HASH+AUTO single:',pg.evaluate(MS))
    print('errors',errs);b.close()
