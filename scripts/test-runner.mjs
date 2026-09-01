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
  assert(app.includes('adminTools:['),'Adivinhando não declara ferramentas administrativas no manifesto');
  assert(app.includes("id:'simulate_comments'"),'simulador de comentários não está declarado pelo próprio jogo');
  assert(app.includes("id:'simulate_comment'"),'palavra manual de teste não está declarada pelo próprio jogo');
  assert(app.includes("id:'stop_comment_simulation'"),'controle de parada do simulador não está declarado pelo próprio jogo');
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
  const context=await browser.newContext({viewport,isMobile:viewport.width<600,hasTouch:viewport.width<600});
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
      const adminIds=await page.evaluate(()=>window.Adivinhando.manifest.adminTools.map(item=>item.id));
      assert(adminIds.includes('simulate_comments'),'manifesto não expõe simulador administrativo');
      assert(adminIds.includes('simulate_comment'),'manifesto não expõe palavra manual de teste');
      assert(adminIds.includes('stop_comment_simulation'),'manifesto não expõe parada da simulação');
      await page.click('#panelButton');
      await page.fill('#panelCode','AAAA-BBBB');
      await page.click('#connectPanel');
      await page.waitForFunction(()=>!document.querySelector('#panelModal').classList.contains('show'));
      assert((await page.evaluate(()=>window.__qaSessions.length))===1,'primeira sessão não criada');
      await page.click('#panelButton');
      await page.fill('#panelCode','CCCC-DDDD');
      await page.click('#connectPanel');
      await page.waitForFunction(()=>window.__qaSessions.length===2);
      assert(await page.evaluate(()=>window.__qaSessions[0].disconnected),'sessão antiga não foi desconectada');
      await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.Adivinhando);
      await page.click('#panelButton');
      await page.waitForTimeout(900);
      assert(await page.locator('#panelModal').evaluate(el=>el.classList.contains('show')),'reconexão automática fechou o modal');
      await page.click('#closePanel');

      const answer=await page.evaluate(()=>window.Adivinhando.state.answer);
      await page.evaluate(answer=>window.Adivinhando.comment('qa-user',answer),answer);
      await page.waitForFunction(()=>document.querySelector('#winner').classList.contains('show'));
      assert(errors.length===0,`Erros no navegador: ${errors.join(' | ')}`);
      console.log('QA OK · conexão, troca de sessão, manifesto admin e rodada testadas');
    }finally{await browser.close()}
  });
}

async function visual(){
  const chromium=await browser();
  const cases=[['iphone-13',{width:390,height:844}],['android-small',{width:360,height:740}],['tablet',{width:768,height:1024}],['desktop',{width:1440,height:900}]];
  const report=[];
  await fs.mkdir(path.join(root,'artifacts','visual'),{recursive:true});
  await withServer(async()=>{
    for(const[name,viewport]of cases){
      const{browser,page}=await newPage(chromium,viewport);
      try{
        await waitBoot(page);
        const metrics=await page.evaluate(()=>({innerWidth,innerHeight,scrollWidth:document.documentElement.scrollWidth,bodyWidth:document.body.getBoundingClientRect().width,secret:document.querySelector('#secret')?.getBoundingClientRect(),panel:document.querySelector('#panelButton')?.getBoundingClientRect()}));
        assert(metrics.scrollWidth<=metrics.innerWidth+1,`${name}: overflow horizontal ${metrics.scrollWidth}>${metrics.innerWidth}`);
        assert(metrics.bodyWidth<=metrics.innerWidth+1,`${name}: body maior que viewport`);
        assert(metrics.panel&&metrics.panel.right<=metrics.innerWidth+1&&metrics.panel.left>=-1,`${name}: botão painel fora da tela`);
        await page.click('#panelButton');
        const modal=await page.locator('#panelModal .modal').boundingBox();
        assert(modal&&modal.width<=metrics.innerWidth-8,`${name}: modal excede viewport`);
        await page.screenshot({path:path.join(root,'artifacts','visual',`${name}.png`),fullPage:true});
        report.push({name,viewport,metrics:{innerWidth:metrics.innerWidth,innerHeight:metrics.innerHeight,scrollWidth:metrics.scrollWidth,bodyWidth:metrics.bodyWidth},modal});
      }finally{await browser.close()}
    }
  });
  await fs.writeFile(path.join(root,'artifacts','visual','visual-report.json'),JSON.stringify(report,null,2));
  console.log('VISUAL OK ·',report.map(x=>x.name).join(', '));
}

if(mode==='ci')await ci();else if(mode==='qa')await qa();else if(mode==='visual')await visual();else throw new Error(`Modo inválido: ${mode}`);
