(()=>{'use strict';
const VERSION_URL='./version.json?ts='+Date.now();
const SDK_URL='https://wallissonghost-code.github.io/projeto-daniel/sdk/liveplus-game-sdk-v1.js';

function loadStyle(href){return new Promise((resolve,reject)=>{const link=document.createElement('link');link.rel='stylesheet';link.href=href;link.onload=resolve;link.onerror=()=>reject(Error('Falha ao carregar '+href));document.head.appendChild(link)})}
function loadScript(src){return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=()=>reject(Error('Falha ao carregar '+src));document.body.appendChild(script)})}

async function boot(){
  let meta={version:'Beta 0.0.3',build:'0.0.3'};
  try{const response=await fetch(VERSION_URL,{cache:'no-store',headers:{'cache-control':'no-cache'}});if(response.ok)meta={...meta,...await response.json()}}catch(error){console.warn('[Adivinhando version]',error)}
  const version=String(meta.version||'Beta 0.0.3');
  const build=String(meta.build||version.replace(/[^0-9.]/g,'')||Date.now());
  window.ADIVINHANDO_VERSION=version;
  window.ADIVINHANDO_BUILD=build;
  document.getElementById('versionLabel').textContent=version;
  document.title=`Adivinhando · ${version}`;
  await loadStyle(`./assets/styles.css?v=${encodeURIComponent(build)}`);
  if(!window.LivePlusGameSDK?.Session)await loadScript(`${SDK_URL}?v=${encodeURIComponent(build)}`);
  const app=await import(`./app.js?v=${encodeURIComponent(build)}`);
  await app.bootAdivinhando();
}

boot().catch(error=>{
  console.error('[Adivinhando bootstrap]',error);
  const status=document.getElementById('pairStatus');
  if(status){status.textContent='Falha ao carregar o jogo.';status.className='status err'}
});
})();
