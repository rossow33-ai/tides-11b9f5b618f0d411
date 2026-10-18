import sys
from playwright.sync_api import sync_playwright
U=sys.argv[1];errs=[];SS='/workspace/peptide-tracker/screenshots/'
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome');pg=b.new_context(service_workers='block',viewport={'width':390,'height':844},device_scale_factor=2).new_page()
    pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('console',lambda m:m.type=='error' and errs.append(m.text))
    pg.goto(U);pg.wait_for_timeout(600)
    pg.evaluate("""const D=n=>{const d=new Date();d.setDate(d.getDate()-n);return d};const L=[];
     for(let i=40;i>=1;i-=1.5|0||1){}
     const v1='va',v2='vb';
     for(let i=48;i>=0;i-=2){const d=D(i);d.setHours(21,5,0,0);L.push({id:'l'+i,peptideId:'t',protocolId:'rt',ts:+d,doseMcg:2000,site:'',notes:'',side:'',vialId:i>40?null:(i>10?v1:v2)})}
     const x=D(1);x.setHours(9,30,0,0);L.push({id:'lx',peptideId:'t',protocolId:null,extra:true,slot:'AM',ts:+x,doseMcg:1000,site:'',notes:'',side:'',vialId:v2});
     S={peptides:[{id:'t',name:'Tesamorelin',vialMg:10,bacMl:2,vials:1,remainingMg:6,reorderAt:0,expiryDays:28,reconDate:ymd(D(10)),curVial:v2,
       vialsHist:[{id:v1,mixed:ymd(D(40)),finished:ymd(D(10)),bac:2,mg:10,discarded:0},{id:v2,mixed:ymd(D(10)),finished:'',bac:2,mg:10,discarded:0}],notes:''}],
      protocols:[{id:'rt',peptideId:'t',doseMcg:2000,time:'21:00',freq:'daily',active:true}],logs:L,settings:{bac:{bottleMl:30,remaining:26,sealed:1}}};save()""")
    pg.reload();pg.wait_for_timeout(900);pg.click('#tabs [data-tab=list]');pg.wait_for_timeout(200);pg.locator('.pcard',has_text='Tesamorelin').click();pg.wait_for_timeout(300)
    t=pg.locator('#view').inner_text();print('order Plan<History<Vials:',t.index('Plan')<t.index('History')<t.index('Mixed'))
    card=pg.locator('.card',has_text='History').first
    print('head:',card.inner_text().split('\n')[:9])
    print('rows',pg.locator('.hrow').count(),'more:',pg.locator('button',has_text='Show more').inner_text())
    pg.screenshot(path=SS+'C0-peptide-history.png')
    pg.locator('button',has_text='Show more').click();pg.wait_for_timeout(200);print('rows after more',pg.locator('.hrow').count(),'Earlier tags',pg.locator('.hrow',has_text='Earlier').count())
    inv=lambda:pg.evaluate("JSON.stringify([pep('t').remainingMg,pep('t').vials,S.logs.length])")
    print('inv',inv());pg.locator('.hrow',has_text='extra').click();pg.wait_for_timeout(200);print('sheet:',pg.locator('#xDlg h3').inner_text(),pg.locator('#xAmt').input_value())
    pg.fill('#xAmt','1.5');pg.click('#xDlg button:has-text("Save")');pg.wait_for_timeout(300);print('after edit extra 1->1.5mg',inv());pg.evaluate("document.querySelectorAll('dialog[open]').forEach(d=>d.close())")
    pg.locator('.hrow',has_text='extra').click();pg.wait_for_timeout(200);pg.click('#xDlg button:has-text("Remove")');pg.wait_for_timeout(300);print('after remove',inv(),'extra rows',pg.locator('.hrow',has_text='extra').count())
    pg.locator('.hrow').first.click();pg.wait_for_timeout(200);print('sched sheet:',pg.locator('#xDlg h3').inner_text());pg.click('#xDlg button:has-text("Cancel")')
    print('tab',pg.evaluate('tab'),'errors',errs);b.close()
