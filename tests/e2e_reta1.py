import sys,json
from playwright.sync_api import sync_playwright
U=sys.argv[1].split('#')[0];errs=[];SS='/workspace/peptide-tracker/screenshots/'
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome');pg=b.new_context(service_workers='block',viewport={'width':390,'height':844},device_scale_factor=2).new_page()
    pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('console',lambda m:m.type=='error' and errs.append(m.text))
    pg.goto(U);pg.wait_for_timeout(600)
    pg.evaluate("""S={peptides:[{id:'r',name:'Retatrutide',vialMg:10,bacMl:2,vials:1,remainingMg:7,reorderAt:0,expiryDays:28,reconDate:'2026-10-11',notes:''},{id:'s',name:'SS-31',vialMg:10,bacMl:2,vials:1,remainingMg:6,reorderAt:0,expiryDays:28,reconDate:'2026-10-11',notes:''}],
     protocols:[{id:'r1',peptideId:'r',doseMcg:1000,time:'08:00',freq:'weekdays',weekdays:[0],start:'2026-10-11',end:'2026-10-17',active:true},{id:'r2',peptideId:'r',doseMcg:2000,time:'08:00',freq:'weekdays',weekdays:[0],start:'2026-10-18',end:'2026-11-14',active:true},{id:'r3',peptideId:'r',doseMcg:4000,time:'08:00',freq:'weekdays',weekdays:[0],start:'2026-11-15',end:'',active:true},{id:'s1',peptideId:'s',doseMcg:2000,time:'08:00',freq:'daily',start:'2026-10-11',active:true}],
     logs:[{id:'a',peptideId:'r',protocolId:'r1',ts:+new Date('2026-10-11T08:00'),doseMcg:1000},{id:'b',peptideId:'r',protocolId:'r2',ts:+new Date('2026-10-18T08:05'),doseMcg:2000}],settings:{imports:{'plan-update-20261011b':'x'}}};save()""")
    logs0=pg.evaluate("JSON.stringify(S.logs)")
    pg.goto(U+'#add=plan-update-20261022-reta1');pg.wait_for_timeout(1200)
    toast=pg.evaluate("(document.querySelector('#toast')||{}).textContent")
    pr=pg.evaluate("JSON.stringify(S.protocols.filter(r=>r.peptideId==='r').map(r=>[r.id,r.doseMcg,r.freq,r.weekdays,r.time,r.start,r.end,r.active]))")
    print('toast:',toast);print('reta protos:',pr);print('SS-31 untouched:',pg.evaluate("JSON.stringify(S.protocols.filter(r=>r.peptideId==='s').map(r=>r.id))"))
    print('logs untouched:',pg.evaluate("JSON.stringify(S.logs)")==logs0,'| url hash cleared:',pg.evaluate("location.hash==''"),'| tab',pg.evaluate('tab'))
    pg.screenshot(path=SS+'E0-reta-plan.png')
    s1=pg.evaluate("JSON.stringify([S.protocols,S.logs.map(l=>({...l,vialId:0}))])")
    pg.goto(U+'?again=1#add=plan-update-20261022-reta1');pg.wait_for_timeout(1200)
    a=pg.evaluate("JSON.stringify([S.protocols,S.logs.map(l=>({...l,vialId:0}))])");print('DIFF',s1,'\n',a) if a!=s1 else 0;print('2nd run toast:',pg.evaluate("(document.querySelector('#toast')||{}).textContent"),'| no-op:',pg.evaluate("JSON.stringify([S.protocols,S.logs.map(l=>({...l,vialId:0}))])")==s1)
    print('suggested page ok:',pg.evaluate("tab='suggested';render();document.querySelector('#view').innerText.includes('Retatrutide')||'no reta in suggested'"))
    # extra-dose edit sheet allows amount edit
    pg.evaluate("S.logs.push({id:'x',peptideId:'r',protocolId:null,extra:true,slot:'AM',ts:Date.now()-36e5,doseMcg:1000,inv:null});save();DP='r';tab='pdetail';render()")
    pg.locator('.hrow',has_text='extra').click();pg.wait_for_timeout(200);print('extra sheet amount editable:',pg.locator('#xAmt').is_editable());pg.click('#xDlg button:has-text("Cancel")')
    print('errors',errs);b.close()
