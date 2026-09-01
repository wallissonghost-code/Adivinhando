const CODE_KEY='adivinhando-panel-code';
const TOKEN_KEY='adivinhando-liveplus-token';

function cleanCode(value=''){return String(value).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8)}
function formatCode(value=''){const code=cleanCode(value);return code.length>4?code.slice(0,4)+'-'+code.slice(4):code}

export function createLivePlusController({manifest,onCommand,onMessage,onConnected,onStatus}){
  let session=null;
  let connecting=false;
  let reconnectTimer=0;
  let lastConnectToken='';

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
    return{code,display:formatCode(code),token:code,ticket:false};
  }

  function bindSession(){
    if(session)return session;
    if(!sdk()?.Session)throw Error('SDK LIVE+ não carregou.');
    session=new sdk().Session({storageKey:TOKEN_KEY,manifest});
    session.addEventListener('connected',()=>{
      connecting=false;
      const transport=session?.getTransport?.()||'online';
      status(`Painel conectado · ${transport}`,'ok');
      onConnected?.(session);
    });
    session.addEventListener('command',event=>onCommand?.(event.detail||{},session));
    session.addEventListener('message',event=>onMessage?.(event.detail||{},session));
    session.addEventListener('event',event=>onMessage?.(event.detail||{},session));
    session.addEventListener('reconnecting',()=>{connecting=false;status('Reconectando ao painel…','warn')});
    session.addEventListener('transport',event=>{
      const detail=event.detail||{};
      if(detail.status==='disconnected')status('Painel desconectado · reconectando…','warn');
      else if(detail.status==='connected')status(`Painel conectado · ${detail.transport||session?.getTransport?.()||'online'}`,'ok');
    });
    session.addEventListener('rejected',event=>{connecting=false;status(event.detail?.reason||'Sessão recusada.','err')});
    session.addEventListener('lost',()=>{connecting=false;status('Conexão perdida. Gere ou conecte uma nova sessão.','err')});
    return session;
  }

  async function connect(raw,{silent=false}={}){
    if(connecting)return false;
    const parsed=parseInput(raw);
    if(parsed.code.length!==8){if(!silent)status('Digite os 8 caracteres ou cole o ticket LIVE+.','err');return false}
    try{localStorage.setItem(CODE_KEY,parsed.display)}catch{}
    lastConnectToken=parsed.ticket?parsed.token:parsed.code;
    try{
      connecting=true;
      status('Conectando ao painel…','warn');
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
      if(cleanCode(saved).length===8)await connect(saved,{silent:true});
    },delay);
  }

  function sendState(payload){try{return session?.sendState?.(payload)}catch{} }
  function sendEvent(payload){try{return session?.sendEvent?.(payload)}catch{} }
  function getTransport(){try{return session?.getTransport?.()||'offline'}catch{return'offline'}}

  return{connect,sendState,sendEvent,getTransport,savedCode,scheduleReconnect,installPasteBridge,parseInput,formatCode,cleanCode,getSession:()=>session};
}
