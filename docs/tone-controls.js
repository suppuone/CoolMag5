/* Direct-stream edition: no companion audio, EQ or gain processing. */
window.createRadioToneControls=function(){
  for(const id of ['radio-bass','radio-treble','v4-master-tone']){
    const input=document.getElementById(id);if(!input)continue;
    input.value='0';input.disabled=true;input.setAttribute('aria-valuetext','Unavailable: original stream audio');
  }
  const status=document.getElementById('tone-status');
  if(status)status.textContent='Original stream audio — volume only.';
  return {refreshVolume(){},get active(){return false;},get analyser(){return null;}};
};
