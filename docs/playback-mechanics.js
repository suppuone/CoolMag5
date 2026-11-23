/* Prepare the record pickup; cassette heads follow confirmed media playback.
   No gain, mute, volume changes, duplicate audio or audio processing. */
window.createRadioMechanismGate=function({getArtwork,paint}){
  let pending=null,engaged=null;
  function cancel(){
    if(pending){clearTimeout(pending.timer);pending.resolve(false);pending=null;}
    if(engaged){engaged._preparing=false;engaged._mechanismReady=false;engaged.dataset.engaged='false';engaged.dataset.headContact='false';engaged.style.setProperty('--artwork-play-state','paused');engaged=null;}
  }
  function prepare(){
    if(pending)return pending.promise;
    paint();const art=getArtwork();
    if(!art||!['lp','cassette'].includes(art.dataset.kind))return Promise.resolve(true);
    if(art._mechanismReady)return Promise.resolve(true);
    engaged=art;art._preparing=art.dataset.kind==='lp';
    // Lock-screen playback must not wait for animation frames in a hidden tab.
    if(document.hidden){const record=art.dataset.kind==='lp';art._mechanismReady=record;art.dataset.engaged=String(record);art.dataset.headContact='false';return Promise.resolve(true);}
    const ticket={timer:0};ticket.promise=new Promise(resolve=>ticket.resolve=resolve);pending=ticket;
    function begin(){
      if(pending!==ticket)return;
      if(!art.isConnected){cancel();return;}
      // The first cassette insertion flips to Side A before its head can rise.
      if(!document.hidden&&(art._startupFlipPending||art.classList.contains('cassette-flipping'))){ticket.timer=setTimeout(begin,50);return;}
      // A cassette head stays parked until the media reports actual playback.
      if(art.dataset.kind==='cassette'){
        art.dataset.engaged='false';art.dataset.headContact='false';
        pending=null;ticket.resolve(true);return;
      }
      art.dataset.headContact='false';art.dataset.engaged='true';art.style.setProperty('--artwork-play-state','paused');
      const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:1350;
      ticket.timer=setTimeout(()=>{
        if(pending!==ticket)return;
        if(!art.isConnected){cancel();return;}
        art._mechanismReady=true;pending=null;ticket.resolve(true);
      },duration);
    }
    // Give a new artwork's parked position a paint before moving the pickup.
    requestAnimationFrame(()=>requestAnimationFrame(begin));
    return ticket.promise;
  }
  return {prepare,cancel,get pending(){return Boolean(pending);}};
};
