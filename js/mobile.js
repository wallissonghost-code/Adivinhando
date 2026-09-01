export function installMobileGuards(){
  const prevent=event=>event.preventDefault();
  document.addEventListener('gesturestart',prevent,{passive:false});
  document.addEventListener('gesturechange',prevent,{passive:false});
  document.addEventListener('gestureend',prevent,{passive:false});
  let lastTouchEnd=0;
  document.addEventListener('touchend',event=>{
    const now=Date.now();
    if(now-lastTouchEnd<=350)event.preventDefault();
    lastTouchEnd=now;
  },{passive:false});
}
