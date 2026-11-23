/* Shared native-volume thumbwheel. No audio processing or playback control. */
window.createThumbwheelVolume=function({dial,input,output,onInput}){
  const clamp=value=>Math.max(0,Math.min(100,Math.round(Number(value)||0)));
  let drag=null;
  dial.classList.add('thumbwheel-dial');
  // Decorative surface from the supplied design; the original range owns input.
  const pointer=document.createElement('span');pointer.className='indicator-pointer';pointer.setAttribute('aria-hidden','true');
  const surface=document.createElement('span');surface.className='steel-thumb-wheel';surface.setAttribute('aria-hidden','true');
  for(const name of ['knurl-texture','end-shadows']){const layer=document.createElement('span');layer.className=name;surface.append(layer);}
  dial.append(pointer,surface);
  dial.title='Volume: drag right/up to increase, left/down to decrease; scroll or use arrow keys';
  input.setAttribute('aria-orientation','horizontal');
  if(input.parentElement!==dial)dial.append(input);
  function setValue(value){
    value=clamp(value);input.value=String(value);
    input.setAttribute('aria-valuetext',value+' percent');
    dial.style.setProperty('--thumbwheel-level',value+'%');
    dial.style.setProperty('--thumbwheel-offset',((value*1.8)%5)+'px');
    if(output)output.textContent=value+'%';
  }
  function commit(value){
    value=clamp(value);if(value===Number(input.value))return;
    setValue(value);input.dispatchEvent(new Event('input',{bubbles:true}));
  }
  input.addEventListener('input',()=>{setValue(input.value);onInput?.(clamp(input.value));});
  dial.addEventListener('pointerdown',event=>{
    if(input.disabled||event.button!==0)return;
    drag={id:event.pointerId,y:event.clientY,x:event.clientX,value:Number(input.value),moved:false};
    dial.setPointerCapture(event.pointerId);input.focus({preventScroll:true});event.preventDefault();event.stopPropagation();
  });
  dial.addEventListener('pointermove',event=>{
    if(!drag||drag.id!==event.pointerId)return;
    const dx=event.clientX-drag.x,dy=drag.y-event.clientY;
    if(Math.hypot(dx,dy)>4&&!drag.axis){drag.axis=Math.abs(dx)>=Math.abs(dy)?'x':'y';drag.moved=true;}
    const box=dial.getBoundingClientRect();
    if(drag.moved)commit(drag.value+(drag.axis==='x'?dx:dy)*100/Math.max(80,drag.axis==='x'?box.width:box.height));
    event.preventDefault();event.stopPropagation();
  });
  function finish(event){
    if(!drag||drag.id!==event.pointerId)return;
    const start=drag;drag=null;
    if(event.type==='pointerup'&&!start.moved){const box=dial.getBoundingClientRect();commit((event.clientX-box.left)/box.width*100);}
    if(dial.hasPointerCapture(event.pointerId))dial.releasePointerCapture(event.pointerId);
    event.stopPropagation();
  }
  for(const event of ['pointerup','pointercancel','lostpointercapture'])dial.addEventListener(event,finish);
  dial.addEventListener('wheel',event=>{
    if(input.disabled||event.ctrlKey||!event.deltaY)return;
    event.preventDefault();event.stopPropagation();input.focus({preventScroll:true});
    commit(Number(input.value)+(event.deltaY<0?2:-2));
  },{passive:false});
  input.addEventListener('keydown',event=>{
    const delta={ArrowUp:1,ArrowRight:1,ArrowDown:-1,ArrowLeft:-1,PageUp:10,PageDown:-10};
    if(!(event.key in delta)&&event.key!=='Home'&&event.key!=='End')return;
    event.preventDefault();event.stopPropagation();
    commit(event.key==='Home'?0:event.key==='End'?100:Number(input.value)+delta[event.key]);
  });
  setValue(input.value);return {setValue};
};
window.createRadioVolumeKnob=function({onInput}){
  return window.createThumbwheelVolume({dial:document.getElementById('radio-volume-dial'),input:document.getElementById('radio-volume-knob'),output:document.getElementById('radio-volume-knob-value'),onInput});
};
