import sys,json
from playwright.sync_api import sync_playwright
U=sys.argv[1];errs=[];dialogs=[];SS='/workspace/peptide-tracker/screenshots/'
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome');ctx=b.new_context(service_workers='block',viewport={'width':390,'height':844},device_scale_factor=2,accept_downloads=True);pg=ctx.new_page()
    pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('console',lambda m:m.type=='error' and errs.append(m.text))
    pg.on('dialog',lambda d:(dialogs.append(d.message),d.accept()))
    pg.goto(U);pg.wait_for_timeout(600)
    pg.evaluate("""S={peptides:[{id:'t',name:'Tesamorelin',vialMg:10,bacMl:2,vials:1,remainingMg:6,reorderAt:0,expiryDays:28,reconDate:'2026-10-10',notes:''},{id:'s',name:'SS-31',vialMg:10,bacMl:2,vials:2,remainingMg:4,reorderAt:0,expiryDays:28,reconDate:'2026-10-10',notes:''}],
      protocols:[{id:'rt',peptideId:'t',doseMcg:2000,time:'21:00',freq:'daily',active:true}],logs:[{id:'l1',peptideId:'t',protocolId:'rt',ts:Date.now(),doseMcg:2000}],settings:{bkPw:true}};save()""")
    pg.reload();pg.wait_for_timeout(800);pg.evaluate("tab='data';render()");pg.wait_for_timeout(200)
    print('old bkPw flag removed:',pg.evaluate("!('bkPw' in S.settings)"),'| idb dbs:',pg.evaluate("indexedDB.databases?indexedDB.databases().then(x=>x.map(d=>d.name)):'n/a'"))
    with pg.expect_download() as dl:pg.click('button:has-text("Export backup")')
    d=dl.value;path='/workspace/bk_test_file';d.save_as(path);print('one-tap download name:',repr(d.suggested_filename),'| dialogs so far:',dialogs)
    raw=open(path).read();o=json.loads(raw);print('header keys',sorted(o),'v',o['v'],'iv bytes',len(__import__('base64').b64decode(o['iv'])))
    print('plaintext leak:',any(w in raw for w in ['Tesamorelin','SS-31','peptides','doseMcg']))
    pg.evaluate("S={peptides:[],protocols:[],logs:[],settings:{}};save();tab='data';render()")
    pg.set_input_files('input[type=file]',path);pg.wait_for_function("S.peptides.length>0",timeout=10000)
    print('restored:',pg.evaluate("JSON.stringify([S.peptides.map(p=>p.name),S.logs.length,S.protocols.length])"),'| dialogs:',dialogs)
    tamper=dict(o);tamper['ct']=tamper['ct'][:-6]+('AAAAAA' if tamper['ct'][-6:]!='AAAAAA' else 'BBBBBB');open('/workspace/bk_bad','w').write(json.dumps(tamper))
    pg.set_input_files('input[type=file]','/workspace/bk_bad');pg.wait_for_timeout(500);print('tampered ->',dialogs[-1:] ,'data kept:',pg.evaluate("S.peptides.length"))
    old={'app':'Tides','version':1,'peptides':[{'id':'z','name':'OldPep','vialMg':5,'bacMl':2,'vials':0,'remainingMg':5}],'protocols':[],'logs':[],'settings':{}}
    open('/workspace/tides-backup.json','w').write(json.dumps(old))
    pg.set_input_files('input[type=file]','/workspace/tides-backup.json');pg.wait_for_timeout(500);print('old json import:',pg.evaluate("S.peptides.map(p=>p.name).join()"))
    pg.evaluate("tab='settings';render()");st=pg.locator('#view').inner_text()
    pg.evaluate("tab='data';render()");dt=pg.locator('#view').inner_text()
    print('password UI left:',[x for x in ['assword'] if x in st or x in dt or x in pg.content()])
    pg.wait_for_timeout(5500);pg.screenshot(path=SS+'D0-data-backup.png')
    print('errors',errs);b.close()
