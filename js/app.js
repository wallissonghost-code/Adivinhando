export async function bootAdivinhando(){
  const build=String(window.ADIVINHANDO_BUILD||Date.now());
  const version=String(window.ADIVINHANDO_VERSION||'Beta 0.0.3');
  const params=new URLSearchParams(location.search);
  if(params.get('qa')==='1')window.ADIVINHANDO_QA=true;
  const [{createGame},{createLivePlusController},{installMobileGuards},{refreshPage,clearCacheAndRefresh}]=await Promise.all([
    import(`./game.js?v=${encodeURIComponent(build)}`),
    import(`./liveplus.js?v=${encodeURIComponent(build)}`),
    import(`./mobile.js?v=${encodeURIComponent(build)}`),
    import(`./cache.js?v=${encodeURIComponent(build)}`)
  ]);

  const $=id=>document.getElementById(id);
  const TEST_WORDS=['uva','banana','maçã','laranja','mamão','melancia','morango','abacaxi','limão','manga','vinho','suco','fruta','comida','arroz','feijão','pizza','pão','queijo','café','leite','ovo','carro','moto','avião','barco','casa','porta','janela','mesa','cadeira','cama','sofá','telefone','computador','livro','caneta','bola','camisa','sapato','cachorro','gato','cavalo','leão','tigre','elefante','macaco','peixe','pássaro','árvore','flor','praia','rio','montanha','chuva','sol','lua','estrela','fogo','água','terra','amor','feliz','rápido','grande','pequeno'];
  const manifest={protocol:'liveplus-game-manifest-v1',gameId:'adivinhando',name:'Adivinhando',icon:'🎯',version,actions:[
    {id:'next_round',label:'Próxima palavra',icon:'⏭️',params:[]},
    {id:'start_round',label:'Iniciar rodada',icon:'▶️',params:[{id:'category',label:'CATEGORIA',type:'select',default:'mixed',options:[{value:'mixed',label:'Misturado'},{value:'animais',label:'Animais'},{value:'frutas',label:'Frutas'},{value:'comidas',label:'Comidas'},{value:'objetos',label:'Objetos'}]}]},
    {id:'stop_rounds',label:'Parar rodadas',icon:'⏹️',params:[]}
  ],adminTools:[
    {id:'simulate_comments',label:'Simular comentários',icon:'🧪',description:'Gera palpites aleatórios no próprio Adivinhando para testar ranking e HUD. Não entra em regras ou doações.',params:[{id:'count',label:'QUANTIDADE',type:'number',default:50,min:1,max:500,step:1},{id:'intervalMs',label:'INTERVALO',type:'select',default:'500',options:[{value:'1000',label:'1 por segundo'},{value:'500',label:'2 por segundo'},{value:'250',label:'4 por segundo'},{value:'100',label:'10 por segundo'}]}]},
    {id:'simulate_comment',label:'Enviar palavra de teste',icon:'💬',description:'Envia um único palpite manual de teste para a rodada atual.',params:[{id:'word',label:'PALAVRA',type:'text',default:''}]},
    {id:'stop_comment_simulation',label:'Parar simulação',icon:'⏹️',description:'Interrompe uma sequência automática de comentários de teste.',params:[]}
  ]};

  let game=null;
  let liveplus=null;
  let simulationTimer=null;
  let simulatedSent=0;

  function escapeHtml(value){return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[char]))}
  function setStatus(text,kind=''){
    const status=$('pairStatus');if(status){status.textContent=text;status.className='status '+kind}
    $('panelButton')?.classList.toggle('online',kind==='ok');
    $('panelButton')?.classList.toggle('warn',kind==='warn');
  }
  function render(view=game?.view?.()){
    if(!view)return;
    $('secret').textContent=view.finished?view.answer.toUpperCase():view.masked;
    $('categoryPublic').textContent=view.categoryLabel;
    if(!view.finished)$('roundInfo').textContent='Comente seu palpite!';
    const winner=$('winner');
    if(view.finished&&view.winner){
      $('winnerText').textContent=`@${view.winner} acertou!`;
      $('winnerMeta').textContent=`A palavra era ${view.answer.toUpperCase()}`;
      winner.classList.add('show');$('roundInfo').textContent='Mandou bem! 🎉';
    }else{
      winner.classList.remove('show');
      if(view.finished)$('roundInfo').textContent=`A palavra era ${view.answer.toUpperCase()}`;
    }
    const best=view.results||[];
    $('rows').innerHTML=best.length?best.map(row=>`<div class="row ${row.cls}"><div class="rank">#${row.rank.toLocaleString('pt-BR')}</div><div class="guess"><strong>${escapeHtml(row.guess)}</strong><span>@${escapeHtml(row.username)}</span></div><div class="heat">${row.heat}</div></div>`).join(''):'<div class="empty">As melhores tentativas aparecem aqui.</div>';
  }

  function stopCommentSimulation(){clearInterval(simulationTimer);simulationTimer=null;simulatedSent=0;return true}
  function randomTestWord(){const answer=String(game?.state?.answer||'');const pool=TEST_WORDS.filter(word=>String(word).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()!==answer);return pool[Math.floor(Math.random()*pool.length)]||'teste'}
  function simulatedUsername(index=0){return `teste_${String(index+1).padStart(2,'0')}`}
  function simulateOne(word,username){const text=String(word||'').trim();if(!text)return false;game.guess(username||simulatedUsername(simulatedSent),text);simulatedSent++;return true}
  function startCommentSimulation(payload={}){
    stopCommentSimulation();
    const count=Math.max(1,Math.min(500,Number(payload.count)||50));
    const interval=Math.max(100,Math.min(5000,Number(payload.intervalMs)||500));
    let done=0;
    const tick=()=>{if(done>=count||game?.state?.finished){stopCommentSimulation();return}simulateOne(randomTestWord(),simulatedUsername(done));done++};
    tick();
    if(done<count&&!game?.state?.finished)simulationTimer=setInterval(tick,interval);
    return true;
  }

  function executeCommand(data={}){
    const action=String(data.action||data.command||''),payload=data.params&&typeof data.params==='object'?data.params:{};
    if(action==='next_round'){game.start(payload);return true}
    if(action==='start_round'){game.resume(payload);return true}
    if(action==='stop_rounds'){game.stop();return true}
    if(action==='simulate_comments')return startCommentSimulation(payload);
    if(action==='simulate_comment')return simulateOne(payload.word,'teste_manual');
    if(action==='stop_comment_simulation')return stopCommentSimulation();
    return false;
  }
  function ingestLiveEvent(data={}){
    const type=String(data.type||data.event||data.eventType||'').toLowerCase();
    if(!['comment','chat','tiktok-comment','tiktok_comment'].includes(type))return false;
    const user=data.username||data.nickname||data.user?.uniqueId||data.user?.nickname||data.user||data.uniqueId||'anonimo';
    const text=data.comment||data.text||data.message||data.commentText||'';
    game.guess(user,text);return true;
  }

  game=await createGame({
    version,
    onState:snapshot=>{render();liveplus?.sendState(snapshot)},
    onEvent:event=>liveplus?.sendEvent(event)
  });
  liveplus=createLivePlusController({
    manifest,
    onStatus:setStatus,
    onConnected:(_session,info={})=>{
      liveplus.sendState(game.snapshot('initial'));
      if(info.manual)setTimeout(()=>{
        $('panelModal')?.classList.remove('show');
        $('panelModal')?.setAttribute('aria-hidden','true');
      },450);
    },
    onCommand:(data,session)=>{const ok=executeCommand(data);if(!ok)session?.sendState?.({scope:'command',gameId:'adivinhando',commandStatus:'unsupported',action:String(data.action||data.command||'')})},
    onMessage:ingestLiveEvent
  });

  const syncTimer=setInterval(()=>{if(liveplus.getTransport()!=='offline')liveplus.sendState(game.snapshot('heartbeat'))},30000);
  window.addEventListener('pagehide',()=>{clearInterval(syncTimer);stopCommentSimulation()},{once:true});

  $('versionLabel').textContent=version;
  document.title=`Adivinhando · ${version}`;
  installMobileGuards();
  liveplus.installPasteBridge('panelCode');

  $('panelButton').onclick=()=>{
    $('panelModal').classList.add('show');
    $('panelModal').setAttribute('aria-hidden','false');
    const saved=liveplus.savedCode();if(saved)$('panelCode').value=liveplus.formatCode(saved);
    liveplus.installPasteBridge('panelCode');
    setTimeout(()=>$('panelCode')?.focus(),0);
  };
  const closePanel=()=>{$('panelModal').classList.remove('show');$('panelModal').setAttribute('aria-hidden','true')};
  $('closePanel').onclick=closePanel;
  $('panelModal').onclick=event=>{if(event.target===$('panelModal'))closePanel()};
  $('panelCode').addEventListener('input',event=>{const value=event.target.value;if(!String(value).startsWith('LIVEPLUS1'))event.target.value=liveplus.formatCode(value)});
  $('panelCode').addEventListener('paste',()=>setTimeout(()=>{const parsed=liveplus.parseInput($('panelCode').value);if(parsed.code.length===8)$('panelCode').value=parsed.display},0));
  $('panelCode').onkeydown=event=>{if(event.key==='Enter')liveplus.connect($('panelCode').value,{manual:true})};
  $('connectPanel').onclick=()=>liveplus.connect($('panelCode').value,{manual:true});
  $('refreshPage').onclick=refreshPage;
  $('clearCache').onclick=async()=>{setStatus('Limpando cache…','warn');await clearCacheAndRefresh()};

  window.addEventListener('message',event=>{const data=event.data||{};if(!ingestLiveEvent(data)&&data.type==='adivinhando-control')executeCommand(data)});
  window.addEventListener('pageshow',()=>{liveplus.installPasteBridge('panelCode');liveplus.scheduleReconnect(250)});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')liveplus.scheduleReconnect(350)});

  window.Adivinhando={
    comment:(username,text)=>game.guess(username,text),
    start:options=>game.resume(options||{}),
    next:options=>game.start(options||{}),
    stop:()=>game.stop(),
    connectLivePlus:raw=>liveplus.connect(raw,{manual:true}),
    manifest,state:game.state,version,getTransport:liveplus.getTransport,
    getActivePanelCode:liveplus.getActiveCode
  };

  const category=params.get('category')||'mixed';
  await game.start({category});render();
  const ticket=params.get('liveplus')||params.get('code')||'';
  if(ticket)liveplus.connect(ticket,{manual:false});else liveplus.scheduleReconnect(500);
}
