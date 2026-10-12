# Unit tests for the on-device plan text parser (parsePlan). Usage: python3 tests/test_parser.py <url>
import sys,json
from playwright.sync_api import sync_playwright
U=sys.argv[1]
CASES=[
 ('1mg week 1, 2mg weeks 2-5, then 4mg weekly', dict(steps=[[1000,1],[2000,4],[4000,None]],freq='weekdays')),
 ('250mcg daily PM for 8 weeks', dict(steps=[[250,8]],freq='daily',slot='PM')),
 ('2 mg daily AM', dict(steps=[[2000,None]],freq='daily',slot='AM')),
 ('500 mcg 5 days on 2 off', dict(steps=[[500,None]],freq='weekdays',weekdays=[1,2,3,4,5])),
 ('300mcg 3x per week at 9pm', dict(steps=[[300,None]],freq='xweek',timesPerWeek=3,slot='PM',time='21:00')),
 ('0.5 mg twice a week morning', dict(steps=[[500,None]],freq='xweek',timesPerWeek=2,slot='AM')),
 ('5mg daily for 2 weeks then 10mg daily', dict(steps=[[5000,2],[10000,None]],freq='daily')),
 ('100 mcg nightly for 30 days', dict(steps=[[100,4]],freq='daily',slot='PM')),
 ('2mg weekly, blah blah', dict(steps=[[2000,None]],freq='weekdays',unparsed_has='blah')),
 ('take it when I feel like it', dict(steps=[],unparsed_has='no dose found')),
]
fails=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome');pg=b.new_context(service_workers='block').new_page();pg.goto(U);pg.wait_for_timeout(800)
    for txt,exp in CASES:
        r=pg.evaluate("t=>parsePlan(t)",txt);got=dict(steps=[[s['mcg'],s['weeks']] for s in r['steps']])
        ok=got['steps']==exp['steps']
        for k in ('freq','slot','time','timesPerWeek','weekdays'):
            if k in exp and r[k]!=exp[k]: ok=False
        if 'unparsed_has' in exp and not any(exp['unparsed_has'] in u for u in r['unparsed']): ok=False
        if 'unparsed_has' not in exp and r['unparsed']: ok=False
        print('OK ' if ok else 'FAIL',repr(txt),'->',json.dumps({**got,'freq':r['freq'],'slot':r['slot'],'time':r['time'],'tpw':r['timesPerWeek'],'wd':r['weekdays'],'unparsed':r['unparsed']}))
        if not ok: fails.append(txt)
    b.close()
print('FAILS',fails);sys.exit(1 if fails else 0)
