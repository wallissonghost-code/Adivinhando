import fs from'node:fs/promises';
import path from'node:path';
import process from'node:process';
import {spawn}from'node:child_process';
import {fileURLToPath}from'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mode=process.argv[2]||'ci';
const BASE='http://127.0.0.1:4173';

function assert(condition,message){if(!condition)throw new Error(message)}
async function exists(file){try{await fs.access(path.join(root,file));return true}catch{return false}}

async function ci(){
  const required=['index.html','version.json','assets/styles.css','data/words.js','js/bootstrap.js','js/app.js','js/game.js','js/liveplus.js','js/mobile.js','js/cache.js','js/semantic.js'];
  for(const file of required)assert(await exists(file),`Arquivo obrigatório ausente: ${file}`);
  assert(!(await exists('words.js')),'words.js antigo ainda existe na raiz');
  const version=JSON.parse(await fs.readFile(path.join(root,'version.json'),'utf8'));
  assert(/^Beta \d+\.\d+\.\d+$/.test(String(version.version||'')),'version.json: version inválida');
  assert(String(version.build||'').length>0,'version.json: build ausente');
  const index=await fs.readFile(path.join(root,'index.html'),'utf8');
  assert(index.includes('./js/bootstrap.js'),'index.html não carrega bootstrap.js');
  assert(!index.includes('<style>'),'CSS inline voltou ao index.html');
  assert(!index.includes('type="module"'),'JS principal voltou a ficar inline no index.html');
  const app=await fs.readFile(path.join(root,'js/app.js'),'utf8');
  assert(app.includes("import(`./liveplus.js"),'app.js não carrega liveplus.js');
  assert(app.includes('liveplus?.sendState(snapshot)'),'estado do jogo não está sincronizado com LIVE+');
  const live=await fs.readFile(path.join(root,'js/liveplus.js'),'utf8');
  assert(live.includes('disposeSession'),'LIVE+ não possui descarte/troca de sessão');
  assert(live.includes('parsed.code!==activeCode'),'LIVE+ não detecta troca de código');
  console.log(`CI OK · ${version.version} · build ${version.build}`);
}

function fakeSdk(){return`(()=>{class S extends EventTarget{constructor(o={}){super();this.options=o;this.transport='offline';this.disconnected=false;window.__qaSessions=(window.__qaSessions||[]);window.__qaSessions.push(this)}async connect(code){this.code=String(code);this.transport='websocket';await new Promise(r=>setTimeout(r,30));this.dispatchEvent(new CustomEvent('connected',{detail:{code:this.code}}));this.dispatchEvent(new CustomEvent('transport',{detail:{status:'connected',transport:'websocket'}}));return true}disconnect(){this.disconnected=true;this.transport='offline';this.dispatchEvent(new CustomEvent('transport',{detail:{status:'disconnected',transport:'offline'}}))}getTransport(){return this.transport}sendState(v){this.lastState=v}sendEvent(v){this.lastEvent=v}}window.LivePlusGameSDK={Session:S,version:'qa',installPasteBridge(){},configureRelay(){},parseTicket(){return null}}})();`}

async function withServer(run){
  const server=spawn('python3',['-m','http.server','4173','--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
  try{await new Promise(r=>setTimeout(r,500));return await run()}finally{server.kill('SIGTERM')}
}

async function browser(){
  const{chromium}=await import('playwright');
  return chromium;
}

async function newPage(chromium,viewport={width:390,height:844}){
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewportSize:viewport,isMobile:viewport.width<600,hasTouch:viewport.width<600});
  const page=await context.newPage();
  await page.route('**/projeto-daniel/sdk/liveplus-game-sdk-v1.js*',route=>route.fulfill({status:200,contentType:'application/javascript',body:fakeSdk()}));
  return{browser,context,page};
}

async function waitBoot(page){
  await page.goto(`${BASE}/?qa=1`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.Adivinhando,{timeout:10000});
}

async function qa(){
  const chromium=await browser();
  await withServer(async()=>{
    const{browser,page}=await newPage(chromium);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    try{
      await waitBoot(page);
      assert(await page.locator('#versionLabel').textContent()==='Beta 0.0.3','versão visual incorreta');
      await page.click('#panelButton');
      await page.fill('#panelCode','AAAA-BBBB');
      await page.click('#connectPanel');
      await page.waitForFunction(()=>!document.querySelector('#panelModal').classList.contains('show'));
      await page.click('#panelButton');
      await page.fill('#panelCode','CCCC-DDDD');
      await page.click('#connectPanel');
      await page.waitForFunction(()=>!document.querySelector('#panelModal').classList.contains('show'));
      const swap=await page.evaluate(()=>({count:window.__qaSessions?.length||0,oldDisconnected:!!window.__qaSessions?.[0]?.disconnected,active:window.Adivinhando.getActivePanelCode?.()}));
      assert(swap.count>=2,'troca de código não criou nova sessão');
      assert(swap.oldDisconnected,'sessão anterior não foi desconectada');
      assert(swap.active==='CCCCDDDD','novo código não ficou ativo');

      await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.Adivinhando);
      await page.click('#panelButton');
      await page.waitForTimeout(900);
      assert(await page.locator('#panelModal').evaluate(el=>el.classList.contains('show')),'reconexão automática fechou o modal');
      await page.click('#closePanel');

      const answer=await page.evaluate(()=>window.Adivinhando.state.answer);
      await page.evaluate(answer=>window.Adivinhando.comment('qa-user',answer),answer);
      await page.waitForFunction(()=>document.querySelector('#winner').classList.contains('show'));
      assert(errors.length===0,`Erros no navegador: ${errors.join(' | ')}`);
      console.log('QA OK · conexão, troca de sessão, reconexão e rodada testadas');
    }finally{await browser.close()}
  });
}

function rectIssue(rect,w,h,name){
  if(!rect)return`${name}: ausente`;
  if(rect.left<-1||rect.right>w+1)return`${name}: vazando horizontalmente (${Math.round(rect.left)}..${Math.round(rect.right)} / ${w})`;
  if(rect.width<=0||rect.height<=0)return`${name}: dimensão inválida`;
  return'';
}

async function visual(){
  const chromium=await browser();
  const outDir=path.join(root,'artifacts','visual');await fs.mkdir(outDir,{recursive:true});
  const viewports=[{name:'iphone-13',width:390,height:844},{name:'android-small',width:360,height:800},{name:'tablet',width:768,height:1024},{name:'desktop',width:1440,height:900}];
  const report=[];
  await withServer(async()=>{
    for(const vp of viewports){
      const{browser,page}=await newPage(chromium,{width:vp.width,height:vp.height});
      const issues=[];const consoleErrors=[];page.on('pageerror',e=>consoleErrors.push(e.message));
      try{
        await waitBoot(page);await page.waitForTimeout(120);
        const scan=await page.evaluate(()=>{
          const r=id=>{const el=document.querySelector(id);if(!el)return null;const x=el.getBoundingClientRect();return{left:x.left,right:x.right,top:x.top,bottom:x.bottom,width:x.width,height:x.height}};
          return{innerWidth,innerHeight,scrollWidth:document.documentElement.scrollWidth,viewport:document.querySelector('meta[name=viewport]')?.content||'',stage:r('.stage'),top:r('.top'),secret:r('#secret'),board:r('.board'),button:r('#panelButton'),version:r('#versionLabel')};
        });
        if(scan.scrollWidth>scan.innerWidth+1)issues.push(`zoom/layout: scroll horizontal ${scan.scrollWidth}px > ${scan.innerWidth}px`);
        if(!/user-scalable=no/.test(scan.viewport)||!/maximum-scale=1/.test(scan.viewport))issues.push('zoom: viewport não está travado');
        for(const[name,rect]of Object.entries({stage:scan.stage,top:scan.top,secret:scan.secret,board:scan.board,panelButton:scan.button,version:scan.version})){const issue=rectIssue(rect,scan.innerWidth,scan.innerHeight,name);if(issue)issues.push(issue)}
        await page.screenshot({path:path.join(outDir,`${vp.name}-game.png`),fullPage:true});
        await page.click('#panelButton');await page.waitForTimeout(80);
        const modal=await page.locator('.card').boundingBox();
        if(!modal||modal.x<0||modal.x+modal.width>vp.width+1)issues.push('modal: vazando horizontalmente');
        if(modal&&modal.width>vp.width-10)issues.push('modal: sem margem segura lateral');
        await page.screenshot({path:path.join(outDir,`${vp.name}-panel.png`),fullPage:true});
        if(consoleErrors.length)issues.push(...consoleErrors.map(e=>'browser: '+e));
        report.push({...vp,status:issues.length?'fail':'pass',issues});
      }finally{await browser.close()}
    }
  });
  await fs.writeFile(path.join(outDir,'visual-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  const failures=report.filter(x=>x.issues.length);
  assert(!failures.length,`Visual QA encontrou ${failures.reduce((n,x)=>n+x.issues.length,0)} problema(s)`);
  console.log('VISUAL AI OK · zoom, HUD/layout, modal e overflow verificados em 4 telas');
}

try{
  if(mode==='ci')await ci();
  else if(mode==='qa')await qa();
  else if(mode==='visual')await visual();
  else throw new Error(`Modo desconhecido: ${mode}`);
}catch(error){console.error(error.stack||error);process.exit(1)}
