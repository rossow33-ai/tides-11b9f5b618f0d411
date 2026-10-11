import sys
from playwright.sync_api import sync_playwright
U=sys.argv[1]; errs=[]; fails=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    def fresh():
        c=b.new_context(); pg=c.new_page(); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:m.type=='error' and errs.append(m.text)); return c,pg
    c,pg=fresh(); pg.goto(U); pg.wait_for_timeout(1500)
    # --- unit math: units = dose_mg / (vial_mg / bac_mL) * 100
    exp=lambda mcg,vial,bac=2: (mcg/1000)/(vial/bac)*100
    sg=pg.evaluate("SUGGESTED.items.flatMap(it=>it.phases.flatMap(ph=>it.vials.map(v=>[it.name,ph.mcg,v,sgUnits(ph.mcg,v)])))")
    for n,m,v,u in sg:
        if abs(u-exp(m,v))>1e-6: fails.append(('sg',n,m,v,u))
    ref=pg.evaluate("PEPTIDE_REF.flatMap(g=>g.entries.filter(e=>e.vialMg&&e.minMcg!=null).map(e=>[g.name,e.minMcg,e.maxMcg,e.vialMg,u100(e.vialMg,e.minMcg,2),u100(e.vialMg,e.maxMcg,2)]))")
    for n,a,bb,v,ua,ub in ref:
        if abs(ua-exp(a,v))>1e-6 or abs(ub-exp(bb,v))>1e-6: fails.append(('ref',n,v,ua,ub))
    lib=pg.evaluate("units({vialMg:10,bacMl:2},5000)")
    known={'SS-31 5mg/10mg':(pg.evaluate("sgUnits(5000,10)"),100),'SS-31 10mg/10mg':(pg.evaluate("sgUnits(10000,10)"),200),'library 5mg/10mg':(lib,100),
           'Reta 2mg/10mg':(pg.evaluate("sgUnits(2000,10)"),40),'NAD 50mg/500mg':(pg.evaluate("sgUnits(50000,500)"),20),'MT2 250mcg/10mg':(pg.evaluate("sgUnits(250,10)"),5)}
    for k,(got,want) in known.items():
        if abs(got-want)>1e-6: fails.append(('known',k,got,want))
    print('unit checks:',len(sg),'schedule cells,',len(ref),'reference rows,',len(known),'known values')
    c.close()
    # --- order import: order then suggested, and suggested then order
    for first,second in [('order-20261011','suggested'),('suggested','order-20261011')]:
        c,pg=fresh()
        for h in [first,second,first,second]:
            pg.goto(U+'#add='+h); pg.wait_for_timeout(1300)
        r=pg.evaluate("S.peptides.map(p=>[p.name,p.vialMg,p.vials,p.bacMl])")
        names=[x[0] for x in r]
        ok=len(names)==6 and len(set(n.lower() for n in names))==6 and pg.evaluate("S.protocols.length")==13
        vials={x[0]:(x[1],x[2]) for x in r}
        want={'Retatrutide':(10,2),'Tesamorelin':(10,2),'NAD+':(500,2),'SS-31':(10,2),'GLOW':(70,1),'Melanotan II':(10,2)}
        if not ok or vials!=want: fails.append(('order',first,r))
        print(first,'->',second,':',r)
        c.close()
    # existing-peptide match (case-insensitive) adds vials
    c,pg=fresh(); pg.goto(U); pg.wait_for_timeout(1000)
    pg.evaluate("S.peptides.push({id:'x',name:'tesamorelin',vialMg:5,bacMl:2,vials:1,remainingMg:3,reorderAt:1,expiryDays:28,reconDate:'',notes:''});save()")
    pg.goto(U+'#add=order-20261011'); pg.wait_for_timeout(1300)
    t=pg.evaluate("S.peptides.filter(p=>p.name.toLowerCase()==='tesamorelin').map(p=>[p.vialMg,p.vials,p.remainingMg])")
    print('existing match:',t)
    if t!=[[10,3,3]]: fails.append(('existing',t))
    c.close(); b.close()
print('FAILS',fails); print('ERRORS',errs)
sys.exit(1 if fails or errs else 0)
