import sys
from playwright.sync_api import sync_playwright
U=sys.argv[1]; shots=len(sys.argv)<3; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':420,'height':900},device_scale_factor=2)
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:m.type=='error' and errs.append(m.text))
    pg.goto(U); pg.wait_for_timeout(1500)
    pg.wait_for_selector('#khit',timeout=30000); pg.click('#khit'); pg.wait_for_timeout(200)
    for k in '1234': pg.click(f'#pad [data-k="{k}"]')
    pg.wait_for_timeout(500)
    for k in '1004': pg.click(f'#pad [data-k="{k}"]')
    pg.wait_for_timeout(500); print('unlocked', not pg.is_visible('#lock'))
    pg.click('text=Load demo data'); pg.wait_for_timeout(800)
    def go(t): pg.click('#ham'); pg.wait_for_timeout(300); pg.click(f'#drawer [data-go={t}]'); pg.wait_for_timeout(300)
    for t in ['peptides','protocols','reference','calc','data','settings','suggested']: go(t)
    if shots: pg.screenshot(path='screenshots/07-suggested-schedule.png',full_page=True)
    pg.click('text=Add as protocols (paused)'); pg.wait_for_timeout(300)
    for t in ['History','Inventory','Today']: pg.click(f'nav >> text={t}'); pg.wait_for_timeout(800)
    print('protocols', pg.evaluate('S.protocols.length'), 'version', pg.evaluate('APP_VERSION'))
    b.close()
print('ERRORS',errs)
