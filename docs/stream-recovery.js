/* Give connecting or buffering streams ten seconds. Confirmed errors skip sooner.
 * Playback progress cancels the timer; hidden pages and explicit stops never skip.
 */
window.createStreamRecovery=function(media,options){
  let timer=0,generation=0,active=false,connecting=false,hasPlayed=false;
  let direction=1,maxAttempts=null,lastTime=0;
  const attempted=new Set();
  const cancel=()=>{clearTimeout(timer);timer=0;};
  function stop(){cancel();active=false;connecting=false;generation++;}
  function arm(delay=10000){
    if(!active||timer||document.hidden)return;
    const token=generation;
    timer=setTimeout(()=>{
      timer=0;if(!active||token!==generation||document.hidden)return;
      if(navigator.onLine===false){stop();options.onExhausted?.();return;}
      const current=options.current();if(!current){stop();return;}
      attempted.add(options.key(current));
      const rows=options.rows();
      const inList=rows.findIndex(s=>options.key(s)===options.key(current));
      maxAttempts??=rows.length+(inList<0?1:0);
      const index=inList>=0?inList:(direction>0?-1:0);
      let next;
      for(let n=1;attempted.size<maxAttempts&&n<=rows.length;n++){
        const candidate=rows[(index+n*direction+rows.length)%rows.length];
        const blocked=location.protocol==='https:'&&/^http:\/\//i.test(String(candidate.url_resolved||candidate.url||'').trim());
        if(!blocked&&!attempted.has(options.key(candidate))){next=candidate;break;}
      }
      stop();
      if(next){options.onSkip?.();options.play(next,true);}
      else options.onExhausted?.();
    },delay);
  }
  function confirmPlayback(){
    if(!active||media.paused)return;
    if(!hasPlayed){attempted.clear();maxAttempts=null;}
    hasPlayed=true;connecting=false;cancel();
  }
  function fail(){if(active){connecting=true;cancel();arm(0);}}
  media.addEventListener('playing',confirmPlayback);
  media.addEventListener('timeupdate',()=>{
    if(media.readyState>=3&&media.currentTime>lastTime)confirmPlayback();
    lastTime=media.currentTime;
  });
  // A source reset can queue an abort for the old stream. Give the new stream its startup window.
  for(const name of ['waiting','stalled','abort'])media.addEventListener(name,()=>{if(active&&(connecting||!media.paused))arm();});
  media.addEventListener('error',fail);
  media.addEventListener('ended',fail);
  media.addEventListener('pause',()=>{
    // Explicit pause handlers stop recovery first. Unexpected pauses get a recovery window.
    if(active){connecting=true;arm();}
  });
  media.addEventListener('play',()=>{if(!active)begin();else arm();});
  document.addEventListener('visibilitychange',()=>{cancel();if(!document.hidden&&active&&(connecting||(!media.paused&&media.readyState<3)))arm();});
  function begin(automatic=false,navigationDirection=1){
    stop();
    if(!automatic){
      attempted.clear();maxAttempts=null;
      direction=navigationDirection<0?-1:1;
      options.onStart?.();
    }
    lastTime=media.currentTime;hasPlayed=false;active=true;connecting=true;arm();
  }
  return {stop,begin,fail,get connecting(){return active&&connecting;},reject(error){
    if(error?.name==='NotAllowedError')stop();
    else if(error?.name==='AbortError')arm();
    else fail();
  }};
};
