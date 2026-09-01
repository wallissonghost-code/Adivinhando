const HISTORY_KEY='adivinhando-word-history-v1';
const RECENT_LIMIT=120;
const ROUND_MS=180000;

export async function createGame({version,onState,onEvent}){
  const build=new URL(import.meta.url).searchParams.get('v')||Date.now().toString();
  const [{WORD_BANK,CATEGORY_LABELS},semanticApi]=await Promise.all([
    import(`../data/words.js?v=${encodeURIComponent(build)}`),
    import(`./semantic.js?v=${encodeURIComponent(build)}`)
  ]);
  const{normalizeText,semanticRank,heatLabel,dotProduct,createSemanticEngine}=semanticApi;
  const semantic=createSemanticEngine();
  const state={answer:'',category:'',round:0,tries:0,people:new Set(),seen:new Set(),results:[],finished:false,winner:'',auto:true,timer:null,nextTimer:null,answerVector:null};

  function history(){try{return JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]')}catch{return[]}}
  function saveUsed(word){const h=history().filter(x=>x!==word);h.push(word);localStorage.setItem(HISTORY_KEY,JSON.stringify(h.slice(-RECENT_LIMIT)))}
  function pool(category='mixed'){
    if(category!=='mixed'&&WORD_BANK[category])return WORD_BANK[category].map(word=>({word,category}));
    return Object.entries(WORD_BANK).flatMap(([key,words])=>words.map(word=>({word,category:key})));
  }
  function chooseWord(category='mixed'){
    const all=pool(category),recent=new Set(history());
    const eligible=all.filter(item=>!recent.has(normalizeText(item.word)));
    const source=eligible.length?eligible:all.filter(item=>!history().slice(-25).includes(normalizeText(item.word)));
    return source[Math.floor(Math.random()*source.length)]||all[0];
  }
  function snapshot(scope='round'){
    return{scope,gameId:'adivinhando',version,round:state.round,category:state.category,tries:state.tries,players:state.people.size,finished:state.finished,winner:state.finished?state.winner:'',best:state.results.slice(0,10).map(({username,guess,rank})=>({username,guess,rank}))};
  }
  function emitState(scope){onState?.(snapshot(scope))}
  function mask(word){return[...word].map(char=>char===' '?'   ':'_').join(' ')}

  async function start(options={}){
    clearTimeout(state.timer);clearTimeout(state.nextTimer);
    const category=options.category||'mixed';
    const pick=options.word?{word:options.word,category:options.category||'objetos'}:chooseWord(category);
    if(!pick)return null;
    state.answer=normalizeText(pick.word);state.category=pick.category;saveUsed(state.answer);state.round++;state.tries=0;state.people.clear();state.seen.clear();state.results=[];state.finished=false;state.winner='';state.answerVector=null;
    state.answerVector=await semantic.embed(state.answer);
    state.timer=setTimeout(()=>finish(null,true),Number(options.durationMs)||ROUND_MS);
    emitState('round_started');onEvent?.({gameId:'adivinhando',event:'round_started',round:state.round,category:state.category});
    return view();
  }

  function finish(username,timeout=false){
    if(state.finished)return view();
    state.finished=true;state.winner=username||'';clearTimeout(state.timer);
    emitState('round_finished');
    onEvent?.({gameId:'adivinhando',event:username?'winner':'round_timeout',round:state.round,username:username||'',answer:state.answer});
    if(state.auto)state.nextTimer=setTimeout(()=>start(),timeout?7000:5000);
    return view();
  }

  async function guess(username,comment){
    if(!state.answer||state.finished)return null;
    const text=normalizeText(comment);username=String(username||'anonimo').trim()||'anonimo';
    if(!text||text.length>60)return null;
    const key=`${username.toLowerCase()}::${text}`;if(state.seen.has(key))return null;
    state.seen.add(key);state.tries++;state.people.add(username.toLowerCase());
    const exact=text===state.answer;let similarity=1;
    if(!exact){const vector=await semantic.embed(text);similarity=vector&&state.answerVector?dotProduct(vector,state.answerVector):0}
    const rank=exact?1:semanticRank(similarity),heat=heatLabel(similarity,exact);
    state.results.push({username,guess:text,rank,sim:similarity,exact,heat:heat.label,cls:heat.cls,at:Date.now()});
    state.results.sort((a,b)=>a.rank-b.rank||a.at-b.at);state.results=state.results.slice(0,30);
    emitState('guess');if(exact)finish(username,false);
    return view();
  }

  function stop(){state.auto=false;clearTimeout(state.timer);clearTimeout(state.nextTimer)}
  function resume(options={}){state.auto=true;return start(options)}
  function view(){return{answer:state.answer,category:state.category,categoryLabel:CATEGORY_LABELS[state.category]||'Categoria',round:state.round,tries:state.tries,players:state.people.size,finished:state.finished,masked:mask(state.answer),winner:state.winner,results:state.results.slice(0,10)}}

  return{state,start,resume,stop,guess,finish,view,snapshot,semantic};
}
