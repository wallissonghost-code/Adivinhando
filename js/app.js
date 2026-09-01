export async function bootAdivinhando(){
  const build=String(window.ADIVINHANDO_BUILD||Date.now());
  const version=String(window.ADIVINHANDO_VERSION||'Beta 0.0.3');
  const params=new URLSearchParams(location.search);
  const [{createGame},{createLivePlusController},{installMobileGuards},{refreshPage,clearCacheAndRefresh}]=await Promise.all([
    import(`./game.js?v=${encodeURIComponent(build)}`),
    import(`./liveplus.js?v=${encodeURIComponent(build)}`),
    import(`./mobile.js?v=${encodeURIComponent(build)}`),
    import(`./cache.js?v=${encodeURIComponent(build)}`)
  ]);

  const $=id=>document.getElementById(id);
  const manifest={protocol:'liveplus-game-manifest-v1',gameId:'adivinhando',name:'Adivinhando',icon:'🎯',version,actions:[
    {id:'next_round',label:'Próxima palavra',icon:'⏭️',params:[]},
    {id:'start_round',label:'Iniciar rodada',icon:'▶️',params:[{id:'category',label:'CATEGORIA',type:'select',default:'mixed',options:[{value:'mixed',label:'Misturado'},{value:'animais',label:'Animais'},{value:'frutas',label:'Frutas'},{value:'comidas',label:'Comidas'},{value:'objetos',label:'Objetos'}]}]},
    {id:'stop_rounds',label:'Parar rodadas',icon:'⏹️',params:[]}
  ]};

  let game=null;
  let liveplus=null;

  function escapeHtml(value){return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]))}
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

  function executeCommand(data={}){
    const action=String(data.action||data.command||''),payload=data.params&&typeof data.params==='object'?data.params:{};
    if(action==='next_round'){game.start(payload);return true}
    if(action==='start_round'){game.resume(payload);return true}
    if(action==='stop_rounds'){game.stop();return true}
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
    onConnected:()=>{liveplus.sendState(game.snapshot('initial'));setTimeout(()=>$('panelModal')?.classList.remove('show'),450)},
    onCommand:(data,session)=>{const ok=executeCommand(data);if(!ok)session?.sendState?.({scope:'command',gameId:'adivinhando',commandStatus:'unsupported',action:String(data.action||data.command||'')})},
    onMessage:ingestLiveEvent
  });

  const syncTimer=setInterval(()=>{if(liveplus.getTransport()!=='offline')liveplus.sendState(game.snapshot('heartbeat'))},30000);
  window.addEventListener('pagehide',()=>clearInterval(syncTimer),{once:true});

  $('versionLabel').textContent=version;
  document.title=`Adivinhando · ${version}`;
  installMobileGuards();
  liveplus.installPasteBridge('panelCode');

  $('panelButton').onclick=()=>{
    $('panelModal').classList.add('show');
    const saved=liveplus.savedCode();if(saved)$('panelCode').value=liveplus.formatCode(saved);
    liveplus.installPasteBridge('panelCode');
  };
  $('closePanel').onclick=()=>$('panelModal').classList.remove('show');
  $('panelModal').onclick=event=>{if(event.target===$('panelModal'))$('panelModal').classList.remove('show')};
  $('panelCode').addEventListener('input',event=>{const value=event.target.value;if(!String(value).startsWith('LIVEPLUS1'))event.target.value=liveplus.formatCode(value)});
  $('panelCode').addEventListener('paste',()=>setTimeout(()=>{const parsed=liveplus.parseInput($('panelCode').value);if(parsed.code.length===8)$('panelCode').value=parsed.display},0));
  $('panelCode').onkeydown=event=>{if(event.key==='Enter')liveplus.connect($('panelCode').value)};
  $('connectPanel').onclick=()=>liveplus.connect($('panelCode').value);
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
    connectLivePlus:raw=>liveplus.connect(raw),
    manifest,state:game.state,version,getTransport:liveplus.getTransport
  };

  const category=params.get('category')||'mixed';
  await game.start({category});render();
  const ticket=params.get('liveplus')||params.get('code')||'';
  if(ticket)liveplus.connect(ticket);else liveplus.scheduleReconnect(500);
}
