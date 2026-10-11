import sys,json
from playwright.sync_api import sync_playwright
U=sys.argv[1]; IMG=sys.argv[3] if len(sys.argv)>3 else 'order.png'
shot=len(sys.argv)>2 and sys.argv[2]=='shot'; errs=[]
WANT=[('Retatrutide',10,2),('Tesamorelin',10,2),('NAD+',500,2),('SS-31',10,2),('GLOW',70,1),('Melanotan II',10,2)]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':420,'height':900},device_scale_factor=2)
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:m.type=='error' and errs.append(m.text))
    pg.goto(U); pg.wait_for_timeout(1500)
    pg.wait_for_selector('#khit',timeout=30000); pg.click('#khit'); pg.wait_for_timeout(200)
    for k in '1004': pg.click(f'#pad [data-k="{k}"]')
    pg.wait_for_timeout(400)
    print('tesseract loaded before use:', pg.evaluate('!!window.Tesseract'))
    pg.click('#ham'); pg.wait_for_timeout(300)
    with pg.expect_file_chooser() as fc: pg.click('#drawer >> text=Load order')
    fc.value.set_files(IMG)
    pg.wait_for_function('document.querySelector("#ordOk") && !document.querySelector("#ocrProg").textContent.trim()',timeout=180000)
    rows=pg.evaluate('__orderRows()')
    got=[(r['name'],r['size'],r['qty']) for r in rows if r['include']]
    print('ROWS',json.dumps([(r['name'],r.get('raw'),r['size'],r['unit'],r['qty'],r['include'],r['how']) for r in rows]))
    if shot: pg.screenshot(path='screenshots/08-order-review.png')
    hits=sum(1 for w in WANT if w in got); extra=[g for g in got if g not in WANT]
    print(f'ACCURACY {hits}/6 correct, extras={extra}')
    pg.click('#ordOk'); pg.wait_for_timeout(500)
    print('inventory', pg.evaluate("S.peptides.map(p=>[p.name,p.vialMg,p.vials,p.bacMl])"))
    b.close()
print('ERRORS',errs)
