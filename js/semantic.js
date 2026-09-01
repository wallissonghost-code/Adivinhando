const MODEL_URL='Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const TRANSFORMERS_URL='https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.0.1';

export function normalizeText(text=''){
  return String(text).trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9ç\- ]/gi,'').replace(/\s+/g,' ').trim();
}

export function semanticRank(similarity){
  const x=Math.max(0,Math.min(1,(Number(similarity)+1)/2));
  return Math.max(2,Math.min(99999,Math.round(2+Math.pow(1-x,3.25)*99997)));
}

export function heatLabel(similarity,exact=false){
  if(exact)return{label:'✅ ACERTOU',cls:'win'};
  if(similarity>=.72)return{label:'🔥🔥🔥',cls:'hot'};
  if(similarity>=.55)return{label:'🔥 QUENTE',cls:'hot'};
  if(similarity>=.38)return{label:'🟡 MORNO',cls:'warm'};
  return{label:'🥶 FRIO',cls:'cold'};
}

export function dotProduct(a,b){
  let sum=0;
  for(let i=0;i<Math.min(a?.length||0,b?.length||0);i++)sum+=a[i]*b[i];
  return sum;
}

function qaVector(text=''){
  const source=normalizeText(text)||'qa';
  const vector=new Array(24).fill(0);
  for(let i=0;i<source.length;i++)vector[(source.charCodeAt(i)+i*7)%vector.length]+=1;
  const norm=Math.sqrt(vector.reduce((sum,value)=>sum+value*value,0))||1;
  return vector.map(value=>value/norm);
}

export function createSemanticEngine(){
  let extractor=null;
  let loading=null;
  const cache=new Map();

  async function ensureModel(){
    if(window.ADIVINHANDO_QA)return{qa:true};
    if(extractor)return extractor;
    if(loading)return loading;
    loading=(async()=>{
      try{
        const{pipeline}=await import(TRANSFORMERS_URL);
        extractor=await pipeline('feature-extraction',MODEL_URL);
        return extractor;
      }catch(error){
        console.error('[Adivinhando semantic]',error);
        return null;
      }finally{loading=null}
    })();
    return loading;
  }

  async function embed(text){
    const key=normalizeText(text);
    if(cache.has(key))return cache.get(key);
    if(window.ADIVINHANDO_QA){const vector=qaVector(key);cache.set(key,vector);return vector}
    const model=await ensureModel();
    if(!model)return null;
    const out=await model(key,{pooling:'mean',normalize:true});
    const vector=Array.from(out.data);
    cache.set(key,vector);
    return vector;
  }

  return{embed,ensureModel,cache,clearCache:()=>cache.clear()};
}
