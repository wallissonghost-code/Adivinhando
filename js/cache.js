export async function clearRuntimeCaches(){
  try{
    if('caches'in window){
      const keys=await caches.keys();
      await Promise.all(keys.map(key=>caches.delete(key)));
    }
    if('serviceWorker'in navigator){
      const registrations=await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(registration=>registration.unregister()));
    }
  }catch(error){console.warn('[Adivinhando cache]',error)}
}

export function refreshPage(){location.reload()}

export async function clearCacheAndRefresh(){
  await clearRuntimeCaches();
  const url=new URL(location.href);
  url.searchParams.set('refresh',Date.now().toString());
  location.replace(url.toString());
}
