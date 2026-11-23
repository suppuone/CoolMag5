/* Version 3's silent monitor approach. The audible media is never connected
   to Web Audio, filtered, muted or given a different volume by this module. */
window.createRadioVisualMeter=function({getSource}){
  let context,analyser,monitor,source,silentGain,hls,sourceURL='',generation=0,status='idle';
  function clearSource(){
    if(hls){hls.destroy();hls=null;}
    if(monitor){monitor.pause();monitor.removeAttribute('src');monitor.load();}
  }
  function ensure(){
    if(context)return;
    const Ctx=window.AudioContext||window.webkitAudioContext;
    if(!Ctx)throw new Error('Audio analysis unavailable');
    context=new Ctx();analyser=context.createAnalyser();
    analyser.fftSize=1024;analyser.smoothingTimeConstant=.65;
    monitor=new Audio();monitor.crossOrigin='anonymous';monitor.preload='none';
    source=context.createMediaElementSource(monitor);
    silentGain=context.createGain();silentGain.gain.value=0;
    source.connect(analyser);analyser.connect(silentGain);silentGain.connect(context.destination);
    monitor.addEventListener('error',()=>{if(sourceURL){status='unavailable';}});
  }
  function unlock(){
    try{ensure();return Promise.resolve(context.resume()).then(()=>{
      if(status==='blocked'&&sourceURL){sourceURL='';status='idle';return start();}
    }).catch(()=>{});}catch{return Promise.resolve();}
  }
  async function start(){
    const url=String(getSource()||'');
    if(!url||url.startsWith('blob:'))return;
    if(url===sourceURL&&status!=='idle')return;
    const token=++generation;sourceURL='';clearSource();sourceURL=url;status='connecting';
    try{
      ensure();await context.resume();
      if(token!==generation)return;
      const play=async()=>{
        if(token!==generation)return;
        try{await monitor.play();if(token===generation)status='active';}
        catch(error){if(token===generation)status=error?.name==='NotAllowedError'?'blocked':'unavailable';}
      };
      if(/\.m3u8(?:$|[?#])/i.test(url)&&window.Hls?.isSupported()){
        const player=new window.Hls({enableWorker:true,maxBufferLength:8});hls=player;
        player.on(window.Hls.Events.MANIFEST_PARSED,play);
        player.on(window.Hls.Events.ERROR,(_event,data)=>{if(token===generation&&data.fatal){status='unavailable';player.destroy();if(hls===player)hls=null;}});
        player.loadSource(url);player.attachMedia(monitor);
      }else{monitor.src=url;await play();}
    }catch{if(token===generation)status=context?.state==='suspended'?'blocked':'unavailable';}
  }
  return {
    start,unlock,
    stop(){generation++;sourceURL='';status='idle';clearSource();},
    get analyser(){return status==='active'&&context?.state==='running'?analyser:null;},
    get status(){return status;}
  };
};
