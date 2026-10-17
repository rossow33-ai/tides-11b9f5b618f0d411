import sys
from playwright.sync_api import sync_playwright
U=sys.argv[1];errs=[];SS='/workspace/peptide-tracker/screenshots/'
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome');pg=b.new_context(service_workers='block',viewport={'width':390,'height':844},device_scale_factor=2).new_page()
    pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('console',lambda m:m.type=='error' and errs.append(m.text))
    pg.goto(U);pg.wait_for_timeout(600)
    pg.evaluate("""const mon=new Date();S={peptides:[{id:'s',name:'SS-31',vialMg:10,bacMl:2,vials:1,remainingMg:3,reorderAt:0,expiryDays:28,reconDate:'2026-10-10',notes:''},{id:'n',name:'NAD+',vialMg:500,bacMl:5,vials:1,remainingMg:400,reorderAt:0,expiryDays:28,reconDate:'2026-10-10',notes:''},{id:'t',name:'Tesamorelin',vialMg:10,bacMl:2,vials:0,remainingMg:6,reorderAt:0,expiryDays:28,reconDate:'2026-10-10',notes:''}],
     protocols:[{id:'rs',peptideId:'s',doseMcg:2000,time:'08:00',freq:'daily',active:true},{id:'rn',peptideId:'n',doseMcg:100000,time:'09:00',freq:'xweek',timesPerWeek:2,active:true},{id:'rt',peptideId:'t',doseMcg:2000,time:'21:00',freq:'daily',active:true}],logs:[],settings:{}};save()""")
    pg.reload();pg.wait_for_timeout(1000);pg.click('#tabs [data-tab=today]');pg.wait_for_timeout(300)
    st=lambda pid:pg.evaluate(f"JSON.stringify([pep('{pid}').vials,pep('{pid}').remainingMg,(pep('{pid}').vialsHist||[]).length,S.settings.bac.remaining,S.logs.length])")
    print('plus btn:',pg.locator('button.addx').get_attribute('aria-label'),repr(pg.locator('button.addx').inner_text()))
    pg.click('button.addx');pg.wait_for_timeout(300)
    print('sheet default SS-31:',pg.locator('#xAmt').input_value(),pg.locator('#xU').inner_text())
    pg.select_option('#xPep','n');pg.wait_for_timeout(200);print('NAD default:',pg.locator('#xAmt').input_value(),pg.locator('#xU').inner_text())
    pg.screenshot(path=SS+'B1-add-dose-sheet.png')
    print('NAD before',st('n'),'week text:',pg.evaluate("weekLogs(S.protocols[1],new Date())"))
    pg.click('#xDlg button:has-text("Log dose")');pg.wait_for_timeout(300)
    print('NAD after',st('n'),'weekLogs',pg.evaluate("weekLogs(S.protocols[1],new Date())"),'log',pg.evaluate("JSON.stringify(S.logs.at(-1),['extra','protocolId','slot','doseMcg','vialId'])"))
    # extra SS-31 4mg with only 3 mg left -> auto new vial
    pg.click('button.addx');pg.wait_for_timeout(200);pg.select_option('#xPep','s');pg.fill('#xAmt','4');pg.wait_for_timeout(100);print('ss units',pg.locator('#xU').inner_text())
    before=st('s');pg.click('#xDlg button:has-text("Log dose")');pg.wait_for_timeout(300);print('SS before',before,'after',st('s'))
    print('SS plan still due (not checked):',pg.evaluate("!logsOn('s',new Date()).some(l=>l.protocolId==='rs')"),'dueToday',pg.evaluate("JSON.stringify(dueToday())"))
    print('today:',pg.locator('#view').inner_text().replace('\n',' | '))
    pg.screenshot(path=SS+'B0-today-extra.png',full_page=True)
    # edit extra
    pg.locator('.trow2',has_text='extra').filter(has_text='SS-31').locator('.sp').click();pg.wait_for_timeout(200);pg.fill('#xAmt','3');pg.click('#xDlg button:has-text("Save")');pg.wait_for_timeout(300);print('after edit 4->3',st('s'))
    # unlog
    pg.locator('.trow2',has_text='extra').filter(has_text='SS-31').locator('.chk').click();pg.wait_for_timeout(300);print('SS after unlog',st('s'))
    pg.locator('.trow2',has_text='extra').filter(has_text='NAD').locator('.chk').click();pg.wait_for_timeout(300);print('NAD after unlog',st('n'))
    pg.evaluate("tab='pdetail';DP='s';render()")
    print('history ok:',pg.evaluate("S.logs.length"),'errors',errs);b.close()
