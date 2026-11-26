/* Desktop TV entry and rotation-triggered mobile cinema mode. */
window.createTVAutoFullscreen=function({isTVVisible,isFullscreen,isAutomatic,enter,enterDesktop,exit}){
  let dismissed=false;
  let desktopDismissed=false;
  let frame=0;
  const orientation=window.matchMedia('(orientation: landscape)');
  const desktop=window.matchMedia('(hover: hover) and (pointer: fine)');
  const landscape=()=>orientation.matches;
  const mobile=()=>{
    const {innerWidth,innerHeight}=window;
    const touch=window.matchMedia('(pointer: coarse)').matches||navigator.maxTouchPoints>0;
    return (touch&&Math.min(innerWidth,innerHeight)<=1000)||(innerWidth<=900&&innerHeight<=600);
  };
  function update(){
    frame=0;
    if(!isTVVisible())desktopDismissed=false;
    if(desktop.matches){
      openDesktop();
      return;
    }
    if(!landscape()){
      dismissed=false;
      if(isFullscreen()&&isAutomatic())exit('portrait');
      return;
    }
    if(!mobile()||document.hidden||!isTVVisible())return;
    if(!dismissed&&!isFullscreen())enter();
  }
  function openDesktop(){
    if(desktop.matches&&!desktopDismissed&&!document.hidden&&isTVVisible()&&!isFullscreen()){
      enterDesktop();
    }
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(update);}
  if(orientation.addEventListener)orientation.addEventListener('change',schedule);
  else orientation.addListener(schedule);
  window.addEventListener('orientationchange',schedule);
  window.addEventListener('resize',schedule);
  window.screen?.orientation?.addEventListener?.('change',schedule);
  document.addEventListener('visibilitychange',schedule);
  schedule();
  return {
    schedule,
    openDesktop,
    dismiss(){dismissed=landscape();desktopDismissed=desktop.matches;},
    leave(){desktopDismissed=false;if(isFullscreen())exit('leave');}
  };
};
