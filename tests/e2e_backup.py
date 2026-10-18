import sys,json
from playwright.sync_api import sync_playwright
U=sys.argv[1];errs=[];SS='/workspace/peptide-tracker/screenshots/'
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome');ctx=b.new_context(service_workers='block',viewport={'width':390,'height':844},device_scale_factor=2,accept_downloads=True);pg=ctx.new_page()
    pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('console',lambda m:m.type=='error' and errs.append(m.text))
    pg.on('dialog',lambda d:d.accept())
    pg.goto(U);pg.wait_for_timeout(600)
    pg.evaluate("""S={peptides:[{id:'t',name:'Tesamorelin',vialMg:10,bacMl:2,vials:1,remainingMg:6,reorderAt:0,expiryDays:28,reconDate:'2026-10-10',notes:''},{id:'s',name:'SS-31',vialMg:10,bacMl:2,vials:2,remainingMg:4,reorderAt:0,expiryDays:28,reconDate:'2026-10-10',notes:''}],
      protocols:[{id:'rt',peptideId:'t',doseMcg:2000,time:'21:00',freq:'daily',active:true}],logs:[{id:'l1',peptideId:'t',protocolId:'rt',ts:Date.now(),doseMcg:2000}],settings:{}};save();tab='data';render()""")
    # no password -> export prompts to set one
    pg.click('button:has-text("Export backup")');pg.wait_for_timeout(300);print('prompted for pw:',pg.locator('#pwDlg').is_visible())
    pg.fill('#pw1','tidepass');pg.fill('#pw2','nope');pg.click('#pwSave');print('mismatch:',pg.locator('#pwErr').inner_text())
    pg.fill('#pw2','tidepass');pg.click('#pwSave');pg.wait_for_selector('#bkReady[open]',timeout=15000);print('ready dialog after set')
    with pg.expect_download() as dl:pg.click('#bkGo')
    d=dl.value;path='/workspace/bk_test_file';d.save_as(path);print('download name:',repr(d.suggested_filename))
    raw=open(path).read();o=json.loads(raw);print('keys',sorted(o),'iter',o['iter'],'salt bytes',len(__import__('base64').b64decode(o['salt'])),'iv bytes',len(__import__('base64').b64decode(o['iv'])))
    print('plaintext leak:',any(w in raw for w in ['Tesamorelin','SS-31','peptides','doseMcg']))
    # one-tap after reload (key from IndexedDB)
    pg.reload();pg.wait_for_timeout(800);pg.evaluate("tab='data';render()")
    with pg.expect_download() as dl2:pg.click('button:has-text("Export backup")')
    print('one-tap 2nd export name:',dl2.value.suggested_filename,'differs (new IV):',open(dl2.value.path()).read()!=raw)
    # wipe and import wrong then right
    pg.evaluate("S={peptides:[],protocols:[],logs:[],settings:{bkPw:true}};save();tab='data';render()")
    pg.set_input_files('input[type=file]',path);pg.wait_for_selector('#pwAsk[open]');pg.fill('#pwA','wrong');pg.click('#pwAo');pg.wait_for_function("document.querySelector('#pwAErr').textContent.includes('Wrong')",timeout=20000)
    print('wrong pw msg:',pg.locator('#pwAErr').inner_text(),'| data still empty:',pg.evaluate('S.peptides.length'))
    pg.fill('#pwA','tidepass');pg.click('#pwAo');pg.wait_for_function("S.peptides.length>0",timeout=20000)
    print('restored:',pg.evaluate("JSON.stringify([S.peptides.map(p=>p.name),S.logs.length,S.protocols.length,S.settings.bkPw])"))
    # old plaintext json
    old={'app':'Tides','version':1,'peptides':[{'id':'z','name':'OldPep','vialMg':5,'bacMl':2,'vials':0,'remainingMg':5}],'protocols':[],'logs':[],'settings':{}}
    open('/workspace/tides-backup.json','w').write(json.dumps(old))
    pg.set_input_files('input[type=file]','/workspace/tides-backup.json');pg.wait_for_timeout(500);print('old json import:',pg.evaluate("S.peptides.map(p=>p.name).join()"))
    pg.evaluate("tab='settings';render()");pg.wait_for_timeout(200);pg.screenshot(path=SS+'D0-settings-backup-password.png')
    pg.click('#view button:has-text("Change")');pg.wait_for_timeout(200);pg.fill('#pw1','abcd1234');pg.screenshot(path=SS+'D1-backup-password-dialog.png')
    print('errors',errs);b.close()
