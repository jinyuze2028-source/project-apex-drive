import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {launchTestBrowser} from './test-browser.mjs';

const [output='test-evidence/shortcuts',port='4177']=process.argv.slice(2);
mkdirSync(output,{recursive:true});
const browser=await launchTestBrowser();
const errors=[],actions={};
try {
  const page=await browser.newPage({viewport:{width:1440,height:960}});

  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.addInitScript(()=>{
    window.shiftSoundEvents=0;
    const setValue=AudioParam.prototype.setValueAtTime;
    AudioParam.prototype.setValueAtTime=function(value,...args){
      if(value===760)window.shiftSoundEvents++;
      return setValue.call(this,value,...args);
    };
  });
  const goto=async vehicle=>{
    await page.goto('http://127.0.0.1:'+port+'/?diagnostics&vehicle='+vehicle);
    await page.waitForFunction(()=>window.apexDiagnostics&&document.querySelector('#stage')?.dataset.ready==='true',null,{timeout:120000});
    await page.locator('[data-camera=cockpit]').evaluate(el=>el.click());
    await page.waitForFunction(()=>window.apexDiagnostics.state().view==='cockpit');
  };
  const state=()=>page.evaluate(()=>window.apexDiagnostics.state());
  const key=async character=>{await page.keyboard.press(character);};
  const waitState=(property,value)=>page.waitForFunction(([property,value])=>window.apexDiagnostics.state()[property]===value,[property,value]);
  const shortcut=name=>page.locator('[data-shortcut="'+name+'"]');

  await goto('r35');
  assert.equal((await state()).driverArms,false);
  assert.equal(await page.evaluate(()=>{
    const models=window.apexDiagnostics.inspect.visual.group.getObjectByName('Driver arms');
    return !models.visible&&models.children.length===4;
  }),true);
  await page.screenshot({path:output+'/r35-default.jpg'});
  await key('f'); await waitState('driverArms',true);
  assert.match(await shortcut('arms').textContent(),/Arms ON/);
  await page.screenshot({path:output+'/r35-arms.jpg'});
  await key('f');await waitState('driverArms',false);
  await page.waitForFunction(()=>document.querySelector('#control-notification').hidden);
  await key('m');await waitState('tractionControl',false);
  assert.match(await shortcut('traction').textContent(),/TC OFF/);
  await key('n');await waitState('absEnabled',false);
  assert.match(await shortcut('abs').textContent(),/ABS OFF/);
  await key('b');assert.match(await shortcut('wiper').textContent(),/LOW/);
  await key('h');await waitState('turn',2);
  await key('v');await waitState('lookYaw',0);
  assert.equal(await shortcut('shift-up').isHidden(),true);
  await key('e');
  assert.match(await page.locator('#control-notification').textContent(),/manual/);
  await key('i');await waitState('running',true);
  await page.waitForFunction(()=>window.apexDiagnostics.inspect.audio.ready);
  await page.locator('#scene canvas').waitFor();
  const lightPoint=await page.evaluate(()=>window.apexDiagnostics.controlPoint('light'));
  await page.mouse.click(lightPoint.x,lightPoint.y);
  await waitState('lights',true);
  assert.match(await shortcut('light').textContent(),/Lights ON/);
  await shortcut('light').evaluate(button=>button.click());
  await waitState('lights',false);
  await key('t');assert.match(await shortcut('transmission').textContent(),/MANUAL/);
  assert.equal(await shortcut('shift-up').isVisible(),true);

  const shifting=await page.evaluate(async()=>{
    const d=window.apexDiagnostics,oldSound=window.shiftSoundEvents;
    const now=performance.now(),samples=[];
    const press=(repeat=false)=>window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyE',repeat}));
    press();
    samples.push({time:performance.now()-now,gear:d.inspect.car.gear,
      displayed:d.state().indicatedGear,pending:d.state().pendingGear,feedback:document.querySelector('#control-notification').textContent});
    for(let i=0;i<14;i++){
      await new Promise(requestAnimationFrame);
      press(true);
      samples.push({time:performance.now()-now,gear:d.inspect.car.gear,displayed:d.state().indicatedGear,
        pending:d.state().pendingGear,paddle:d.inspect.visual.group.getObjectByName('R35 right paddle').rotation.y});
    }
    window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyE'}));
    return {samples,audioEvents:window.shiftSoundEvents-oldSound};
  });
  assert.equal(shifting.samples[0].gear,1);
  assert.equal(shifting.samples[0].displayed,0);
  assert.equal(shifting.samples[0].pending,1);
  assert.match(shifting.samples[0].feedback,/Shift requested/);
  assert.ok(shifting.samples.every(sample=>sample.gear===1));
  assert.ok(shifting.samples.some(sample=>sample.paddle>.065),JSON.stringify(shifting));
  assert.ok(shifting.audioEvents>=1,JSON.stringify(shifting));
  await waitState('pendingGear',null);
  await waitState('indicatedGear',1);
  await key('q');await waitState('pendingGear',0);
  await waitState('indicatedGear',0);

  const steering=await page.evaluate(async()=>{
    const visual=window.apexDiagnostics.inspect.visual,start=visual.steering.rotation.z;
    window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyA'}));
    await new Promise(resolve=>setTimeout(resolve,260));
    window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyA'}));
    return {delta:visual.steering.rotation.z-start,shown:visual.driver.visible};
  });
  assert.ok(Math.abs(steering.delta)>.1&&!steering.shown);
  await key('e');await waitState('indicatedGear',1);
  await page.keyboard.down('w');
  try{await page.waitForFunction(()=>window.apexDiagnostics.state().speed>5)}finally{await page.keyboard.up('w');}
  await key('t');
  assert.match(await page.locator('#control-notification').textContent(),/Stop the vehicle/);
  await page.locator('#settings').evaluate(el=>el.click());
  const settings=page.locator('#settings-dialog');
  await settings.locator('summary').click();
  await settings.locator('#abs-setting').check();
  await waitState('absEnabled',true);
  await settings.locator('#abs-setting').uncheck();
  await settings.locator('#driver-arms').check();
  await waitState('driverArms',true);
  await settings.locator('#driver-arms').uncheck();
  const bindings=settings.locator('#binding-fields select');
  assert.equal(await bindings.count(),14);
  const keyTable=await bindings.evaluateAll(fields=>fields.map(field=>field.value));
  assert.equal(new Set(keyTable).size,14);
  assert.ok(await settings.locator('#wiper-key option[value=KeyE]').isDisabled());
  await settings.locator('#wiper-key').selectOption('KeyU');
  await settings.locator('#control-notifications').uncheck();
  await settings.locator('#shortcut-visibility').uncheck();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#shortcut-strip').isHidden(),true);
  await key('u');
  assert.equal(await page.locator('#control-notification').isHidden(),true);
  assert.match(await shortcut('wiper').textContent(),/^U Wiper|^UWiper/);
  await page.locator('#settings').evaluate(el=>el.click());
  await settings.locator('#shortcut-visibility').check();
  await settings.locator('#control-notifications').check();
  await settings.locator('#restore-bindings').click();
  await page.keyboard.press('Escape');
  assert.match(await shortcut('wiper').textContent(),/^B/);
  await page.locator('#controls').evaluate(el=>el.click());
  assert.match(await page.locator('#controls-reference').textContent(),/ABS · OFF · N/);
  await page.keyboard.press('Escape');
  const layouts=[];
  for(const width of [1920,1440,1280,1024,768,390,320]){
    await page.setViewportSize({width,height:960});
    const layout=await page.locator('.footer').evaluate(e=>{
      const box=e.getBoundingClientRect(),strip=e.querySelector('.shortcut-strip');
      const action=e.querySelector('.footer-actions').getBoundingClientRect();
      const row=e.querySelector('#vehicle-keys');
      const children=[...strip.querySelectorAll('button')].filter(b=>b.getClientRects().length);
      const last=Math.max(strip.querySelector('.keys').getBoundingClientRect().right,...children.map(b=>b.getBoundingClientRect().right));
      return {footerOverflow:e.scrollWidth-e.clientWidth,overlap:last-action.left,rows:[...new Set(children.map(b=>Math.round(b.getBoundingClientRect().top)))].length,
        visibleButtons:children.length,viewportOverflow:document.documentElement.scrollWidth-window.innerWidth,box:box.width,collapsed:!row.getClientRects().length};
    });
    assert.ok(layout.footerOverflow<1&&layout.overlap<=1&&layout.viewportOverflow<1,JSON.stringify({width,layout}));
    layouts.push({width,...layout});
    if(width===390)await page.screenshot({path:output+'/narrow.jpg'});
  }
  await page.setViewportSize({width:1440,height:960});
  await key('f');await waitState('driverArms',true);
  await goto('f40');
  assert.equal((await state()).driverArms,true);
  assert.equal(await shortcut('abs').isHidden(),true);
  await page.screenshot({path:output+'/f40-default.jpg'});
  await key('f');await waitState('driverArms',false);
  await goto('r35');assert.equal((await state()).driverArms,true);
  await key('f');await waitState('driverArms',false);
  await goto('f40');assert.equal((await state()).driverArms,false);
  await key('f');await waitState('driverArms',true);
  actions.shifting=shifting;
  actions.steering=steering;
  actions.layouts=layouts;
  actions.distinctBindings=keyTable.length;
  actions.independentDriverVisibility=true;
  assert.deepEqual(errors,[]);
} finally {
  await browser.close();
  writeFileSync(output+'/results.json',JSON.stringify({actions,errors},null,2));
}
