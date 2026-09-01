const CODE_KEY='adivinhando-panel-code';
const TOKEN_KEY='adivinhando-liveplus-token';

function cleanCode(value=''){return String(value).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8)}
function formatCode(value=''){const code=cleanCode(value);return code.length>4?code.slice(0,4)+'-'+code.slice(4):code}

export function createLivePlusController({manifest,onCommand,onMessage,onConnected,onStatus}){
  let session=null;
  let connecting=false;
  let reconnectTimer=0;
  let lastConnectToken='';
  let activeCode='';
  let pendingCode='';
  let currentAttemptManual=false;
  let generation=0;

  const sdk=()=>window.LivePlusGameSDK;
  const status=(text,kind='')=>onStatus?.(text,kind);

  function installPasteBridge(inputId='panelCode'){
    try{sdk()?.installPasteBridge?.(inputId)}catch{}
  }

  function parseInput(raw=''){
    const text=String(raw||'').trim();
    try{
      const ticket=sdk()?.parseTicket?.(text);
      if(ticket?.code){
        if(ticket.endpoint)sdk()?.configureRelay?.(ticket.endpoint);
        return{code:cleanCode(ticket.code),display:formatCode(ticket.code),token:text,ticket:true};
      }
    }catch{}
    const code=cleanCode(text);
    return{code,display:formatCode(code),token:code,ticket:false}
  }

  async function disposeSession(){
    clearTimeout(reconnectTimer);
    reconnectTimer=0;
    const old=session;
    session=null;
    connecting=false;
    activeCode='';
    generation++;
    if(!old)return;
    for(const method of['disconnect','close','destroy']){
      try{
        if(typeof old?.[method]==='function'){
          const result=old[method]();
          if(result&&typeof result.then==='function')await result.catch(()=>{});
          break;
        }
      }catch{}
    }
  }

  function bindSession(){
    if(session)return session;
    const Session=sdk()?.Session;
    if(!Session)throw Error('SDK LIVE+ não carregou.');
    const ownGeneration=++generation;
    const created=new Session({storageKey:TOKEN_KEY,manifest});
    session=created;
    created.addEventListener('connected',()=>{
      if(session!==created||generation!==ownGeneration)return;
      connecting=false;
      activeCode=pendingCode||activeCode;
      const transport=created?.getTransport?.()||'online';
      status(`Painel conectado · ${transport}`,'ok');
      onConnected?.(created,{manual:currentAttemptManual,code:activeCode});
    });
    created.addEventListener('command',event=>{if(session===created)onCommand?.(event.detail||{},created)});
    created.addEventListener('message',event=>{if(session===created)onMessage?.(event.detail||{},created)});
    created.addEventListener('event',event=>{if(session===created)onMessage?.(event.detail||{},created)});
    created.addEventListener('reconnecting',()=>{if(session!==created)return;connecting=false;status('Reconectando ao painel…','warn')});
    created.addEventListener('transport',event=>{
      if(session!==created)return;
      const detail=event.detail||{};
      if(detail.status==='disconnected')status('Painel desconectado · reconectando…','warn');
      else if(detail.status==='connected')status(`Painel conectado · ${detail.transport||created?.getTransport?.()||'online'}`,'ok');
    });
    created.addEventListener('rejected',event=>{if(session!==created)return;connecting=false;status(event.detail?.reason||'Sessão recusada.','err')});
    created.addEventListener('lost',()=>{if(session!==created)return;connecting=false;status('Conexão perdida. Gere ou conecte uma nova sessão.','err')});
    return created;
  }

  async function connect(raw,{silent=false,manual=true}={}){
    if(connecting)return false;
    const parsed=parseInput(raw);
    if(parsed.code.length!==8){if(!silent)status('Digite os 8 caracteres ou cole o ticket LIVE+.','err');return false}

    const replacing=!!session&&!!activeCode&&parsed.code!==activeCode;
    if(replacing){
      status('Trocando sessão do painel…','warn');
      await disposeSession();
    }

    try{localStorage.setItem(CODE_KEY,parsed.display)}catch{}
    lastConnectToken=parsed.ticket?parsed.token:parsed.code;
    pendingCode=parsed.code;
    currentAttemptManual=!!manual;
    try{
      connecting=true;
      status(replacing?'Conectando nova sessão…':'Conectando ao painel…','warn');
      await bindSession().connect(lastConnectToken);
      return true;
    }catch(error){
      connecting=false;
      console.error('[Adivinhando LIVE+]',error);
      status(error?.message||'Não foi possível conectar.','err');
      return false;
    }
  }

  function savedCode(){try{return localStorage.getItem(CODE_KEY)||''}catch{return''}}

  function scheduleReconnect(delay=350){
    clearTimeout(reconnectTimer);
    reconnectTimer=setTimeout(async()=>{
      if(connecting)return;
      let transport='offline';
      try{transport=session?.getTransport?.()||'offline'}catch{}
      if(!['offline','disconnected','unknown'].includes(transport))return;
      const saved=savedCode();
      if(cleanCode(saved).length===8)await connect(saved,{silent:true,manual:false});
    },delay);
  }

  function sendState(payload){try{return session?.sendState?.(payload)}catch{} }
  function sendEvent(payload){try{return session?.sendEvent?.(payload)}catch{} }
  function getTransport(){try{return session?.getTransport?.()||'offline'}catch{return'offline'}}

  return{
    connect,disposeSession,sendState,sendEvent,getTransport,savedCode,scheduleReconnect,
    installPasteBridge,parseInput,formatCode,cleanCode,getSession:()=>session,
    getActiveCode:()=>activeCode,isConnected:()=>!['offline','disconnected','unknown'].includes(getTransport())
  };
}
