(() => {
  'use strict';
  document.body.dataset.appBuild='4.1.74';
  const PRESET_LIMIT=50;
  const {getStationCategory,stationCategoryIcon}=window;
  function decorateRadioCard(card,station){
    const category=getStationCategory(station);
    card.dataset.stationCategory=category;
    card.querySelector('b')?.insertAdjacentHTML('afterbegin',stationCategoryIcon(category));
  }
  const RECENT_LIMIT=30;
  const $ = id => document.getElementById(id);
  const safe = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const stationLogo = station => String(station?.logo||station?.favicon||station?.image||station?.['tvg-logo']||station?.tvg_logo||station?.icon||'').trim();
  const initialsFor = title => String(title||'LIVE').trim().split(/\s+/).filter(Boolean).slice(0,3).map(word=>word[0]).join('').toUpperCase()||'TV';
  function logoInitials(image){const card=image.closest('.radio-mini-card,.tv-rail-card,.preset-card,.result-row'),title=card?.querySelector('.radio-mini-card b,.tv-rail-copy b,.preset-card>b,.result-copy b')?.textContent||$('radio-title')?.textContent||'LIVE';return initialsFor(title);}
  document.addEventListener('error',event=>{const image=event.target;if(!image||image.tagName!=='IMG')return;const source=image.currentSrc||image.src;if(/^http:\/\//i.test(source)&&image.dataset.httpsRetry!=='1'){image.dataset.httpsRetry='1';image.src=source.replace(/^http:/i,'https:');return;}if(image.dataset.namedFallback!=='1'){const title=image.alt||image.closest('[aria-label]')?.getAttribute('aria-label')?.replace(/^Play /,'')||'';const station=[...radios,...tvs].find(s=>s.name===title);if(station?.fallbackLogo){image.dataset.namedFallback='1';image.src=station.fallbackLogo;return;}}const fallback=document.createElement('span');if(image.classList.contains('station-logo-badge')){fallback.className='station-logo-fallback';fallback.textContent=logoInitials(image);}else{fallback.className='logo-fallback';fallback.textContent=logoInitials(image);}image.replaceWith(fallback);},true);
  const RADIO_STORE='retrotvra.radio-presets.v3',TV_STORE='retrotvra.tv-presets.v3',TV_ORDER_STORE='retrotvra.tv-order.dd-news-only.v1',RADIO_HIDDEN_STORE='retrotvra.radio-hidden.v9',TV_HIDDEN_STORE='retrotvra.tv-hidden.v4',VOLUME_STORE='retrotvra.volume.v1',RECENT_STORE='retrotvra.recent.v2';
  let radios=[],tvs=[],radioPresets={},tvPresets={},recentHistory=[],radioIndex=-1,tvIndex=-1,presetMode='radio',selectedTVPresetKey=null,browserKind='radio',browserSource='library',onlineRows=[],onlineTVCache=null,onlineCountries=[],onlineGenres=[],onlineOffset=0,onlineVisibleLimit=100,onlineHasMore=false,onlineSearchDone=false,hls=null,radioHls=null,currentRadioSource='',toastTimer=null,dragState=null,languageCatalog=[],languageNameByCode=new Map(),languageNameByKey=new Map();
  const audio=$('radio-audio'),video=$('tv-video');

  // Hidden channels stay on this device and can be restored from Settings.
  const DEAD_HIDDEN_STORE='retrotvra.dead-hidden.v1';
  const deadHidden=loadStore(DEAD_HIDDEN_STORE,{radio:[],tv:[]});
  const isDeadHidden=(kind,station)=>(deadHidden[kind]||[]).includes(kind==='radio'?stationKey(station):station.url);
  const recoveryStatusTimers={};
  const continuousRetryTimers={radio:0,tv:0};
  function cancelContinuousRetry(kind){
    clearTimeout(continuousRetryTimers[kind]);
    continuousRetryTimers[kind]=0;
  }
  function setRecoveryStatus(kind,message){
    clearTimeout(recoveryStatusTimers[kind]);
    const screen=$(kind+'-screen');
    screen.dataset.recoveryStatus=message;
    if(message){
      $('v4-'+kind+'-station').textContent=message;
      notify(message);
    }
  }
  const recoveryOptions=kind=>({
    current:()=>kind==='radio'?radioCurrent():tvCurrent(),
    key:station=>kind==='radio'?stationKey(station):station.url,
    rows:()=>recoveryRows(kind),
    play:(station,automatic)=>kind==='radio'?playRadio(station,automatic):playTV(station,automatic),
    onStart:()=>setRecoveryStatus(kind,''),
    onSkip:()=>{
      const message='SIGNAL UNAVAILABLE · SKIPPING TO NEXT…';
      setRecoveryStatus(kind,message);
      recoveryStatusTimers[kind]=setTimeout(()=>{
        const screen=$(kind+'-screen'),display=$('v4-'+kind+'-station');
        if(screen.dataset.recoveryStatus!==message)return;
        setRecoveryStatus(kind,'');
        display.textContent=(kind==='radio'?radioCurrent():tvCurrent())?.name||'';
      },2400);
    },
    onExhausted:()=>{
      const station=kind==='radio'?radioCurrent():tvCurrent();
      if(kind==='radio')stopRadio();else stopTV();
      setRecoveryStatus(kind,'SIGNAL UNAVAILABLE · RETRYING IN 30s');
      if(kind==='radio')$('radio-status').textContent='SIGNAL UNAVAILABLE · RETRYING IN 30s';
      continuousRetryTimers[kind]=setTimeout(()=>{
        continuousRetryTimers[kind]=0;
        if(kind==='radio')playRadio(station||currentRows(kind)[0]);
        else playTV(station||currentRows(kind)[0]);
      },30000);
    }
  });
  const radioRecovery=createStreamRecovery(audio,recoveryOptions('radio'));
  const tvRecovery=createStreamRecovery(video,recoveryOptions('tv'));
  function refreshChannelLists(){renderPresets();renderExplore();renderRadioShortcuts();renderTVRail();renderRemotePresets();}
  function hideCurrentChannel(kind){
    const station=kind==='radio'?radioCurrent():tvCurrent();if(!station)return notify('Choose a station first.');
    const key=kind==='radio'?stationKey(station):station.url;
    deadHidden[kind]=[...new Set([...(deadHidden[kind]||[]),key])];saveStore(DEAD_HIDDEN_STORE,deadHidden);
    kind==='radio'?stopRadio():stopTV();refreshChannelLists();notify('Channel hidden on this device.');
  }
  $('hide-radio-channel').onclick=()=>hideCurrentChannel('radio');
  $('hide-tv-channel').onclick=()=>hideCurrentChannel('tv');
  $('restore-hidden-channels').onclick=()=>{deadHidden.radio=[];deadHidden.tv=[];saveStore(DEAD_HIDDEN_STORE,deadHidden);refreshChannelLists();notify('Hidden channels restored.');};

  const glowMode='color';
  document.body.dataset.glow=glowMode;
  const DEFAULT_RADIO_KEY='https://stream.zeno.fm/rc7dnetgrwzuv';
  let radioStartupPending=true;
  const DEFAULT_TV_CHANNEL=Object.values(window.COOLRADTV_DEFAULTS.tv)[0];
  const radioVolumeKnob=createRadioVolumeKnob({onInput:value=>setRadioVolume(value)});
  // Declare music/video playback on platforms supporting Audio Session.
  function claimPlaybackSession(){try{if(navigator.audioSession)navigator.audioSession.type='playback';}catch{}}
  for(const media of [audio,video])media.addEventListener('play',claimPlaybackSession);

  function loadStore(key,fallback={}){try{const value=JSON.parse(localStorage.getItem(key)||'null');return value&&typeof value==='object'?value:fallback;}catch{return fallback;}}
  function setRadioVolume(level,persist=true){const value=Math.max(0,Math.min(100,Math.round(Number(level)||0)));$('radio-volume').value=String(value);$('radio-volume').style.setProperty('--volume-fill',`${value}%`);$('radio-volume-track').style.setProperty('--volume-angle',`${-135+value*2.7}deg`);audio.volume=value/100;$('volume-number').textContent=String(value);radioVolumeKnob.setValue(value);if(persist)saveStore(VOLUME_STORE,value);}
  const consoleThemes=['retro','modern','weathered','shattered'];
  function applyConsoleTheme(theme){
    document.body.dataset.theme=theme;
    const button=$('theme-choice');
    const next=consoleThemes[(consoleThemes.indexOf(theme)+1)%consoleThemes.length];
    button.setAttribute('aria-pressed',String(theme!=='retro'));
    button.textContent=theme[0].toUpperCase()+theme.slice(1);
    button.setAttribute('aria-label','Theme '+theme+'. Switch to '+next);
    button.title='Switch to '+next+' theme';
  }
  // Start each opening in Retro; the theme button can change this session.
  let consoleTheme='retro';
  for(const panel of document.querySelectorAll('.crt-module,.receiver-panel')){
    const overlay=document.createElement('span');
    overlay.className='weathered-glass-overlay';
    overlay.setAttribute('aria-hidden','true');
    panel.append(overlay);
  }
  const weatheredFrame=document.createElement('span');
  weatheredFrame.className='weathered-chassis-frame';
  weatheredFrame.setAttribute('aria-hidden','true');
  document.querySelector('.broadcast-chassis').append(weatheredFrame);
  applyConsoleTheme(consoleTheme);
  $('theme-choice').addEventListener('click',()=>{
    consoleTheme=consoleThemes[(consoleThemes.indexOf(consoleTheme)+1)%consoleThemes.length];
    applyConsoleTheme(consoleTheme);
  });
  function saveStore(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{notify('This browser could not save your favorites.');return false;}}
  function stationKey(item){return String(item?.stationuuid||item?.url_resolved||item?.url||item?.name||'');}
  function notify(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2400);}
  let closeSplash=()=>{};
  function initSplash(){
    const splash=$('welcome-splash-v2'),enter=$('tuning-enter');if(!splash||!enter)return;
    let returning=false;try{returning=localStorage.getItem('coolradtv.tuning-seen')==='true';}catch{}
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(returning)splash.classList.add('tuning-returning');
    let finished=false,readyTimer=0;const splashStarted=performance.now();const previousFocus=document.activeElement;
    const clip=splash.querySelector('.ux-splash-video');
    const finish=()=>{if(finished)return;finished=true;clearTimeout(timer);clearTimeout(readyTimer);document.removeEventListener('keydown',keys);clip?.pause();splash.classList.add('leaving');startOpenedPlayer();try{localStorage.setItem('coolradtv.tuning-seen','true');}catch{}setTimeout(()=>{splash.remove();if(previousFocus&&previousFocus!==document.body&&previousFocus.isConnected)previousFocus.focus({preventScroll:true});else ($('ux-play')||$('radio-play'))?.focus({preventScroll:true});},reduced?0:360);};
    const keys=event=>{if(event.key==='Escape'){event.preventDefault();finish();}if(event.key==='Tab'){event.preventDefault();enter.focus({preventScroll:true});}};
    let timer=setTimeout(finish,clip?30000:returning?2000:4000);
    closeSplash=immediate=>{if(clip||immediate!==true||finished)return;clearTimeout(readyTimer);readyTimer=setTimeout(finish,Math.max(0,1600-(performance.now()-splashStarted)));};
    $('splash-install')?.addEventListener('click',()=> $('install-app')?.click());
    enter.addEventListener('click',finish);document.addEventListener('keydown',keys);enter.focus({preventScroll:true});
    if(clip){
      let plays=1;
      clip.addEventListener('ended',()=>{if(plays<3){plays++;clip.currentTime=0;clip.play().catch(finish);}else finish();});
      clip.addEventListener('error',finish);
      // The 30 second wait for a tap is replaced by a normal timeout once the video is actually playing.
      clip.addEventListener('playing',()=>{clearTimeout(timer);timer=setTimeout(finish,14000);},{once:true});
      // Sound is attempted first. If the browser blocks it, wait for the first tap or key press, then play with sound.
      clip.muted=false;
      clip.play().catch(()=>{
        // The splash keeps its Install shortcut and Skip actions visible.
        const events=['pointerdown','keydown','touchstart'];
        const start=()=>{for(const name of events)document.removeEventListener(name,start,true);clip.muted=false;clip.play().catch(finish);};
        for(const name of events)document.addEventListener(name,start,true);
      });
    }
  }

  function formatClock(){const d=new Date();$('clock').textContent=d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}).toUpperCase();const day=$('radio-clock-day');if(day){day.textContent=d.toLocaleDateString([], {weekday:'short'}).slice(0,2);const time=d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit',hour12:true}).match(/^(.+?)\s*(AM|PM)$/i);$('radio-clock-time').textContent=time?time[1]:d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});$('radio-clock-meridiem').textContent=time?time[2].toUpperCase():'';$('radio-clock-date').textContent=d.toLocaleDateString([], {month:'short',day:'2-digit',year:'numeric'}).toUpperCase();}}
  initSplash();
  const radioNewsFeeds=[
    {name:'The Hindu',url:'https://www.thehindu.com/news/national/feeder/default.rss'},
    {name:'BBC World',url:'https://feeds.bbci.co.uk/news/world/rss.xml'}
  ];
  function setRadioNews(headlines){
    const track=$('radio-news-track');if(!track)return;
    const items=(headlines||[]).filter(item=>item.title).slice(0,12);
    if(!items.length){
      if(track.querySelector('.ticker-marquee'))return;
      track.textContent='News feeds unavailable — retrying later';track.classList.add('ticker-static');return;
    }
    const group=document.createElement('div');group.className='ticker-group';
    for(const item of items){
      const link=document.createElement('a');link.className='ticker-headline';link.textContent=item.source+' · '+String(item.title).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
      try{const url=new URL(item.link);if(url.protocol==='https:'||url.protocol==='http:'){link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';}}catch{}
      group.append(link);
    }
    const marquee=document.createElement('div');marquee.className='ticker-marquee';
    const copy=group.cloneNode(true);copy.setAttribute('aria-hidden','true');copy.querySelectorAll('a').forEach(link=>link.tabIndex=-1);
    marquee.append(group,copy);track.replaceChildren(marquee);track.classList.remove('ticker-static');
    requestAnimationFrame(()=>marquee.style.setProperty('--news-duration',Math.max(30,group.scrollWidth/80)+'s'));
  }
  async function loadRadioNews(){
    const results=await Promise.allSettled(radioNewsFeeds.map(async feed=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
      try{
        const response=await fetch('https://api.rss2json.com/v1/api.json?rss_url='+encodeURIComponent(feed.url),{cache:'no-store',signal:controller.signal});
        if(!response.ok)throw new Error('News service '+response.status);
        const data=await response.json();if(!data.items?.length)throw new Error('Empty news feed');
        return data.items.slice(0,6).map(item=>({title:item.title,link:item.link,source:feed.name}));
      }finally{clearTimeout(timer);}
    }));
    const groups=results.map(result=>result.status==='fulfilled'?result.value:[]),headlines=[];
    for(let i=0;i<6;i++)for(const group of groups)if(group[i])headlines.push(group[i]);
    setRadioNews(headlines);
  }
  function inferTVCountry(name=''){
    const n=String(name).toLowerCase();
    if(/bbc|star vijay uk|reuters/.test(n))return 'United Kingdom';
    if(/cnn|abc news|discovery|cartoon network|accuweather|hallmark|hbo|create/.test(n))return 'United States';
    if(/al jazeera/.test(n))return 'Qatar';if(/dw english/.test(n))return 'Germany';if(/arirang/.test(n))return 'South Korea';
    if(/kantipur/.test(n))return 'Nepal';if(/africanews/.test(n))return 'Republic of the Congo';if(/nhk/.test(n))return 'Japan';
    if(/france 24/.test(n))return 'France';if(/trt world/.test(n))return 'Turkey';
    return 'India';
  }
  function fillCountries(){
    const fill=(id,rows)=>{const countries=[...new Set(rows.map(s=>String(s.country||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));$(id).innerHTML='<option value="all">All countries</option>'+countries.map(name=>`<option value="${safe(name)}">${safe(name)}</option>`).join('');};
    fill('radio-country',radios);fill('tv-country',tvs);
  }
  function loadPresets(catalogue,storeKey,kind){
    const saved=loadStore(storeKey,null);
    const hasSaved=Boolean(saved&&!Array.isArray(saved));
    const excluded=hasSaved?[]:loadStore(kind==='tv'?TV_HIDDEN_STORE:RADIO_HIDDEN_STORE,[]);
    const hidden=new Set(Array.isArray(excluded)?excluded:[]);
    const source=hasSaved?saved:catalogue;
    const entries=new Map();
    for(const [storedKey,station] of Object.entries(source)){
      if(!station||(kind==='tv'?!station.url:!(station.url_resolved||station.url)))continue;
      const key=presetKey(kind,station);
      if(hidden.has(storedKey)||hidden.has(key)||entries.has(key))continue;
      const preset={...catalogue[key],...station};
      if(kind==='radio'&&key==='https://stream.zeno.fm/rc7dnetgrwzuv'&&/^cool retro radio tamil$/i.test(preset.name||''))preset.name='COOL RETRO RADIO';
      entries.set(key,preset);
    }
    return Object.fromEntries([...entries].slice(0,PRESET_LIMIT));
  }
  async function fetchData(){
    const builtIn=window.COOLRADTV_DEFAULTS;
    if(!builtIn?.radio||!builtIn?.tv)throw new Error('Default station library could not be loaded');
    radios=Object.entries(builtIn.radio).map(([key,station])=>({...station,_key:key}));
    tvs=Object.entries(builtIn.tv).map(([key,station])=>({...station,url:station.url||key}));
    const revisionStore='retrotvra.defaults-revision.v1';
    if(loadStore(revisionStore,{}).revision!==builtIn.revision){
      const savedRadio=loadStore(RADIO_STORE,null),savedTV=loadStore(TV_STORE,null);
      const hasRadioSaved=Boolean(savedRadio&&!Array.isArray(savedRadio));
      const hasTVSaved=Boolean(savedTV&&!Array.isArray(savedTV));
      // Complete existing smaller collections once for the 50/50 library release.
      const completeCollection=(saved,defaults)=>{
        const next={...saved};
        for(const [key,station] of Object.entries(defaults)){
          if(Object.keys(next).length>=PRESET_LIMIT)break;
          if(!Object.hasOwn(next,key))next[key]=station;
        }
        return next;
      };
      const complete=builtIn.revision==='curated-50-each-20261124';
      const radioReady=hasRadioSaved?(complete?saveStore(RADIO_STORE,completeCollection(savedRadio,builtIn.radio)):true):saveStore(RADIO_STORE,builtIn.radio);
      const tvReady=hasTVSaved?(complete?saveStore(TV_STORE,completeCollection(savedTV,builtIn.tv)):true):saveStore(TV_STORE,builtIn.tv);
      if(radioReady&&tvReady)saveStore(revisionStore,{revision:builtIn.revision});
    }
    radioPresets=loadPresets(builtIn.radio,RADIO_STORE,'radio');
    tvPresets=loadPresets(builtIn.tv,TV_STORE,'tv');
    const storedRecent=loadStore(RECENT_STORE,[]);
    recentHistory=normaliseRecent(Array.isArray(storedRecent)?storedRecent:[]);
    for(const entry of recentHistory)if(entry.kind==='radio'&&entry.key==='https://stream.zeno.fm/rc7dnetgrwzuv'&&/^cool retro radio tamil$/i.test(entry.name||''))entry.name='COOL RETRO RADIO';
    for(const entry of recentHistory)if(entry.kind==='radio'&&entry.key==='https://stream.zeno.fm/0ghtfp8ztm0uv')entry.logo='assets/station-logos/kishore-kumar-hits.png';
    saveStore(RECENT_STORE,recentHistory);
    saveStore(RADIO_STORE,radioPresets);
    saveStore(TV_STORE,tvPresets);
    saveStore(TV_ORDER_STORE,Object.keys(tvPresets));
    const launchRadio=Object.values(radioPresets)[0]||builtIn.radio[DEFAULT_RADIO_KEY];
    const launchTV=Object.values(tvPresets)[0];
    radioIndex=launchRadio?radios.findIndex(station=>stationKey(station)===stationKey(launchRadio)):-1;
    tvIndex=launchTV?tvs.findIndex(station=>station.url===launchTV.url):-1;
    fillCountries();populateExploreFilters();renderPresets();renderTVRail();renderRemotePresets();renderRadioDisplay();renderExplore();
  }
  const genreRows={radio:null,tv:null};
  // Separate session-only browsing lists; saved/default stations are never overwritten.
  window.retroUseGenreRows=(kind,rows)=>{
    if(!['radio','tv'].includes(kind))return;
    genreRows[kind]=Array.isArray(rows)?rows:null;
    if(kind==='radio')renderRadioShortcuts();else renderRemotePresets();
  };
  window.retroPresetRows=kind=>listFor(kind);
  // Compact UI delegates to the same playback and favorite controllers.
  const findNamedStation=(kind,name)=>(kind==='tv'?tvs:radios).concat(listFor(kind)).find(station=>station.name?.trim().toLowerCase()===name.trim().toLowerCase());
  window.retroPlayer={
    tune:(kind,station)=>{if(kind==='tv'){stopRadio();return playTV(station);}stopTV();return playRadio(station);},
    isPlaying:kind=>kind==='tv'?(youtubePlayer?.getPlayerState?youtubePlayer.getPlayerState()===1:!video.paused&&!video.ended&&!video.error):!audio.paused&&!audio.ended&&!audio.error,
    isFavorite:(kind,name)=>{const station=findNamedStation(kind,name);return !!station&&Object.hasOwn(kind==='tv'?tvPresets:radioPresets,presetKey(kind,station));},
    toggleFavorite:(kind,name)=>{const station=findNamedStation(kind,name);if(!station)return false;togglePreset(kind,station);return true;}
  };
  function listFor(kind){return kind==='tv'?Object.values(tvPresets):Object.values(radioPresets);}
  function presetKey(kind,station){return kind==='tv'?station?.url:stationKey(station||{});}
  function selectedCountry(kind){return $(kind==='tv'?'tv-country':'radio-country')?.value||'all';}
  function currentRows(kind){const rows=(genreRows[kind]??listFor(kind)).filter(s=>!isDeadHidden(kind,s));const country=selectedCountry(kind);return rows.filter(item=>country==='all'||String(item.country||'').toLowerCase()===country.toLowerCase());}
  function recoveryRows(kind){
    const rows=currentRows(kind),order=window.retroStationTunerOrder?.(kind);
    return order?.length?order.map(index=>rows[index]).filter(Boolean):rows;
  }
  let radioAutoplayBlocked=false;
  function retryBlockedRadio(){
    if(!radioAutoplayBlocked||document.querySelector('.screen.active')?.id!=='radio-screen')return;
    radioAutoplayBlocked=false;
    $('radio-art').dataset.playbackBlocked='false';
    const generation=radioPlaybackGeneration;
    radioRecovery.begin();
    startRadioAudio().then(()=>{
      if(generation===radioPlaybackGeneration&&!audio.paused)$('radio-status').textContent='Playing · '+(radioCurrent()?.name||'Radio');
    }).catch(error=>{
      if(generation!==radioPlaybackGeneration||error?.name==='AbortError')return;
      radioRecovery.reject(error);
      radioAutoplayBlocked=error?.name==='NotAllowedError';
      $('radio-art').dataset.playbackBlocked=String(radioAutoplayBlocked);
    });
  }
  document.addEventListener('pointerup',event=>{if(event.isTrusted&&!event.target.closest('button,a,input,select,textarea'))retryBlockedRadio();});
  document.addEventListener('coolradio-onboarding-ready',()=>startOpenedPlayer());
  // Retry browser-blocked sound within the next real user activation.
  for(const name of ['pointerdown','keydown'])document.addEventListener(name,event=>{
    // Play and its Space shortcut already handle the retry themselves.
    if(event.isTrusted&&radioAutoplayBlocked&&event.code!=='Space'&&!event.target.closest?.('#radio-play'))retryBlockedRadio();
  },{capture:true});
  function startOpenedPlayer(userInitiated=false,reopen=false){
    // The v4 receiver starts automatically; onboarding does not gate playback.
    if(!userInitiated&&$('welcome-splash-v2')&&!$('welcome-splash-v2').classList.contains('leaving'))return;
    const screen=document.querySelector('.screen.active')?.id;
    if(screen==='radio-screen'){
      if(!reopen&&radioHls&&!audio.getAttribute('src'))return;
      if(!reopen&&(audio.getAttribute('src')||radioHls))return;
      const rows=currentRows('radio');
      const station=radioStartupPending
        ?rows[0]
        :(rows.find(item=>stationKey(item)===stationKey(radioCurrent()||{}))||rows[0]);
      if(station){radioStartupPending=false;playRadio(station);}
    }else if(screen==='tv-screen'){
      if(!reopen&&hls&&!video.getAttribute('src'))return;
      if(!reopen&&(video.getAttribute('src')||hls))return;
      const rows=currentRows('tv');const station=rows.find(row=>row.url===tvCurrent()?.url)||rows[0]||tvs.find(row=>row.url===DEFAULT_TV_CHANNEL.url);if(station)playTV(station);
    }
  }
  let lastPlayerScreen='radio-screen';
  function setScreen(screenId,userInitiated=false,startPlayer=true){
    if(!$(screenId)?.classList.contains('screen'))return;
    const previous=document.querySelector('.screen.active')?.id;
    if(screenId==='explore-screen'){
      const currentMode=previous==='tv-screen'?'tv':previous==='radio-screen'?'radio':$('ux-receiver')?.dataset.mode;
      const nextKind=currentMode==='tv'?'tv':'radio';
      if(nextKind!==browserKind){onlineRows=[];onlineOffset=0;onlineVisibleLimit=100;onlineHasMore=false;onlineCountries=[];onlineGenres=[];onlineSearchDone=false;}
      browserKind=nextKind;
      $('explore-search').placeholder=browserKind==='tv'?'Search TV channels...':'Search radio stations...';
      $('explore-search').setAttribute('aria-label',browserKind==='tv'?'Search TV channels':'Search radio stations');
      populateExploreFilters();renderExplore();
      if(browserSource==='online'&&!onlineCountries.length)loadOnlineFilters();
    }
    if(previous==='presets-screen'&&screenId!==previous&&cancelPresetDrag)renderPresets();
    document.dispatchEvent(new CustomEvent('retro-mode-changing',{detail:{screenId,previous}}));
    if(screenId!=='tv-screen')tvAutoRotation.leave();
    if(screenId==='tv-screen'){
      cancelContinuousRetry('radio');
      if(audio.src||radioHls)stopRadio();else radioRecovery.stop();
    }
    if(screenId==='radio-screen'){
      cancelContinuousRetry('tv');
      if(hls||youtubePlayer||youtubeHost||video.src||video.currentSrc)stopTV();else tvRecovery.stop();
    }
    document.querySelectorAll('.screen').forEach(node=>node.classList.toggle('active',node.id===screenId));
    document.querySelectorAll('.nav-item[data-screen]').forEach(node=>node.classList.toggle('active',node.dataset.screen===screenId));
    const playerActive=screenId==='radio-screen'||screenId==='tv-screen';
    if(playerActive)lastPlayerScreen=screenId;
    const playerTab=document.querySelector('[data-player-nav]');
    playerTab.classList.toggle('active',playerActive);
    if(playerActive)playerTab.setAttribute('aria-current','page');
    else playerTab.removeAttribute('aria-current');
    document.querySelectorAll('[data-mode-screen]').forEach(node=>{const active=node.dataset.modeScreen===screenId;node.classList.toggle('selected',active);node.setAttribute('aria-selected',String(active));});
    $('mode-label').textContent=screenId==='radio-screen'?'◉ RADIO MODE':screenId==='tv-screen'?'▣ TV MODE':screenId==='presets-screen'?'♥ FAVORITES':'⌕ SEARCH';
    if(screenId==='presets-screen')renderPresets();
    if(startPlayer&&(previous!==screenId||userInitiated)&&playerActive)startOpenedPlayer(userInitiated,previous!==screenId);
  }
  function stepScreen(direction){const order=['radio-screen','tv-screen','presets-screen','explore-screen'],active=document.querySelector('.screen.active')?.id,index=Math.max(0,order.indexOf(active));setScreen(order[(index+direction+order.length)%order.length]);}
  function radioCurrent(){return radios[radioIndex]||null;}
  function tvCurrent(){return tvs[tvIndex]||null;}
  function drawRadio(){
    const station=radioCurrent(),art=$('radio-art'),logo=stationLogo(station);const star=$('radio-star'),isSaved=Boolean(station&&radioPresets[stationKey(station)]);star.textContent=isSaved?'♥':'♡';star.classList.toggle('saved',isSaved);star.disabled=!station;star.setAttribute('aria-label',isSaved?'Remove station from favorites':'Add station to favorites');art.classList.toggle('playing',!audio.paused);
    art.dataset.stationLogo=logo;
    art.dataset.stationCategory=station?getStationCategory(station):'CASSETTE';
    if(!station){art.innerHTML='<div class="radio-dot-texture" aria-hidden="true"></div><div class="record-mark"><span class="radio-signal-icon" aria-hidden="true">◉</span><b class="radio-center-title">Choose a station</b><small class="radio-center-country">WORLD RADIO</small><div class="record-equalizer" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div>';art.classList.toggle('glow-off',glowMode==='off');$('radio-status').textContent='READY · SEARCH OR CHOOSE A FAVORITE';formatClock();return;}
    const key=stationKey(station),saved=Boolean(radioPresets[key]),stationName=station.name||'Internet Radio',name=safe(stationName),country=safe(station.country||'WORLD RADIO'),details=safe([station.country||'Internet radio',station.codec||'LIVE',station.bitrate?`${station.bitrate} KBPS`:null].filter(Boolean).join(' · '));
    const artworkSignature=JSON.stringify([key,logo,stationName,details,art.dataset.stationCategory]);
    if(art.dataset.renderedStation===artworkSignature&&art.querySelector('.record-mark')){
      $('radio-status').textContent=audio.paused?'READY — PRESS PLAY TO LISTEN':'TUNED IN — LIVE RADIO';formatClock();return;
    }
    art.dataset.renderedStation=artworkSignature;
    const starHTML='';
    art.style.backgroundImage='radial-gradient(circle at 50% 48%,#343438,#15171a 68%,#0d0f12)';art.innerHTML='<div class="radio-dot-texture" aria-hidden="true"></div><div class="radio-glow-bloom" aria-hidden="true"></div><div class="radio-glow-ring" aria-hidden="true"></div><div class="speaker-aura" aria-hidden="true"></div><div class="speaker-cone" aria-hidden="true"></div><div class="record-mark"><span class="radio-signal-icon" aria-hidden="true">◉</span><b class="radio-center-title">'+name+'</b><small class="radio-center-country">'+country+'</small><div class="record-equalizer" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div><div class="radio-art-caption">'+starHTML+'<div><h1 id="radio-title">'+name+'</h1><p id="radio-subtitle">'+details+'</p></div></div>';art.classList.toggle('glow-off',glowMode==='off');
    $('radio-status').textContent=audio.paused?'READY · PRESS PLAY TO LISTEN':'TUNED IN · LIVE RADIO';formatClock();
  }
  function updateRadioShortcutFocus(target){
    const cards=[...target.querySelectorAll('.radio-mini-card')];if(!cards.length)return;
    const bounds=target.getBoundingClientRect(),center=bounds.left+bounds.width/2,reach=Math.max(1,bounds.width*.65);
    for(const card of cards){const rect=card.getBoundingClientRect(),distance=Math.abs(rect.left+rect.width/2-center),focus=Math.max(0,1-distance/reach);card.style.setProperty('--rail-scale',(0.52+focus*.68+(card.classList.contains('active')?.10:0)).toFixed(3));card.style.setProperty('--rail-opacity',(0.45+focus*.55).toFixed(3));card.style.zIndex=String(Math.round(focus*10));}
  }
  function renderRadioShortcuts(){const target=$('radio-station-strip');if(!target)return;const rows=currentRows('radio').slice(0,PRESET_LIMIT);target.innerHTML=rows.map((station,index)=>{const logo=stationLogo(station),name=station.name||'Radio';return `<button type="button" class="radio-mini-card ${radioCurrent()&&stationKey(radioCurrent())===stationKey(station)?'active':''}" data-radio-shortcut="${index}" title="${safe(name)}" aria-label="Play ${safe(name)}"><span class="radio-mini-logo">${logo?`<img loading="lazy" decoding="async" src="${safe(logo)}" alt="">`:`<span class="logo-fallback">${safe(initialsFor(name))}</span>`}</span><b>${safe(name)}</b></button>`;}).join('')||'<span class="empty-note">Save stations from Search to add quick tune cards.</span>';target.querySelectorAll('[data-radio-shortcut]').forEach(button=>{
      const station=rows[Number(button.dataset.radioShortcut)];
      decorateRadioCard(button,station);
    });
    if(!target.dataset.tuneHandlerReady){
      target.addEventListener('click',event=>{
        const button=event.target.closest('button[data-radio-shortcut]');
        if(!button||!target.contains(button))return;
        if(event.isTrusted&&target.dataset.dragged==='true'){delete target.dataset.dragged;return;}
        playRadio(currentRows('radio')[Number(button.dataset.radioShortcut)],false,Number(button.dataset.tuneDirection)||1);
      });
      target.dataset.tuneHandlerReady='true';
    }
    // Browsing/centering cards must never start a different station.
    if(!target.dataset.focusEffectReady){target.addEventListener('scroll',()=>requestAnimationFrame(()=>updateRadioShortcutFocus(target)),{passive:true});window.addEventListener('resize',()=>updateRadioShortcutFocus(target));target.dataset.focusEffectReady='true';}
    requestAnimationFrame(()=>{const active=target.querySelector('.radio-mini-card.active');if(active){const rail=target.getBoundingClientRect(),card=active.getBoundingClientRect();target.scrollTo({left:Math.max(0,active.offsetLeft-(target.clientWidth-active.offsetWidth)/2),behavior:'smooth'});}updateRadioShortcutFocus(target);});
    if(!target.dataset.desktopScrollReady){let drag=null;target.addEventListener('wheel',event=>{if(Math.abs(event.deltaY)>Math.abs(event.deltaX)&&target.scrollWidth>target.clientWidth){target.scrollLeft+=event.deltaY;event.preventDefault();}},{passive:false});target.addEventListener('pointerdown',event=>{if(event.pointerType!=='mouse'||event.button!==0)return;drag={x:event.clientX,left:target.scrollLeft,moved:false,pointerId:event.pointerId,captured:false};});target.addEventListener('pointermove',event=>{if(!drag)return;const delta=event.clientX-drag.x;if(Math.abs(delta)>5&&!drag.moved){drag.moved=true;try{target.setPointerCapture(drag.pointerId);drag.captured=true;}catch{}}if(drag.moved){target.classList.add('dragging');target.scrollLeft=drag.left-delta;event.preventDefault();}});const finish=event=>{if(!drag)return;if(drag.moved){target.dataset.dragged='true';setTimeout(()=>delete target.dataset.dragged,180);}if(drag.captured&&target.hasPointerCapture(drag.pointerId)){try{target.releasePointerCapture(drag.pointerId);}catch{}}drag=null;target.classList.remove('dragging');};target.addEventListener('pointerup',finish);target.addEventListener('pointercancel',finish);window.addEventListener('pointerup',finish);target.dataset.desktopScrollReady='true';}
  }
  function renderRadioDisplay(){if(!radioPresets||!Object.keys(radioPresets).length)return;const current=radioCurrent();if(current&&!radioPresets[stationKey(current)])radioIndex=-1;const rows=currentRows('radio');if(!current&&rows.length){const selected=rows[0];radioIndex=radios.findIndex(s=>stationKey(s)===stationKey(selected));}drawRadio();renderRadioShortcuts();}
  function normaliseRecent(entries){
    const rows=[],seen=new Set();
    for(const entry of entries){
      if(!entry?.url||!entry.name||!['radio','tv'].includes(entry.kind))continue;
      const key=entry.key||entry.url,identity=entry.kind+':'+key;
      if(seen.has(identity))continue;
      seen.add(identity);rows.push({...entry,key});
      if(rows.length===RECENT_LIMIT)break;
    }
    return rows;
  }
  function rememberPlayed(kind,station){
    if(!station)return;
    const row={kind,key:presetKey(kind,station),url:(kind==='radio'?station.url_resolved:null)||station.url,name:station.name||'Untitled',country:station.country||'',logo:stationLogo(station),playedAt:Date.now()};
    if(kind==='radio'){row.tags=station.tags;row.genre=station.genre;row.artworkCategory=station.artworkCategory;}
    recentHistory=normaliseRecent([row,...recentHistory]);
    saveStore(RECENT_STORE,recentHistory);
    updatePresetCounts();
    if(presetMode==='recent')renderPresets();
  }
  // Reject mixed-content sources before assigning media.src.
  const blockedStream=station=>location.protocol==='https:'&&/^http:\/\//i.test(String(station?.url_resolved||station?.url||'').trim());
  let radioPlaybackGeneration=0,tvPlaybackGeneration=0;
  function startRadioAudio(){
    // Match TV: start media directly and let the artwork follow playback events.
    return audio.play();
  }

  async function playRadio(station,automatic=false,direction=1){
    if(!station)return;
    cancelContinuousRetry('radio');
    $('radio-art').dataset.playbackBlocked='false';
    window.retroRadioMechanism?.cancel();
    const generation=++radioPlaybackGeneration;
    radioRecovery.stop();
    const src=station?.url_resolved||station?.url;
    radioAutoplayBlocked=false;currentRadioSource=src;
    const key=stationKey(station);radioIndex=radios.findIndex(s=>stationKey(s)===key);if(radioIndex<0){radios.unshift(station);radioIndex=0;}
    if(hls||video.src||video.currentSrc)stopTV();
    if(radioHls){radioHls.destroy();radioHls=null;}audio.pause();audio.removeAttribute('src');audio.load();
    // Match v1's direct-stream order. HLS sources must be attached through
    // Hls.js instead of being assigned to audio.src as a playlist URL.
    // Preserve listener volume across station changes.
    $('equalizer').classList.remove('playing');drawRadio();$('radio-status').textContent='CONNECTING · '+(station.name||'RADIO');rememberPlayed('radio',station);renderRadioShortcuts();
    radioRecovery.begin(automatic,direction);
    if(!src||blockedStream(station)){radioRecovery.fail();return;}
    if($('radio-screen').classList.contains('active')){
      remoteMedia=audio;
      syncRemoteMedia();
    }
    const onRadioStarted=()=>{if(generation!==radioPlaybackGeneration)return;$('radio-art').classList.add('playing');$('equalizer').classList.add('playing');$('radio-play').textContent='Ⅱ';$('radio-play').title='Pause';$('radio-play').setAttribute('aria-label','Pause');$('radio-status').textContent=`Playing · ${station.name||'Internet radio'}`;};
    const onRadioFailed=error=>{if(generation!==radioPlaybackGeneration||error?.name==='AbortError')return;radioRecovery.reject(error);if(error?.name==='NotAllowedError'){radioAutoplayBlocked=true;showRemoteCommand('Radio playback','Browser blocked audio: NotAllowedError');$('radio-art').dataset.playbackBlocked='true';if(remoteMedia===audio)syncRemoteMedia();$('radio-status').textContent='TAP PLAY TO START RADIO';return;}console.error('Radio playback failed:',currentRadioSource,error||'play() rejected');if(location.protocol==='https:'&&/^http:\/\//i.test(currentRadioSource)){$('radio-status').textContent='HTTPS REQUIRED · THIS STREAM USES HTTP';notify('This station uses an HTTP link, which secure pages block. Use an HTTPS stream.');}else{$('radio-status').textContent='STREAM COULD NOT START';notify('This station stream could not start. Try another station.');}};
    const isHls=/\.m3u8(?:$|[?#])/i.test(src);
    if(isHls&&window.Hls&&Hls.isSupported()){
      const player=new Hls({enableWorker:true,lowLatencyMode:false,maxBufferLength:18});radioHls=player;
      player.on(Hls.Events.MANIFEST_PARSED,()=>{if(radioHls!==player||generation!==radioPlaybackGeneration)return;startRadioAudio().then(onRadioStarted).catch(onRadioFailed);});
      player.on(Hls.Events.ERROR,(_event,data)=>{if(data.fatal&&radioHls===player){radioRecovery.fail();const insecure=location.protocol==='https:'&&/^http:\/\//i.test(currentRadioSource);$('radio-status').textContent=insecure?'HTTPS REQUIRED · THIS STREAM USES HTTP':'RADIO STREAM UNAVAILABLE';console.error('Radio HLS error:',data.type,data.details,currentRadioSource);notify(insecure?'This station uses an HTTP link, which secure pages block. Use an HTTPS stream.':'This radio stream is unavailable right now. Try another station.');player.destroy();radioHls=null;audio.pause();audio.removeAttribute('src');audio.load();$('radio-art').classList.remove('playing');$('equalizer').classList.remove('playing');$('radio-play').textContent='▶';}});
      player.on(Hls.Events.MEDIA_ATTACHED,()=>{if(radioHls===player)player.loadSource(src);});
      player.attachMedia(audio);
    }else if(isHls&&audio.canPlayType('application/vnd.apple.mpegurl')){
      audio.src=src;
      try{await startRadioAudio();onRadioStarted();}catch(error){onRadioFailed(error);}
    }else if(isHls){
      const insecure=location.protocol==='https:'&&/^http:\/\//i.test(currentRadioSource);
      $('radio-status').textContent=insecure?'HTTPS REQUIRED · THIS STREAM USES HTTP':'HLS PLAYER UNAVAILABLE';
      radioRecovery.fail();
    }else{
      audio.src=src;
      try{await startRadioAudio();onRadioStarted();}catch(error){onRadioFailed(error);}
    }
    if(generation===radioPlaybackGeneration)renderPresets();
  }
  function toggleRadio(){if(continuousRetryTimers.radio){stopRadio();return;}if(radioAutoplayBlocked&&$('radio-screen').classList.contains('active')){retryBlockedRadio();return;}if(radioRecovery.connecting&&audio.paused){stopRadio();return;}if(window.retroRadioMechanism?.pending){window.retroRadioMechanism.cancel();radioRecovery.stop();return;}if(!audio.src){const rows=currentRows('radio'),selected=radioCurrent(),station=rows.find(item=>selected&&stationKey(item)===stationKey(selected))||rows[0];if(station)playRadio(station);else notify('Choose a radio favorite first.');return;}if(audio.paused){startRadioAudio().then(()=>{$('equalizer').classList.add('playing');$('radio-art').classList.add('playing');$('radio-play').textContent='Ⅱ';}).catch(error=>{console.error('Radio resume failed:',currentRadioSource,error);if(location.protocol==='https:'&&/^http:\/\//i.test(currentRadioSource)){ $('radio-status').textContent='HTTPS REQUIRED · THIS STREAM USES HTTP';notify('This station uses an HTTP link, which secure pages block. Use an HTTPS stream.');}else notify('This stream could not be resumed. Try another station.');});}else{radioRecovery.stop();audio.pause();}}
  function stopRadio(){cancelContinuousRetry('radio');$('radio-art').dataset.playbackBlocked='false';setRecoveryStatus('radio','');window.retroRadioMechanism?.cancel();radioPlaybackGeneration++;radioAutoplayBlocked=false;radioRecovery.stop();if(radioHls){radioHls.destroy();radioHls=null;}audio.pause();audio.removeAttribute('src');audio.load();if(remoteMedia===audio)syncRemoteMedia();currentRadioSource='';$('radio-art').classList.remove('playing');$('radio-play').textContent='▶';$('radio-play').title='Play';$('radio-play').setAttribute('aria-label','Play');$('equalizer').classList.remove('playing');$('radio-status').textContent='STOPPED';}
  function togglePreset(kind,station){
    const isRadio=kind==='radio',presets=isRadio?radioPresets:tvPresets,key=presetKey(kind,station);
    if(!key)return;
    const removing=Object.hasOwn(presets,key);
    if(!removing&&Object.keys(presets).length>=PRESET_LIMIT){notify(`Maximum ${PRESET_LIMIT} ${isRadio?'radio':'TV'} favorites. Remove one before adding another.`);return;}
    const next={...presets,[key]:station};
    if(removing)delete next[key];
    if(!saveStore(isRadio?RADIO_STORE:TV_STORE,next))return;
    const hiddenStore=isRadio?RADIO_HIDDEN_STORE:TV_HIDDEN_STORE;
    const excluded=loadStore(hiddenStore,[]),hidden=new Set(Array.isArray(excluded)?excluded:[]);
    if(removing&&(isRadio?radios:tvs).some(item=>presetKey(kind,item)===key))hidden.add(key);
    else hidden.delete(key);
    saveStore(hiddenStore,[...hidden]);
    if(isRadio){
      radioPresets=next;drawRadio();renderRadioShortcuts();
    }else{
      tvPresets=next;saveStore(TV_ORDER_STORE,Object.keys(next));drawTV();
      if(!tvCurrent())renderTVRail();
    }
    renderPresets();renderExplore();
  }
  function renderRemotePresets(){
    const target=$('remote-presets');if(!target)return;const allRows=currentRows('tv'),rows=allRows.slice(0,PRESET_LIMIT),picker=$('remote-channel-select');
    picker.innerHTML='<option value="">Choose a channel</option>'+allRows.map(station=>`<option value="${safe(station.url)}">${safe(station.name||'TV channel')}</option>`).join('');picker.value=tvCurrent()?.url||'';
    target.innerHTML=rows.map((station,index)=>`<button class="remote-key remote-preset-key ${tvCurrent()?.url===station.url?'active':''}" type="button" data-remote-preset="${index}" aria-pressed="${tvCurrent()?.url===station.url}" aria-label="Play ${safe(station.name||'TV channel')}" title="${safe(station.name||'TV channel')}">${String(index+1).padStart(2,'0')}</button>`).join('')||'<span class="empty-note">Save TV channels as favorites to use quick select.</span>';
    target.querySelectorAll('[data-remote-preset]').forEach(button=>button.addEventListener('click',()=>{const station=rows[Number(button.dataset.remotePreset)];if(station)playTV(station,false,Number(button.dataset.tuneDirection)||1);}));
  }
  let tvRailBrowsing=false,tvRailSettleTimer=0;
  function renderTVRail(){
    const target=$('tv-rail');if(!target)return;const rows=currentRows('tv');const playing=tvCurrent();if(playing&&!rows.some(row=>row.url===playing.url))rows.unshift(playing);
    clearTimeout(tvRailSettleTimer);tvRailSettleTimer=0;tvRailBrowsing=false;
    const picture=$('tv-display').querySelector('.tv-picture');if(picture&&target.contains(picture))$('tv-display').prepend(picture);
    target.innerHTML=rows.map(station=>{const name=station.name||'TV channel';return `<div tabindex="0" class="tv-rail-card ${playing?.url===station.url?'active':''}" data-tv-url="${safe(station.url)}" aria-label="Play ${safe(name)}"><span class="tv-rail-copy"><b>${safe(name)}</b><small>${safe(station.country||station.group||'TV')}</small></span></div>`;}).join('')||'<span class="empty-note">No TV favorites yet - save channels from Search.</span>';
    target.querySelectorAll('[data-tv-url]').forEach(card=>card.addEventListener('click',event=>{if(event.target.closest('.tv-picture'))return;const station=rows.find(s=>s.url===card.dataset.tvUrl);if(station&&station.url!==tvCurrent()?.url)playTV(station);}));
    renderRemotePresets();
    const active=target.querySelector('.tv-rail-card.active');
    if(active&&picture&&!tvFullscreenActive&&!$('tv-screen').closest('#ux-tv-slot')){
      active.append(picture);active.classList.add('tv-video-card');
      const rail=target.getBoundingClientRect(),card=active.getBoundingClientRect();
      target.scrollTo({left:target.scrollLeft+card.left-rail.left+(card.width-rail.width)/2,behavior:'instant'});
    }
    if(!target.dataset.dragReady){
      function tuneVisibleChannel(){
        clearTimeout(tvRailSettleTimer);tvRailSettleTimer=0;
        if(!tvRailBrowsing||dragState)return;
        tvRailBrowsing=false;
        if(tvFullscreenActive||!$('tv-screen').classList.contains('active')||!target.clientWidth)return;
        const rail=target.getBoundingClientRect(),center=rail.left+rail.width/2;
        const card=[...target.querySelectorAll('[data-tv-url]')].find(candidate=>{
          const bounds=candidate.getBoundingClientRect();
          return bounds.left<=center&&center<bounds.right;
        });
        if(!card||card.dataset.tvUrl===tvCurrent()?.url)return;
        const station=currentRows('tv').find(row=>row.url===card.dataset.tvUrl);
        if(station)playTV(station);
      }
      function scheduleTVRailTune(){
        if(!tvRailBrowsing)return;
        clearTimeout(tvRailSettleTimer);
        tvRailSettleTimer=setTimeout(tuneVisibleChannel,180);
      }
      target.addEventListener('scroll',scheduleTVRailTune,{passive:true});
      target.addEventListener('scrollend',()=>{if(tvRailSettleTimer)tuneVisibleChannel();});
      target.addEventListener('wheel',event=>{
        if(event.ctrlKey||target.scrollWidth<=target.clientWidth)return;
        tvRailBrowsing=true;
        if(Math.abs(event.deltaY)>Math.abs(event.deltaX)){target.scrollLeft+=event.deltaY;event.preventDefault();}
      },{passive:false});
      target.addEventListener('pointerdown',event=>{
        // Capturing a press on the in-picture button would send its click to the rail.
        if(event.button!==0||event.target.closest('button'))return;
        tvRailBrowsing=true;
        if(event.pointerType!=='mouse')return;
        dragState={x:event.clientX,left:target.scrollLeft,moved:false};
        target.setPointerCapture(event.pointerId);
        target.classList.add('dragging');
      });
      target.addEventListener('pointermove',event=>{if(!dragState)return;const d=event.clientX-dragState.x;if(Math.abs(d)>4)dragState.moved=true;if(dragState.moved){target.scrollLeft=dragState.left-d;event.preventDefault();}});
      const end=event=>{
        if(!dragState)return;
        const moved=dragState.moved;
        dragState=null;target.classList.remove('dragging');
        if(target.hasPointerCapture(event.pointerId))target.releasePointerCapture(event.pointerId);
        if(!moved)return;
        target.dataset.dragged='true';
        setTimeout(()=>delete target.dataset.dragged,120);
        scheduleTVRailTune();
      };
      target.addEventListener('pointerup',end);
      target.addEventListener('pointercancel',end);
      target.addEventListener('lostpointercapture',end);
      target.addEventListener('click',event=>{
        if(target.dataset.dragged!=='true'||event.target.closest('button'))return;
        event.preventDefault();
        event.stopPropagation();
        delete target.dataset.dragged;
      },true);
      target.dataset.dragReady='true';
    }
  }
  function updateTVNumbers(){
    const volume=$('tv-volume-number'),channel=$('tv-channel-number');
    if(volume)volume.textContent=String(video.muted?0:Math.round(video.volume*100));
    const station=tvCurrent(),index=currentRows('tv').findIndex(row=>row.url===station?.url);
    if(channel)channel.textContent=index<0?'—':String(index+1);
  }
  function cleanTVTitle(value){let title=String(value||'');while(/\([^()]*\)/.test(title))title=title.replace(/\([^()]*\)/g,'');return title.replace(/\s+/g,' ').trim()||'TV';}
  function updateTVTitleStrip(){
    const rows=currentRows('tv'),station=tvCurrent(),index=rows.findIndex(row=>row.url===station?.url),hasNeighbors=rows.length>1;
    const previous=index>=0&&hasNeighbors?rows[(index-1+rows.length)%rows.length]:null,next=index>=0&&hasNeighbors?rows[(index+1)%rows.length]:null;
    $('tv-prev-name-text').textContent=previous?cleanTVTitle(previous.name):'—';$('tv-next-name-text').textContent=next?cleanTVTitle(next.name):'—';
    $('tv-prev-name').disabled=!previous;$('tv-next-name').disabled=!next;
    $('tv-prev-name').title=previous?'Previous: '+previous.name:'No previous channel';$('tv-next-name').title=next?'Next: '+next.name:'No next channel';
  }
  function drawTV(){
    updateTVNumbers();const station=tvCurrent();
    if(!station){$('tv-title').textContent='Choose a channel';$('tv-subtitle').textContent='Live channels from your favorites';$('fullscreen-channel-name').textContent='Choose a channel';$('fullscreen-channel-country').textContent='TV';$('tv-star').textContent='♡';$('tv-star').classList.remove('saved');$('remote-favorite').classList.remove('saved');$('tv-placeholder').hidden=false;updateTVTitleStrip();return;}
    $('tv-title').textContent=cleanTVTitle(station.name);$('tv-subtitle').textContent=[station.country,station.group].filter(Boolean).join(' · ')||'Live television';$('fullscreen-channel-name').textContent=cleanTVTitle(station.name);$('fullscreen-channel-country').textContent=[station.country,station.group].filter(Boolean).join(' · ')||'TV';
    const saved=Boolean(tvPresets[station.url]);$('tv-star').textContent=saved?'♥':'♡';$('tv-star').classList.toggle('saved',saved);$('remote-favorite').classList.toggle('saved',saved);$('tv-placeholder').hidden=Boolean(video.currentSrc||video.src);updateTVTitleStrip();renderTVRail();
  }
  function stopTV(){cancelContinuousRetry('tv');setRecoveryStatus('tv','');tvPlaybackGeneration++;tvRecovery.stop();tvAutoRotation.leave();clearYouTube();if(hls){hls.destroy();hls=null;}video.pause();video.removeAttribute('src');video.load();$('tv-toggle').textContent='▶';drawTV();}
  let tvPlaylistIndex=0;
  async function playTV(station,automatic=false,direction=1){
    cancelContinuousRetry('tv');
    const generation=++tvPlaybackGeneration;
    tvRecovery.stop();
    clearYouTube();tvPlaylistIndex=0;
    if(!station)return;const rows=currentRows('tv');tvIndex=tvs.findIndex(s=>s.url===station.url);if(tvIndex<0){tvs.unshift(station);tvIndex=0;}if(hls){hls.destroy();hls=null;}video.pause();video.removeAttribute('src');video.load();
    if(audio.src||radioHls)stopRadio();
    updateTVNumbers();
    tvRecovery.begin(automatic,direction);
    if(!station.url||blockedStream(station)){tvRecovery.fail();return;}
    const url=station.url||'';drawTV();$('tv-placeholder').hidden=true;rememberPlayed('tv',station);
    if(/\.m3u8($|\?)/i.test(url)&&window.Hls&&Hls.isSupported()){hls=new Hls({enableWorker:true,maxBufferLength:15});hls.loadSource(url);hls.attachMedia(video);hls.on(Hls.Events.MANIFEST_PARSED,()=>{if(generation!==tvPlaybackGeneration)return;video.play().then(()=>{if(generation!==tvPlaybackGeneration)return;$('tv-toggle').textContent='Ⅱ';}).catch(error=>{if(generation!==tvPlaybackGeneration)return;tvRecovery.reject(error);if(error?.name==='NotAllowedError')notify('Press play on the video to start.');});});hls.on(Hls.Events.ERROR,(_e,data)=>{if(generation===tvPlaybackGeneration&&data.fatal)tvRecovery.fail();});}
    else{video.src=url;try{await video.play();if(generation!==tvPlaybackGeneration)return;$('tv-toggle').textContent='Ⅱ';}catch(error){if(generation!==tvPlaybackGeneration)return;tvRecovery.reject(error);if(error?.name==='NotAllowedError')notify('Press play on the video to start this channel.');}}
    if(generation!==tvPlaybackGeneration)return;
    drawTV();renderPresets();
  }
  function updateTVPlayLabel(playing){
    const label=playing?'Pause':'Play';
    $('tv-toggle').setAttribute('aria-label',label);
    $('tv-display').classList.toggle('is-playing',playing);
    document.querySelector('[data-fullscreen-action="play"]').setAttribute('aria-label',label);
  }
  let youtubePlayer=null,youtubeHost=null,youtubeGeneration=0,youtubeApiPromise=null;
  function clearYouTube(){document.getElementById('cooltv-youtube-actions')?.remove();youtubeGeneration++;if(youtubeHost)updateTVPlayLabel(false);if(youtubePlayer){try{youtubePlayer.destroy();}catch{}youtubePlayer=null;}youtubeHost?.remove();youtubeHost=null;video.style.visibility='';}
  function loadYouTubeAPI(){if(window.YT?.Player)return Promise.resolve();if(!youtubeApiPromise)youtubeApiPromise=new Promise((resolve,reject)=>{const previous=window.onYouTubeIframeAPIReady;window.onYouTubeIframeAPIReady=()=>{previous?.();resolve();};const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.onerror=()=>{youtubeApiPromise=null;reject(new Error('YouTube unavailable'));};document.head.append(script);});return youtubeApiPromise;}
  async function playPlaylistItem(url){
    updateTVNumbers();
    tvRecovery.stop();
     // Embedded YouTube keeps its own Retry/Skip controls.
    clearYouTube();const match=String(url).match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    if(!match){video.src=url;video.play().catch(()=>notify('Tap Play to continue COOLtv.'));return;}
    video.pause();video.style.visibility='hidden';const generation=youtubeGeneration;
    youtubeHost=document.createElement('div');youtubeHost.style.cssText='position:absolute;inset:0;z-index:3;background:#000';const mount=document.createElement('iframe');mount.id='cooltv-youtube-player';mount.title='COOLtv YouTube video';mount.referrerPolicy='strict-origin-when-cross-origin';mount.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';mount.allowFullscreen=true;mount.style.cssText='width:100%;height:100%;border:0;min-height:200px';const params=new URLSearchParams({enablejsapi:'1',playsinline:'1',origin:location.origin,widget_referrer:location.href});mount.src='https://www.youtube.com/embed/'+match[1]+'?'+params;youtubeHost.append(mount);video.parentElement.append(youtubeHost);
    try{await loadYouTubeAPI();if(generation!==youtubeGeneration)return;youtubePlayer=new YT.Player('cooltv-youtube-player',{events:{onReady:e=>{e.target.setVolume(Math.round(video.volume*100));e.target.playVideo();notify('If playback pauses, press Play in the YouTube player.');},onStateChange:e=>{if(generation!==youtubeGeneration)return;if(e.data===1||e.data===2||e.data===0)updateTVPlayLabel(e.data===1);if(e.data===0)advanceTVPlaylist();},onError:event=>{if(generation!==youtubeGeneration)return;console.warn('COOLtv YouTube error',event.data);notify('YouTube error '+event.data+'. Use Retry, Skip, or Open on YouTube below the picture.');document.getElementById('cooltv-youtube-actions')?.remove();const actions=document.createElement('div');actions.id='cooltv-youtube-actions';actions.style.cssText='padding:12px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;background:#172638;color:#fff';const message=document.createElement('span');message.textContent='YouTube error '+event.data;const retry=document.createElement('button');retry.type='button';retry.textContent='Retry';retry.onclick=()=>playPlaylistItem(url);const skip=document.createElement('button');skip.type='button';skip.textContent='Skip video';skip.onclick=advanceTVPlaylist;const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Open on YouTube';link.style.color='#ffe0a3';actions.append(message,retry,skip,link);video.parentElement.insertAdjacentElement('afterend',actions);}}});}catch{if(generation===youtubeGeneration){notify('YouTube could not load. Check the connection or choose another channel.');}}
  }
  function advanceTVPlaylist(){const station=tvCurrent(),playlist=station?.playlist;if(!Array.isArray(playlist)||playlist.length<2)return;const next=tvPlaylistIndex+1;if(next>=playlist.length&&!station.playlistLoop)return;tvPlaylistIndex=next%playlist.length;playPlaylistItem(playlist[tvPlaylistIndex]);}
  video.addEventListener('ended',advanceTVPlaylist);
  video.addEventListener('volumechange',()=>{if(youtubePlayer?.setVolume){youtubePlayer.setVolume(Math.round(video.volume*100));if(video.muted)youtubePlayer.mute();else youtubePlayer.unMute();}});
  function stepTV(direction){
    const rows=recoveryRows('tv');
    if(!rows.length)return;
    let index=rows.findIndex(station=>station.url===tvCurrent()?.url);
    if(index<0)index=direction>0?-1:0;
    index=(index+direction+rows.length)%rows.length;
    return playTV(rows[index],false,direction);
  }
  function setTVPlayback(action='toggle'){
    if(action!=='play'&&continuousRetryTimers.tv){stopTV();return;}
    if(youtubePlayer?.getPlayerState){
      if(action==='pause'||(action==='toggle'&&youtubePlayer.getPlayerState()===1))youtubePlayer.pauseVideo();
      else youtubePlayer.playVideo();
      return;
    }
    if(action==='pause'||(action==='toggle'&&(!video.paused||tvRecovery.connecting))){
      if(tvRecovery.connecting&&video.paused)stopTV();
      else{tvRecovery.stop();video.pause();}
      return;
    }
    if(!video.paused||youtubeHost)return;
    if(!video.src&&!video.currentSrc&&!hls){
      const station=tvCurrent()||currentRows('tv')[0];
      if(station)playTV(station);
      return;
    }
    video.play().catch(()=>notify('Press play on the video.'));
  }
  const tvShell=$('tv-fullscreen-shell'),tvDisplay=$('tv-display');
  const tvScreen=$('tv-screen'),tvApp=tvScreen.closest('main');
  let tvFullscreenActive=false,tvNativeFullscreen=false,tvAutoFullscreen=false;
  let tvFullscreenSession=0,tvShellHome=null;
  const isTVVisible=()=>tvScreen.classList.contains('active')&&
    (!tvApp?.dataset.view||tvApp.dataset.view==='tuner');
  const tvAutoRotation=createTVAutoFullscreen({
    isTVVisible,
    isFullscreen:()=>tvFullscreenActive,
    isAutomatic:()=>tvAutoFullscreen,
    enter:()=>enterTVFullscreen(true),
    enterDesktop:()=>enterTVFullscreen(false,navigator.userActivation?.isActive!==false),
    exit:exitTVFullscreen
  });
  const tvViewObserver=new MutationObserver(tvAutoRotation.schedule);
  tvViewObserver.observe(tvScreen,{attributes:true,attributeFilter:['class']});
  if(tvApp)tvViewObserver.observe(tvApp,{attributes:true,attributeFilter:['data-view']});
  const tvFullscreenButton=document.querySelector('[data-remote="fullscreen"]');
  let inlineTVControlsTimer=0;
  function showInlineTVControls(){
    const stage=$('tv-display');stage.classList.add('inline-controls-visible');
    clearTimeout(inlineTVControlsTimer);
    inlineTVControlsTimer=setTimeout(()=>{
      if(!video.paused&&!document.activeElement?.closest('.tv-inline-fullscreen'))stage.classList.remove('inline-controls-visible');
    },2400);
  }
  for(const name of ['pointermove','pointerdown','keydown','focusin','focusout'])$('tv-display').addEventListener(name,showInlineTVControls);
  for(const name of ['playing','pause','loadedmetadata'])video.addEventListener(name,showInlineTVControls);
  showInlineTVControls();
  const fullscreenElement=()=>document.fullscreenElement||document.webkitFullscreenElement;
  const portraitTV=window.matchMedia('(orientation: portrait)');
  function syncTVFullscreenLayout(){
    const mobile=window.matchMedia('(pointer: coarse)').matches||navigator.maxTouchPoints>0;
    tvShell.classList.toggle('ux-portrait-cinema',tvFullscreenActive&&
      !tvAutoFullscreen&&mobile&&portraitTV.matches);
  }
  function showTVViewport(){
    // A top-layer popover keeps the video and embedded player in their original DOM tree.
    if(typeof tvShell.showPopover==='function'){
      tvShell.setAttribute('popover','manual');
      try{tvShell.showPopover();return;}
      catch{tvShell.removeAttribute('popover');}
    }
    tvShellHome=document.createComment('TV fullscreen shell');
    tvShell.before(tvShellHome);
    document.body.append(tvShell);
  }
  function announceTVFullscreen(){
    tvFullscreenButton?.setAttribute('aria-pressed',String(tvFullscreenActive));
    document.dispatchEvent(new CustomEvent('retro-tv-fullscreen',{detail:{active:tvFullscreenActive}}));
  }
  async function enterTVFullscreen(automatic=false,native=true){
    if(tvFullscreenActive||!isTVVisible())return;
    const session=++tvFullscreenSession;
    tvFullscreenActive=true;
    tvAutoFullscreen=automatic;
    tvShell.classList.add('tv-cinema');
    tvDisplay.classList.add('cinema-mode');
    document.body.classList.add('tv-fullscreen-open');
    syncTVFullscreenLayout();
    announceTVFullscreen();
    const request=tvShell.requestFullscreen||tvShell.webkitRequestFullscreen;
    if(automatic||!native||!request){showTVViewport();return;}
    try{
      await request.call(tvShell);
    }catch{
      if(session===tvFullscreenSession)showTVViewport();
      return;
    }
    if(session!==tvFullscreenSession){
      if(!tvFullscreenActive&&fullscreenElement()===tvShell)await leaveNativeTVFullscreen();
      return;
    }
    tvNativeFullscreen=fullscreenElement()===tvShell;
    if(!tvNativeFullscreen)showTVViewport();
  }
  function toggleTVFullscreen(){
    return tvFullscreenActive?exitTVFullscreen():enterTVFullscreen();
  }
  async function leaveNativeTVFullscreen(){
    const exit=document.exitFullscreen||document.webkitExitFullscreen;
    try{await exit?.call(document);}catch{}
  }
  async function exitTVFullscreen(reason='user'){
    if(reason==='user')tvAutoRotation.dismiss();
    if(!tvFullscreenActive)return;
    ++tvFullscreenSession;
    tvFullscreenActive=false;
    tvNativeFullscreen=false;
    tvAutoFullscreen=false;
    if(tvShell.hasAttribute('popover')){
      tvShell.hidePopover();
      tvShell.removeAttribute('popover');
    }
    if(tvShellHome){
      tvShellHome.replaceWith(tvShell);
      tvShellHome=null;
    }
    tvShell.classList.remove('tv-cinema','ux-portrait-cinema');
    tvDisplay.classList.remove('cinema-mode');
    document.body.classList.remove('tv-fullscreen-open');
    announceTVFullscreen();
    if(fullscreenElement()===tvShell)await leaveNativeTVFullscreen();
  }
  window.retroPlayer.toggleTVFullscreen=toggleTVFullscreen;
  window.retroPlayer.openDesktopTVFullscreen=tvAutoRotation.openDesktop;
  window.retroPlayer.isTVFullscreen=()=>tvFullscreenActive;
  window.addEventListener('resize',syncTVFullscreenLayout);

  function updatePresetCounts(){
    $('preset-radio-count').textContent=`${Object.keys(radioPresets).length}`;
    $('preset-tv-count').textContent=`${Object.keys(tvPresets).length}`;
    $('preset-recent-count').textContent=`${recentHistory.length}`;
  }
  function reorderPreset(kind,from,to){
    const presets=kind==='tv'?tvPresets:radioPresets,keys=Object.keys(presets),a=keys.indexOf(from),b=keys.indexOf(to);
    if(a<0||b<0||a===b)return;
    keys.splice(a,1);keys.splice(b,0,from);
    const reordered=Object.fromEntries(keys.map(key=>[key,presets[key]]));
    if(!saveStore(kind==='tv'?TV_STORE:RADIO_STORE,reordered)){renderPresets();return;}
    if(kind==='tv'){tvPresets=reordered;saveStore(TV_ORDER_STORE,keys);renderTVRail();}
    else{radioPresets=reordered;renderRadioShortcuts();}
    renderPresets();renderExplore();
  }
  let cancelPresetDrag;
  function enablePresetDragging(target,rows){
    const kind=presetMode,key=station=>presetKey(kind,station);
    target.querySelectorAll('.preset-drag-handle').forEach(handle=>{
      const card=handle.closest('[data-preset-index]');let drag=null,scrollFrame=0,lastScrollTime=0;
      function updateDropTarget(){
        const cards=[...target.querySelectorAll('[data-preset-index]')];
        // Use layout slots, not moving animation boxes, for insertion decisions.
        const grid=target.getBoundingClientRect();
        const slots=cards.filter(item=>item!==card).map(item=>({item,left:grid.left+item.offsetLeft-target.scrollLeft,top:grid.top+item.offsetTop-target.scrollTop,width:item.offsetWidth,height:item.offsetHeight}));
        let over=null;
        const topEdge=Math.max(0,grid.top)+Math.min(90,target.clientHeight*.25),bottomEdge=Math.min(innerHeight,grid.bottom)-Math.min(90,target.clientHeight*.25);
        const visible=slots.filter(slot=>slot.top+slot.height>Math.max(0,grid.top)&&slot.top<Math.min(innerHeight,grid.bottom));
        if(drag.y<topEdge&&visible.length)over=visible[0].item;
        else if(drag.y>bottomEdge&&visible.length)over=visible[visible.length-1].item;
        else if(slots.length){
          slots.sort((a,b)=>Math.hypot(a.left+a.width/2-drag.x,a.top+a.height/2-drag.y)-Math.hypot(b.left+b.width/2-drag.x,b.top+b.height/2-drag.y));
          over=slots[0].item;
          const own={left:grid.left+card.offsetLeft-target.scrollLeft,top:grid.top+card.offsetTop-target.scrollTop};
          if(drag.x>=own.left&&drag.x<=own.left+card.offsetWidth&&drag.y>=own.top&&drag.y<=own.top+card.offsetHeight)return;
        }
        if(!over||over===card)return;
        const from=cards.indexOf(card),to=cards.indexOf(over);
        if(from===to||(drag.y<topEdge&&to>from)||(drag.y>bottomEdge&&to<from))return;
        const before=new Map(cards.map(item=>[item,item.getBoundingClientRect()]));
        target.insertBefore(card,from<to?over.nextSibling:over);
        if(!matchMedia('(prefers-reduced-motion: reduce)').matches)for(const item of cards){
          const old=before.get(item),now=item.getBoundingClientRect();
          if(old.left!==now.left||old.top!==now.top){item.getAnimations().forEach(animation=>animation.cancel());item.animate([{transform:`translate(${old.left-now.left}px,${old.top-now.top}px)`},{transform:'translate(0,0)'}],{duration:180,easing:'ease-out'});}
        }
      }
      function autoScroll(time){
        if(!drag||!handle.isConnected){cancelAnimationFrame(scrollFrame);return;}
        const delta=Math.min(32,lastScrollTime?time-lastScrollTime:16);lastScrollTime=time;
        const bounds=target.getBoundingClientRect(),top=Math.max(0,bounds.top),bottom=Math.min(innerHeight,bounds.bottom),edge=Math.min(90,(bottom-top)*.25);
        const speed=drag.y<top+edge?-Math.max(.25,Math.min(1,(top+edge-drag.y)/edge)):drag.y>bottom-edge?Math.max(.25,Math.min(1,(drag.y-bottom+edge)/edge)):0;
        if(speed){let scroller=target;
          while(scroller&&!(scroller.scrollHeight>scroller.clientHeight&&/auto|scroll/.test(getComputedStyle(scroller).overflowY)))scroller=scroller.parentElement;
          const amount=speed*delta*.85;
          if(!scroller||scroller===document.body||scroller===document.documentElement||scroller===document.scrollingElement){
            const root=document.scrollingElement||document.documentElement;
            root.scrollTop+=amount;
            // Some mobile layouts scroll the body rather than the document root.
            if(document.body!==root&&document.body.scrollHeight>document.body.clientHeight)document.body.scrollTop+=amount;
          }else scroller.scrollTop+=amount;
        }
        updateDropTarget();scrollFrame=requestAnimationFrame(autoScroll);
      }
      handle.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();});
      function move(event){
        if(!drag||drag.id!==event.pointerId)return;
        event.preventDefault();event.stopPropagation();drag.x=event.clientX;drag.y=event.clientY;
        if(!drag.moved&&Math.hypot(drag.x-drag.startX,drag.y-drag.startY)>7){
          drag.moved=true;card.classList.add('preset-dragging');card.style.pointerEvents='none';
          const rect=card.getBoundingClientRect();drag.ghost=card.cloneNode(true);drag.ghost.removeAttribute('data-preset-index');drag.ghost.className='preset-card preset-drag-preview';
          drag.ghost.inert=true;drag.ghost.setAttribute('aria-hidden','true');
          Object.assign(drag.ghost.style,{position:'fixed',width:rect.width+'px',height:rect.height+'px',pointerEvents:'none',zIndex:'20000'});document.body.append(drag.ghost);
          lastScrollTime=0;scrollFrame=requestAnimationFrame(autoScroll);
        }
        if(drag.ghost){drag.ghost.style.left=(drag.x-drag.offsetX)+'px';drag.ghost.style.top=(drag.y-drag.offsetY)+'px';}
        if(drag.moved)updateDropTarget();
      }
      function cleanUp(){
        drag.ghost?.remove();drag=null;cancelAnimationFrame(scrollFrame);lastScrollTime=0;
        window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',finish);
        window.removeEventListener('blur',abandon);cancelPresetDrag=null;
        card.classList.remove('preset-dragging');card.style.removeProperty('pointer-events');
      }
      function abandon(){if(drag?.moved)renderPresets();else if(drag)cleanUp();}
      function finish(event){
        if(!drag||event.pointerId!==drag.id)return;
        event.stopPropagation();const moved=drag.moved,from=Number(card.dataset.presetIndex),to=[...target.querySelectorAll('[data-preset-index]')].indexOf(card);
        cleanUp();
        if(moved){target.dataset.suppressTapUntil=String(performance.now()+500);if(event.type==='pointerup'&&rows[to]&&to!==from)reorderPreset(kind,key(rows[from]),key(rows[to]));else renderPresets();}
      }
      handle.addEventListener('pointerdown',event=>{
        if(event.button!==0||cancelPresetDrag||event.target.closest('[data-preset-star]'))return;
        event.stopPropagation();const rect=card.getBoundingClientRect();
        drag={id:event.pointerId,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,offsetX:event.clientX-rect.left,offsetY:event.clientY-rect.top,moved:false};
        cancelPresetDrag=cleanUp;window.addEventListener('blur',abandon);
        window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',finish);
      });
      handle.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();event.stopPropagation();const from=Number(card.dataset.presetIndex),to=from+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1);if(rows[to]){reorderPreset(kind,key(rows[from]),key(rows[to]));target.querySelector(`[data-preset-index="${to}"] .preset-drag-handle`)?.focus();}});
    });
  }
  function playFromCollection(kind,station){
    if(isDeadHidden(kind,station)){notify('This channel is hidden. Restore hidden channels in Settings to tune it.');return;}
    setScreen(kind==='tv'?'tv-screen':'radio-screen',false,false);
    if(kind==='tv')playTV(station);else playRadio(station);
  }
  function renderRecentCards(target){
    target.innerHTML=recentHistory.map((entry,index)=>`<button class="preset-card recent-history-card" type="button" data-recent-index="${index}"><span class="channel-number">${entry.kind==='tv'?'TV':'RADIO'} · ${new Date(entry.playedAt||Date.now()).toLocaleDateString()}</span><span class="preset-logo">${entry.logo?`<img loading="lazy" decoding="async" src="${safe(entry.logo)}" alt="">`:safe(initialsFor(entry.name))}</span><b>${safe(entry.name)}</b><small>${safe(entry.country||'Recently played')}</small></button>`).join('')||'<div class="empty-note">Your radio and TV history will appear here.</div>';
    target.querySelectorAll('[data-recent-index]').forEach(button=>{
      const entry=recentHistory[Number(button.dataset.recentIndex)];
      if(!entry)return;
      const library=entry.kind==='tv'?tvs:radios;
      const station=[...listFor(entry.kind),...library].find(row=>presetKey(entry.kind,row)===entry.key||row.url===entry.url)
        ||{...entry,stationuuid:entry.kind==='radio'?entry.key:undefined};
      if(entry.kind==='radio')decorateRadioCard(button,station);
      button.addEventListener('click',()=>playFromCollection(entry.kind,station));
    });
  }
  function renderPresets(){
    window.dispatchEvent(new Event('retro-favorites-changed'));
    cancelPresetDrag?.();
    updatePresetCounts();
    const target=$('preset-grid'),kind=presetMode,recent=kind==='recent';
    $('clear-recent').hidden=!recent;
    $('preset-footnote').firstChild.textContent=recent?'Last 30 channels on this device. ':'Tap a favorite to play · Drag to reorder · Tap ♥ to remove. ';
    $('preset-priority-control').hidden=true;
    target.classList.toggle('recent-history-grid',recent);
    if(target.dataset.renderedPresetMode!==kind){
      target.scrollTop=0;
      target.dataset.renderedPresetMode=kind;
    }
    if(recent){
      $('preset-selection-label').textContent='RECENTLY PLAYED';
      renderRecentCards(target);
      return;
    }
    const rows=listFor(kind),activeKey=presetKey(kind,kind==='tv'?tvCurrent():radioCurrent());
    if(kind==='tv'&&!rows.some(item=>item.url===selectedTVPresetKey))selectedTVPresetKey=rows.some(item=>item.url===activeKey)?activeKey:rows[0]?.url||null;
    const selected=kind==='tv'?rows.find(item=>item.url===selectedTVPresetKey):rows.find(item=>stationKey(item)===activeKey);
    $('preset-selection-label').textContent=selected?`SELECTED · ${selected.name}`:kind==='tv'?'SELECT A TV CHANNEL':'SELECT A RADIO STATION';
    target.innerHTML=rows.map((station,index)=>{
      const title=station.name||'Untitled station',logo=stationLogo(station),key=presetKey(kind,station);
      const active=activeKey===key?'active':'',selected=kind==='tv'&&selectedTVPresetKey===key?'priority-selected':'';
      const detail=isDeadHidden(kind,station)?'Hidden from tuner':station.country||station.group||'Live';
      return `<article class="preset-card ${active} ${selected}" tabindex="0" role="button" data-preset-index="${index}"><button type="button" class="preset-drag-handle" aria-label="Move ${safe(title)} with arrow keys or drag" title="Drag to reorder">⠿</button><button class="preset-star" type="button" data-preset-star="${safe(key)}" aria-label="Remove ${safe(title)} from favorites">♥</button><span class="preset-logo">${logo?`<img loading="lazy" decoding="async" src="${safe(logo)}" alt="">`:safe(initialsFor(title))}</span><b>${safe(title)}</b><small>${safe(detail)}</small></article>`;
    }).join('')||'<div class="empty-note">No favorites in this section yet. Save channels from Search.</div>';
    target.querySelectorAll('[data-preset-index]').forEach(card=>{
      const station=rows[Number(card.dataset.presetIndex)];
      if(kind==='radio')decorateRadioCard(card,station);
      let lastTap=0;
      const play=()=>{
        if(kind==='tv')selectedTVPresetKey=station.url;
        playFromCollection(kind,station);
      };
      card.addEventListener('click',event=>{
        if(performance.now()<Number(target.dataset.suppressTapUntil||0)||event.target.closest('[data-preset-star],.preset-drag-handle'))return;
        const now=performance.now();
        if(lastTap&&now-lastTap<400){lastTap=0;play();return;}
        lastTap=now;
        target.querySelectorAll('.preset-tap-selected').forEach(item=>item.classList.remove('preset-tap-selected'));
        card.classList.add('preset-tap-selected');
      });
      card.addEventListener('keydown',event=>{
        if((event.key==='Enter'||event.key===' ')&&event.target===card){event.preventDefault();event.stopPropagation();play();}
      });
      card.querySelector('[data-preset-star]').addEventListener('click',event=>{
        event.stopPropagation();
        togglePreset(kind,station);
        const cards=target.querySelectorAll('[data-preset-index]');
        (cards[Math.min(Number(card.dataset.presetIndex),cards.length-1)]?.querySelector('[data-preset-star]')||document.querySelector('[data-preset-mode].selected'))?.focus({preventScroll:true});
      });
    });
    enablePresetDragging(target,rows);
  }
  function stationGenre(station,kind){
    const identity=String(station.name||'')+' '+String(station.channelName||'')+' '+String(station.group||'');
    if(kind==='tv'&&/\bdoordarshan\b|\bdd(?:\s|[-_]|$)/i.test(identity))return 'DD (Doordarshan)';
    if(kind==='radio'&&/akashvani|akashwani|all india radio|^air(?:\s|[-_]|$)/i.test(identity))return 'Akashvani';

    const raw=kind==='tv'?(station.group||station.genre||station.category||station.tags):(station.genre||station.tags||station.group);
    const value=Array.isArray(raw)?raw.join(','):String(raw||'');
    if(value.trim())return value.split(/[;,|]/).map(part=>part.trim()).filter(Boolean)[0]||'Other';
    const name=String(station.name||'').toLowerCase();
    if(/news|bbc|cnn|ndtv|reuters|talk/.test(name))return 'News';
    if(/devotional|bhakti|spiritual|religious/.test(name))return 'Devotional';
    if(/music|fm|hits|retro|songs|radio/.test(name))return 'Music';
    if(/movie|cinema|film/.test(name))return 'Movies';
    return 'Other';
  }
  function cleanLanguageName(value){return String(value||'').trim().replace(/\s+/g,' ').replace(/\b\p{L}/gu,letter=>letter.toLocaleUpperCase());}
  function rememberLanguage(name,code=''){
    const label=cleanLanguageName(name);if(!label)return;
    if(!languageCatalog.some(item=>item.toLocaleLowerCase()===label.toLocaleLowerCase()))languageCatalog.push(label);
    languageNameByKey.set(label.toLocaleLowerCase(),label);
    if(code)for(const alias of String(code).split(/[;,|\s]+/).filter(Boolean))languageNameByCode.set(alias.toLowerCase(),label);
  }
  function languageFromCode(code){
    const key=String(code||'').trim().toLowerCase();if(!key)return '';
    if(languageNameByCode.has(key))return languageNameByCode.get(key);
    try{const label=new Intl.DisplayNames(['en'],{type:'language'}).of(key);if(label&&label.toLowerCase()!==key.toLowerCase())return cleanLanguageName(label);}catch{}
    return '';
  }
  function languageNames(station){
    const found=new Set(),fields=[station.language,station.languages,station.languagecodes];
    for(const field of fields){for(const raw of (Array.isArray(field)?field:[field])){
      for(const part of String(raw||'').split(/[;,|]+/).map(value=>value.trim()).filter(Boolean)){
        const key=part.toLowerCase(),known=languageNameByKey.get(key)||languageFromCode(key);
        if(known){rememberLanguage(known,key);found.add(known);}
        else if(/^[a-z]{2,3}$/i.test(part)){continue;}
        else{const label=cleanLanguageName(part);rememberLanguage(label);found.add(label);}
      }
    }}
    const name=String(station.name||station.channelName||'').toLocaleLowerCase();
    for(const language of languageCatalog)if(name.includes(language.toLocaleLowerCase()))found.add(language);
    if(!found.size&&/\b(bbc|cnn|dw english|france 24|al jazeera english|abc news|reuters|nhk world|trt world|arirang|ndtv|aaj tak|dd news)\b/i.test(name))found.add('English');
    return [...found];
  }
  async function loadLanguageCatalog(){
    const jobs=[fetchJson('https://iptv-org.github.io/api/languages.json'),fetchJson('https://de1.api.radio-browser.info/json/languages?order=name&limit=5000')];
    const results=await Promise.allSettled(jobs);
    for(const result of results)if(result.status==='fulfilled'&&Array.isArray(result.value))for(const item of result.value){
      const name=item.name||item.language||item.english_name||'';const code=item.code||item.iso_639||item.iso639_3||item.iso639||'';if(name)rememberLanguage(name,code);
    }
    populateExploreFilters();
  }
  function populateExploreFilters(){
    const source=browserKind==='tv'?tvs:radios,store=browserKind==='tv'?tvPresets:radioPresets,rows=[...source,...Object.values(store)];
    const countries=browserSource==='online'&&onlineCountries.length?onlineCountries:[...new Set(rows.map(s=>String(s.country||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    const genres=[...new Set([...(browserSource==='online'&&onlineGenres.length?onlineGenres:rows.map(s=>stationGenre(s,browserKind))),browserKind==='tv'?'DD (Doordarshan)':'Akashvani'])].sort((a,b)=>a.localeCompare(b));
    const allStationRows=[...radios,...tvs,...Object.values(radioPresets),...Object.values(tvPresets),...onlineRows,...(onlineTVCache||[])];
    const languages=['English',...['Tamil','Hindi','Malayalam','Telugu','Kannada','Bengali','Marathi','Gujarati','Punjabi','Urdu','Odia','Assamese','Sinhala','Nepali'].sort((a,b)=>a.localeCompare(b,'en'))];
    const replace=(id,items,label)=>{const select=$(id),old=select.value;select.innerHTML=`<option value="all">All ${label}</option>`+items.map(v=>`<option value="${safe(v)}">${safe(v)}</option>`).join('');if(items.includes(old))select.value=old;};
    replace('explore-country',countries,'countries');replace('explore-genre',genres,'genres');replace('explore-language',languages,'languages');
    $('explore-mode-label').textContent=browserKind==='tv'?'TV CHANNELS':'RADIO STATIONS';
  }
  async function fetchJson(url){const response=await fetch(url,{headers:{'Accept':'application/json'}});if(!response.ok)throw new Error(`HTTP ${response.status}`);return response.json();}
  async function loadOnlineFilters(){
    $('discovery-status').textContent='Loading online filters…';
    try{
      if(browserKind==='radio'){
        const base='https://de1.api.radio-browser.info/json';
        const [countries,tags]=await Promise.all([fetchJson(`${base}/countries?order=stationcount&reverse=true&limit=250`),fetchJson(`${base}/tags?order=stationcount&reverse=true&limit=150`)]);
        onlineCountries=countries.map(x=>x.name).filter(Boolean).sort((a,b)=>a.localeCompare(b));onlineGenres=tags.map(x=>x.name).filter(Boolean).sort((a,b)=>a.localeCompare(b));
      }else{
        const base='https://iptv-org.github.io/api';
        const [countries,categories]=await Promise.all([fetchJson(`${base}/countries.json`),fetchJson(`${base}/categories.json`)]);
        onlineCountries=countries.map(x=>x.name).filter(Boolean).sort((a,b)=>a.localeCompare(b));onlineGenres=categories.map(x=>x.name).filter(Boolean).sort((a,b)=>a.localeCompare(b));
      }
      populateExploreFilters();$('discovery-status').textContent='Ready. Enter a name, then tap Search.';
    }catch(error){$('discovery-status').textContent='Online filters unavailable; you can still search by name.';}
  }
  async function discoverOnline(loadMore=false){
    const query=$('explore-search').value.trim(),country=$('explore-country').value,genre=$('explore-genre').value,language=$('explore-language').value;
    if(!loadMore){onlineRows=[];onlineOffset=0;onlineVisibleLimit=100;onlineHasMore=false;}onlineSearchDone=true;
    $('discovery-status').textContent='Searching the online catalog…';$('explore-results').innerHTML='<div class="loading-note">Loading channels…</div>';
    try{
      if(browserKind==='radio'){
        const hosts=['https://de1.api.radio-browser.info/json','https://nl1.api.radio-browser.info/json'];let found=null,lastError;
        for(const base of hosts){try{const params=new URLSearchParams({limit:'100',offset:String(onlineOffset),order:'clickcount',reverse:'true',hidebroken:'true'});if(query)params.set('name',query);if(country!=='all')params.set('country',country);if(genre==='Akashvani'){if(!query)params.set('name','Akashvani');}else if(genre!=='all')params.set('tag',genre);if(language!=='all')params.set('language',language.toLowerCase());found=await fetchJson(`${base}/stations/search?${params}`);break;}catch(error){lastError=error;}}
        if(!found)throw lastError||new Error('Radio catalog unavailable');
        const next=found.filter(s=>s.url_resolved||s.url).map(s=>({...s,_kind:'radio',url:s.url_resolved||s.url}));
        onlineRows=loadMore?[...onlineRows,...next.filter(x=>!onlineRows.some(y=>stationKey(y)===stationKey(x)))]:next;onlineHasMore=next.length===100;onlineOffset+=next.length;
      }else{
        if(!onlineTVCache){
          const base='https://iptv-org.github.io/api';$('discovery-status').textContent='Loading the global TV directory (first use may take a little longer)…';
          const [channels,streams,logos,countries,categories]=await Promise.all([fetchJson(`${base}/channels.json`),fetchJson(`${base}/streams.json`),fetchJson(`${base}/logos.json`),fetchJson(`${base}/countries.json`),fetchJson(`${base}/categories.json`)]);
          const countryNames=new Map(countries.map(c=>[c.code,c.name])),categoryNames=new Map(categories.map(c=>[c.id,c.name])),channelMap=new Map(channels.map(c=>[c.id,c])),logoMap=new Map();
          for(const logo of logos)if(logo.in_use&&!logoMap.has(logo.channel))logoMap.set(logo.channel,logo.url);
          onlineTVCache=streams.filter(s=>s.url&&s.channel&&channelMap.has(s.channel)).map(s=>{const c=channelMap.get(s.channel),genres=(c.categories||[]).map(id=>categoryNames.get(id)||id),languages=c.languages||[];return{name:s.title||c.name,channelName:c.name,alt_names:c.alt_names||[],country:countryNames.get(c.country)||c.country||'Unknown',countryCode:c.country||'',languages,language:languages.join(','),group:genres.join(', ')||'Other',tags:genres.join(','),genre:genres[0]||'Other',logo:logoMap.get(c.id)||'',url:s.url,quality:s.quality||'',labels:s.labels||[],_kind:'tv',is_nsfw:c.is_nsfw};}).filter(s=>!s.is_nsfw&&!/nsfw|adult/i.test(s.labels.join(' ')));
        }
        let filtered=onlineTVCache;
        if(query){const q=query.toLowerCase();filtered=filtered.filter(s=>`${s.name} ${s.channelName} ${s.alt_names.join(' ')} ${s.group} ${s.country}`.toLowerCase().includes(q));}
        if(country!=='all')filtered=filtered.filter(s=>s.country===country);
        if(genre!=='all')filtered=filtered.filter(s=>stationGenre(s,'tv')===genre||s.group.split(', ').includes(genre)||s.genre===genre);
        const collator=new Intl.Collator(undefined,{sensitivity:'base'});filtered.sort((a,b)=>collator.compare(a.country,b.country)||collator.compare(a.group,b.group)||collator.compare(a.name,b.name));
        onlineRows=filtered;onlineHasMore=filtered.length>100;
      }
      populateExploreFilters();$('discovery-status').textContent=`${onlineRows.length}${onlineHasMore?'+' : ''} online ${browserKind==='tv'?'TV streams':'radio stations'} found.`;renderExplore();
    }catch(error){onlineRows=[];$('discovery-status').textContent='Could not reach the online catalog. Check your connection and try again.';renderExplore();}
  }
  function renderExplore(){
    const q=$('explore-search').value.trim().toLowerCase(),country=$('explore-country').value,genre=$('explore-genre').value,language=$('explore-language').value,sortBy=$('explore-sort').value;
    const source=browserKind==='tv'?tvs:radios,store=browserKind==='tv'?tvPresets:radioPresets;
    const keyOf=s=>browserKind==='tv'?s.url:stationKey(s),merged=new Map(source.map(s=>[keyOf(s),s]));
    for(const item of Object.values(store))if(item&&keyOf(item))merged.set(keyOf(item),item);
    let rows=browserSource==='online'?onlineRows.map(s=>({...s,_kind:browserKind,_genre:stationGenre(s,browserKind),_country:s.country||'Unknown',_languages:languageNames(s)})):[...merged.values()].map(s=>({...s,_kind:browserKind,_genre:stationGenre(s,browserKind),_country:s.country||'Unknown',_languages:languageNames(s)}));
    rows=rows.filter(s=>!isDeadHidden(browserKind,s));
    if(country!=='all')rows=rows.filter(s=>s._country===country);
    if(genre!=='all')rows=rows.filter(s=>[s._genre,...String(s.tags||'').split(/[;,|]/),...String(s.group||'').split(/[;,|]/),...(Array.isArray(s.categories)?s.categories:[])].some(value=>String(value).trim().toLowerCase()===genre.toLowerCase()));
    if(language!=='all')rows=rows.filter(s=>s._languages.includes(language));
    if(q)rows=rows.filter(s=>`${s.name||''} ${s._genre} ${s._country} ${s.tags||''} ${s.language||''} ${s.group||''}`.toLowerCase().includes(q));
    const groupKey=sortBy==='name'?null:sortBy==='country'?'_country':'_genre',collator=new Intl.Collator(undefined,{sensitivity:'base'});
    rows.sort((a,b)=>groupKey?collator.compare(a[groupKey],b[groupKey])||collator.compare(a.name||'',b.name||''):collator.compare(a.name||'',b.name||''));
    const visibleRows=rows;
    const groups=new Map();for(const row of visibleRows){const heading=groupKey?row[groupKey]:'All channels';if(!groups.has(heading))groups.set(heading,[]);groups.get(heading).push(row);}
    const target=$('explore-results');let html='';
    for(const [heading,items] of groups){
      html+=`<h2 class="result-group-title">${safe(heading)} <small>${items.length}</small></h2>`;
      html+=items.map(station=>{
        const logo=stationLogo(station),key=keyOf(station),saved=Object.hasOwn(store,key),title=station.name||'Untitled channel';
        const quality=browserKind==='tv'?(station.quality||'LIVE'):[station.codec,station.bitrate?`${station.bitrate} kbps`:null].filter(Boolean).join(' · ')||'LIVE';
        const image=logo?`<img loading="lazy" decoding="async" src="${safe(logo)}" alt="">`:`<span class="result-icon">${safe(initialsFor(title))}</span>`;
        return `<div class="result-row" data-result-kind="${browserKind}" data-result-key="${safe(key)}"><button class="result-play" type="button">${image}<span class="result-copy"><b>${safe(title)}</b><small>${safe(station._genre)} · ${safe(station._country)}</small></span><small class="result-quality">${safe(quality)}</small></button><button type="button" class="result-star" aria-label="${saved?'Remove':'Save'} ${safe(title)} ${saved?'from':'to'} favorites" aria-pressed="${saved}">${saved?'♥':'♡'}</button></div>`;
      }).join('');
    }
    if(!html&&browserSource==='online')html=`<div class="empty-note">${onlineSearchDone?'No channels match. Try a different name.':'Enter a station or channel name, then tap Search.'}</div>`;
    if(!html&&browserSource==='library')html='<div class="empty-note">No channels match those filters.</div>';
    if(browserSource==='online'&&onlineHasMore&&browserKind==='radio')html+='<button class="load-more-online" id="load-more-online" type="button">LOAD MORE CHANNELS</button>';
    target.innerHTML=html;
    $('browser-summary').textContent=`${rows.length} ${browserKind==='tv'?'TV streams':'radio stations'} · sorted by ${sortBy==='name'?'channel name':sortBy}`;
    const visibleStations=new Map(rows.map(station=>[keyOf(station),station]));
    target.querySelectorAll('[data-result-kind]').forEach(row=>{
      const kind=row.dataset.resultKind,key=row.dataset.resultKey,station=visibleStations.get(key);
      if(kind==='radio')decorateRadioCard(row,station);
      row.querySelector('.result-play').addEventListener('click',()=>playFromCollection(kind,station));
      row.querySelector('.result-star').addEventListener('click',()=>{
        togglePreset(kind,station);
        [...target.querySelectorAll('[data-result-key]')].find(item=>item.dataset.resultKey===key)?.querySelector('.result-star').focus({preventScroll:true});
      });
    });
    $('load-more-online')?.addEventListener('click',()=>{if(browserKind==='radio')discoverOnline(true);else{onlineVisibleLimit+=100;renderExplore();}});
  }

  document.querySelectorAll('.nav-item[data-screen]').forEach(button=>button.addEventListener('click',()=>setScreen(button.dataset.screen,true)));
  document.querySelector('[data-player-nav]').addEventListener('click',()=>{
    document.querySelector('.nav-item[data-screen="'+lastPlayerScreen+'"]').click();
  });
  document.querySelectorAll('[data-mode-screen]').forEach(button=>button.addEventListener('click',()=>setScreen(button.dataset.modeScreen,true)));
  document.querySelectorAll('[data-console-mode]').forEach(button=>button.addEventListener('click',()=>setScreen(button.dataset.consoleMode+'-screen',true)));
  document.addEventListener('retro-sleep-expired',()=>{
    cancelContinuousRetry('radio');cancelContinuousRetry('tv');
    if(currentRadioSource||radioHls||window.retroRadioMechanism?.pending)stopRadio();
    if(hls||youtubePlayer||youtubeHost||video.src||video.currentSrc)stopTV();
  });
  let pageSwipeStart=null,suppressPresetSwipeClickUntil=0;
  document.addEventListener('click',event=>{if(Date.now()<suppressPresetSwipeClickUntil&&event.target.closest('#presets-screen')){event.preventDefault();event.stopImmediatePropagation();}},true);
  document.querySelectorAll('.screen').forEach(screen=>{
    screen.addEventListener('pointerdown',event=>{
      const onPresets=screen.id==='presets-screen',interactive=event.target.closest('button,input,select,textarea,a,video,.dial-wrap,.tv-rail,.explore-results');
      if(event.pointerType==='mouse'||event.target.closest('.priority-pad,.preset-drag-handle')||(interactive&&!onPresets)||(!onPresets&&event.target.closest('.preset-grid'))){pageSwipeStart=null;return;}
      pageSwipeStart={x:event.clientX,y:event.clientY,id:event.pointerId,screen:screen.id};
    });
    screen.addEventListener('pointerup',event=>{
      const start=pageSwipeStart;pageSwipeStart=null;if(!start||start.id!==event.pointerId||start.screen!==document.querySelector('.screen.active')?.id)return;
      const dx=event.clientX-start.x,dy=event.clientY-start.y;if(Math.abs(dx)>48&&Math.abs(dx)>Math.abs(dy)*1.2){if(start.screen==='presets-screen')suppressPresetSwipeClickUntil=Date.now()+500;stepScreen(dx<0?1:-1);}
    });
    screen.addEventListener('pointercancel',()=>{pageSwipeStart=null;});
  });
  const presetTabs=[...document.querySelectorAll('[data-preset-mode]')];
  for(const button of presetTabs){
    button.setAttribute('aria-pressed',String(button.dataset.presetMode===presetMode));
    button.addEventListener('click',()=>{
      presetMode=button.dataset.presetMode;
      for(const item of presetTabs){item.classList.toggle('selected',item===button);item.setAttribute('aria-pressed',String(item===button));}
      renderPresets();
    });
  }

  document.querySelectorAll('[data-browser-source]').forEach(button=>button.addEventListener('click',()=>{browserSource=button.dataset.browserSource;document.querySelectorAll('[data-browser-source]').forEach(item=>item.classList.toggle('selected',item===button));onlineRows=[];onlineOffset=0;onlineVisibleLimit=100;onlineHasMore=false;onlineSearchDone=false;$('discovery-status').textContent=browserSource==='online'?'Enter a name, then tap Search.':'Type to search your library.';populateExploreFilters();renderExplore();if(browserSource==='online')loadOnlineFilters();}));
  const submitExploreSearch=()=>{if(browserSource==='online')discoverOnline();else renderExplore();};
  $('discover-online').addEventListener('click',submitExploreSearch);
  $('explore-search').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();submitExploreSearch();}});
    $('explore-search').addEventListener('input',renderExplore);$('explore-country').addEventListener('change',()=>browserSource==='online'?discoverOnline():renderExplore());$('explore-genre').addEventListener('change',()=>browserSource==='online'?discoverOnline():renderExplore());$('explore-language').addEventListener('change',()=>{if(browserSource==='online'){onlineVisibleLimit=20;discoverOnline();}else renderExplore();});$('explore-sort').addEventListener('change',renderExplore);
  $('radio-country').addEventListener('change',()=>{renderRadioDisplay();renderPresets();});
  $('tv-country').addEventListener('change',()=>{renderTVRail();renderPresets();});
  $('radio-play').addEventListener('click',toggleRadio);
  $('radio-prev').addEventListener('click',()=>stepRadio(-1));
  $('radio-next').addEventListener('click',()=>stepRadio(1));
  $('radio-star').addEventListener('click',()=>{const station=radioCurrent();if(station)togglePreset('radio',station);});

  $('radio-volume').addEventListener('input',event=>setRadioVolume(event.target.value));
  document.querySelectorAll('[data-radio-volume-action]').forEach(button=>button.addEventListener('click',()=>{const action=button.dataset.radioVolumeAction;if(action==='mute'){audio.muted=!audio.muted;button.classList.toggle('muted',audio.muted);button.setAttribute('aria-label',audio.muted?'Unmute radio':'Mute radio');}else if(action==='up'){audio.muted=false;setRadioVolume(Number($('radio-volume').value)+5);}}));
  $('tv-star').addEventListener('click',()=>{const station=tvCurrent();if(station)togglePreset('tv',station);});
  $('tv-prev').addEventListener('click',()=>stepTV(-1));$('tv-next').addEventListener('click',()=>stepTV(1));$('tv-prev-name').addEventListener('click',()=>stepTV(-1));$('tv-next-name').addEventListener('click',()=>stepTV(1));$('tv-toggle').addEventListener('click',()=>setTVPlayback());
  document.querySelectorAll('[data-remote]').forEach(button=>button.addEventListener('click',()=>{
    const action=button.dataset.remote;
    if(action==='vol-up'||action==='vol-down'){video.muted=false;video.volume=Math.min(1,Math.max(0,video.volume+(action==='vol-up' ? 0.1 : -0.1)));return;}
    if(action==='channel-up'){stepTV(1);return;}if(action==='channel-down'){stepTV(-1);return;}
    if(action==='play-pause'){$('tv-toggle').click();return;}
    if(action==='favorite'){$('tv-star').click();return;}
    if(action==='mute'){video.muted=!video.muted;button.classList.toggle('muted',video.muted);button.setAttribute('aria-label',video.muted?'Unmute':'Mute');return;}
    if(action==='fullscreen'){toggleTVFullscreen();return;}
    if(action==='power')stopTV();
  }));
  $('remote-channel-select').addEventListener('change',event=>{const station=currentRows('tv').find(item=>item.url===event.target.value);if(station)playTV(station);});
  window.addEventListener('resize',()=>requestAnimationFrame(()=>{if(tvFullscreenActive&&fullscreenPosition)positionFullscreenPanel(fullscreenPosition.x,fullscreenPosition.y);}));
  const fullscreenMute=document.querySelector('[data-fullscreen-action="mute"]');
  function syncFullscreenMute(){
    fullscreenMute.setAttribute('aria-label',video.muted?'Unmute':'Mute');
    fullscreenMute.setAttribute('aria-pressed',String(video.muted));
  }
  video.addEventListener('volumechange',syncFullscreenMute);
  syncFullscreenMute();
  document.querySelectorAll('[data-fullscreen-action]').forEach(button=>button.addEventListener('click',async()=>{
    switch(button.dataset.fullscreenAction){
      case 'home':
        await exitTVFullscreen();
        if(!tvScreen.classList.contains('active'))setScreen('tv-screen',false,false);
        document.dispatchEvent(new Event('retro-tv-return'));
        break;
      case 'previous': stepTV(-1);break;
      case 'next': stepTV(1);break;
      case 'play': setTVPlayback();break;
      case 'mute': video.muted=!video.muted;break;
      case 'vol-up':
      case 'vol-down': {
        const delta=button.dataset.fullscreenAction==='vol-up'?.05:-.05;
        video.muted=false;
        video.volume=Math.max(0,Math.min(1,video.volume+delta));
        break;
      }
    }
  }));

  audio.addEventListener('play',()=>{$('equalizer').classList.add('playing');$('radio-art').classList.add('playing');$('radio-play').textContent='Ⅱ';$('radio-play').title='Pause';$('radio-play').setAttribute('aria-label','Pause');drawRadio();});audio.addEventListener('pause',()=>{$('equalizer').classList.remove('playing');$('radio-art').classList.remove('playing');$('radio-play').textContent='▶';$('radio-play').title='Play';$('radio-play').setAttribute('aria-label','Play');drawRadio();});
  audio.addEventListener('playing',()=>{if(currentRadioSource)$('radio-status').textContent='TUNED IN · '+(radioCurrent()?.name||'LIVE RADIO');});
  audio.addEventListener('waiting',()=>{if(currentRadioSource)$('radio-status').textContent='BUFFERING · '+(radioCurrent()?.name||'RADIO');});
  audio.addEventListener('stalled',()=>{if(currentRadioSource)$('radio-status').textContent='STREAM STALLED · WAITING TO RETRY';});
  audio.addEventListener('error',()=>{if(!currentRadioSource)return;const insecure=location.protocol==='https:'&&/^http:\/\//i.test(currentRadioSource);$('radio-status').textContent=insecure?'HTTPS REQUIRED · THIS STREAM USES HTTP':'STREAM COULD NOT LOAD';if(insecure)notify('This station uses an HTTP link, which secure pages block. Use an HTTPS stream.');else console.error('Radio audio error:',audio.error?.code,currentRadioSource);});
  // Volume stays user-controlled until the next station/channel selection.
  video.addEventListener('play',()=>{updateTVPlayLabel(true);$('tv-toggle').textContent='Ⅱ';$('remote-main-play').classList.add('playing');$('tv-display').classList.add('is-playing');$('tv-placeholder').hidden=true;});video.addEventListener('pause',()=>{updateTVPlayLabel(false);$('tv-toggle').textContent='▶';$('remote-main-play').classList.remove('playing');$('tv-display').classList.remove('is-playing');});video.addEventListener('volumechange',()=>{updateTVNumbers();$('tv-display').classList.toggle('is-muted',video.muted);});video.addEventListener('error',()=>{if(video.currentSrc)notify('This TV stream could not be reached.');});
  let promotingVideoFullscreen=false;
  async function onTVFullscreenChange(){
    const element=fullscreenElement();
    // Browsers retaining a native video fullscreen icon must also use our
    // complete shell, otherwise sibling channel/volume/Return controls vanish.
    if(element===video&&!tvFullscreenActive&&!promotingVideoFullscreen){
      promotingVideoFullscreen=true;
      try{
        await leaveNativeTVFullscreen();
        if(!fullscreenElement()&&!tvFullscreenActive)void enterTVFullscreen();
      }finally{promotingVideoFullscreen=false;}
      return;
    }
    if(tvFullscreenActive&&element===tvShell)tvNativeFullscreen=true;
    if(tvFullscreenActive&&tvNativeFullscreen&&element!==tvShell)void exitTVFullscreen();
    else syncTVFullscreenLayout();
  }
  document.addEventListener('fullscreenchange',onTVFullscreenChange);
  document.addEventListener('webkitfullscreenchange',onTVFullscreenChange);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&tvFullscreenActive){event.preventDefault();exitTVFullscreen();}});
  document.addEventListener('keydown',event=>{if(event.target.closest('input,select,textarea,button,video,[contenteditable],.preset-drag-handle'))return;if(event.code==='Space'&&['radio-screen','tv-screen'].includes(document.querySelector('.screen.active')?.id)){event.preventDefault();if(!$('radio-screen').classList.contains('active'))$('tv-toggle').click();else toggleRadio();}});
  // Bluetooth media buttons are delivered through the browser Media Session.
  // Track navigation can be disabled for remotes that send unwanted skip commands.
  const REMOTE_TRACK_STORE='retrotvra.remote-track-buttons.v1';
  let remoteTrackEnabled=true;
  try{remoteTrackEnabled=localStorage.getItem(REMOTE_TRACK_STORE)!=='false';}catch{}
  const remoteTrackSetting=$('remote-track-enabled');
  remoteTrackSetting.checked=remoteTrackEnabled;
  remoteTrackSetting.addEventListener('change',()=>{
    cancelRemotePress();
    remoteTrackEnabled=remoteTrackSetting.checked;
    try{localStorage.setItem(REMOTE_TRACK_STORE,String(remoteTrackEnabled));}catch{}
  });
  const remoteTest=$('remote-test-result');
  let remoteTestCount=0,remoteTestActive=false;
  const remoteTestLog=[];
  const registeredRemoteActions=new Set();
  $('remote-test-start').addEventListener('click',()=>{
    remoteTestCount=0;remoteTestActive=true;remoteTestLog.length=0;
    const count=registeredRemoteActions.size;
    const availability=count?`${count} Media Session handlers available.`:'Keyboard media keys only.';
    remoteTest.textContent=`Build 4.1.65. Waiting for a command. ${availability}`;
  });
  $('settings-dialog').addEventListener('close',()=>{remoteTestActive=false;});
  function showRemoteCommand(source,command){
    if(!remoteTestActive)return;
    const count=++remoteTestCount;
    remoteTestLog.unshift(`${source} · ${command}`);
    if(remoteTestLog.length>8)remoteTestLog.pop();
    remoteTest.textContent=`${count} events received · ${remoteTestLog.join(' | ')}`;
  }
  function logRemoteKey(event){
    if(!remoteTestActive)return;
    showRemoteCommand(event.type,`key=${JSON.stringify(event.key)} keyCode=${event.keyCode} repeat=${Boolean(event.repeat)} prevented=${event.defaultPrevented} screen=${document.querySelector('.screen.active')?.id||'none'}`);
  }
  let remoteMedia=audio;
  const REMOTE_DOUBLE_PRESS_MS=450;
  let remoteClickTimer=null,remoteClickDeadline=0,lastRemoteInput=null;
  let lastHidTransportTime=-Infinity;
  function cancelRemotePress(){
    clearTimeout(remoteClickTimer);
    remoteClickTimer=null;
    remoteClickDeadline=0;
  }
  function remotePlayerActive(){
    return $('radio-screen').classList.contains('active')||$('tv-screen').classList.contains('active');
  }
  function switchRemoteMode(){
    if(!remoteTrackEnabled){showRemoteCommand('Mode switch','Disabled in Settings');return;}
    const screen=document.querySelector('.screen.active')?.id;
    if(screen!=='radio-screen'&&screen!=='tv-screen')return;
    const toRadio=screen==='tv-screen';
    if(tvFullscreenActive)exitTVFullscreen();
    remoteMedia=toRadio?audio:video;
    const rocker=document.querySelector(
      '#'+screen+' .orange-rocker[data-console-mode="'+(toRadio?'radio':'tv')+'"]'
    );
    if(!rocker){showRemoteCommand('Mode switch','Rocker missing on '+screen);return;}
    rocker.click();
    showRemoteCommand('Mode switch',screen+' → '+document.querySelector('.screen.active')?.id);
    syncRemoteMedia();
  }
  function remotePlayback(action){
    if(!remotePlayerActive())return;
    if(lastPlayerScreen==='tv-screen'){setTVPlayback(action);return;}
    if(action==='pause'){
      if(radioRecovery.connecting&&audio.paused){stopRadio();return;}
      if(window.retroRadioMechanism?.pending){toggleRadio();return;}
      radioRecovery.stop();audio.pause();
    }else if(audio.paused){
      if(audio.src||audio.currentSrc)startRadioAudio().catch(()=>notify('Tap Play in the app to resume the radio.'));
      else if(!radioHls)toggleRadio();
    }
  }
  function remotePlayPause(source,action){
    if(!remotePlayerActive())return;
    if(isDuplicateRemoteCommand(source,'transport'))return;
    const now=performance.now();
    if(remoteTrackEnabled&&remoteClickTimer!==null&&now<=remoteClickDeadline){
      cancelRemotePress();
      switchRemoteMode();
      return;
    }
    cancelRemotePress();
    if(action==='toggle'){
      const playing=lastPlayerScreen==='tv-screen'
        ?(youtubePlayer?.getPlayerState?youtubePlayer.getPlayerState()===1:!video.paused||tvRecovery.connecting)
        :!audio.paused||radioRecovery.connecting||window.retroRadioMechanism?.pending;
      action=playing?'pause':'play';
    }
    if(!remoteTrackEnabled){remotePlayback(action);return;}
    // Resume on the original event so the browser can use its activation.
    // Wait to pause so a second press can still reach the active Media Session.
    if(action==='play')remotePlayback('play');
    remoteClickDeadline=now+REMOTE_DOUBLE_PRESS_MS;
    showRemoteCommand('Play/Pause',remoteTrackEnabled?'First press · waiting for second press':'Playback only');
    remoteClickTimer=setTimeout(()=>{
      remoteClickTimer=null;
      if(action==='pause')remotePlayback('pause');
    },REMOTE_DOUBLE_PRESS_MS);
  }
  document.addEventListener('retro-mode-changing',event=>{
    if(event.detail.screenId!==event.detail.previous)cancelRemotePress();
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelRemotePress();});
  function isDuplicateRemoteCommand(source,command){
    const time=performance.now();
    // A single press may arrive through both keyboard input and Media Session.
    if(lastRemoteInput?.command===command&&lastRemoteInput.source!==source&&time-lastRemoteInput.time<50)return true;
    lastRemoteInput={source,command,time};
    return false;
  }
  function stepRadio(direction){
    const rows=recoveryRows('radio');
    if(!rows.length)return;
    let index=rows.findIndex(station=>stationKey(station)===stationKey(radioCurrent()));
    if(index<0)index=direction>0?-1:0;
    index=(index+direction+rows.length)%rows.length;
    return playRadio(rows[index],false,direction);
  }
  function stepActiveChannel(direction,source){
    const radioActive=$('radio-screen').classList.contains('active');
    const tvActive=$('tv-screen').classList.contains('active');
    if(!radioActive&&!tvActive)return;
    if((tvActive&&!remoteTrackEnabled)||isDuplicateRemoteCommand(source,direction))return;
    cancelRemotePress();
    const selected=tvActive?stepTV(direction):stepRadio(direction);
    const station=tvActive?tvCurrent():radioCurrent();
    showRemoteCommand(tvActive?'TV':'Radio',selected?'Selected '+(station?.name||'station'):'No stations in active list');
  }
  function remoteStop(){
    if(!remotePlayerActive())return;
    cancelRemotePress();if(lastPlayerScreen==='tv-screen')stopTV();else stopRadio();}
  function syncRemoteMedia(){
    if(!navigator.mediaSession)return;
    const isRadio=remoteMedia===audio;
    const station=isRadio?radioCurrent():tvCurrent();
    const playing=!remoteMedia.paused||(isRadio&&radioRecovery.connecting);
    try{
      if(typeof MediaMetadata!=='undefined')navigator.mediaSession.metadata=new MediaMetadata({
        title:station?.name||'COOLmagRaTv',
        artist:isRadio?'COOLmag RetroRADtv':'Live TV',
        album:isRadio?'Live Radio':'COOLmagRaTv'
      });
    }catch{}
    try{navigator.mediaSession.playbackState=playing?'playing':'paused';}catch{}
    // Clear stale position data while a live source has no finite duration.
    if(isRadio&&!Number.isFinite(audio.duration)){
      try{navigator.mediaSession.setPositionState?.();}catch{}
    }
    if(isRadio&&playing)registerRemoteTrackActions();
  }
  for(const media of [audio,video]){
    media.addEventListener('play',()=>{remoteMedia=media;syncRemoteMedia();});
    media.addEventListener('pause',()=>{if(remoteMedia===media)syncRemoteMedia();});
  }
  audio.addEventListener('playing',()=>{
    if(!$('radio-screen').classList.contains('active'))return;
    remoteMedia=audio;
    syncRemoteMedia();
  });
  function mediaSessionTransport(action){
    // Native delivery of the same HID press can arrive after the keyboard callback.
    if(performance.now()-lastHidTransportTime<600){
      showRemoteCommand('Media Session','Ignored duplicate HID '+action);
      return;
    }
    remotePlayPause('session',action);
  }
  function registerRemoteAction(action,handler){
    if(!navigator.mediaSession?.setActionHandler)return;
    try{
      navigator.mediaSession.setActionHandler(action,()=>{
        showRemoteCommand('Media Session',action);
        handler();
      });
      registeredRemoteActions.add(action);
    }catch{}
  }
  const previousRemoteTrack=()=>stepActiveChannel(-1,'session'),nextRemoteTrack=()=>stepActiveChannel(1,'session');
  function registerRemoteTrackActions(){
    registerRemoteAction('previoustrack',previousRemoteTrack);
    registerRemoteAction('nexttrack',nextRemoteTrack);
    registerRemoteAction('seekbackward',previousRemoteTrack);
    registerRemoteAction('seekforward',nextRemoteTrack);
  }
  registerRemoteTrackActions();
  registerRemoteAction('play',()=>mediaSessionTransport('play'));
  registerRemoteAction('pause',()=>mediaSessionTransport('pause'));
  registerRemoteAction('stop',remoteStop);
  const remoteKeyDirections=new Map([
    ['MediaTrackNext',1],['MediaTrackPrevious',-1],['MediaFastForward',1],['MediaRewind',-1],
    ['ChannelUp',1],['ChannelDown',-1],['PageDown',1],['PageUp',-1],['ArrowRight',1],['ArrowLeft',-1],
    ['BrowserForward',1],['BrowserBack',-1]
  ]);
  const remoteKeys=new Map([
    ['MediaPlay',()=>remotePlayPause('key','play')],['MediaPause',()=>remotePlayPause('key','pause')],
    ['MediaStop',remoteStop]
  ]);
  // Preserve the Windows media codes and the aliases from the older TV player.
  const legacyRemoteKeys=new Map([
    ['Play','MediaPlay'],['Pause','MediaPause'],
    [33,'PageUp'],[34,'PageDown'],[37,'ArrowLeft'],[39,'ArrowRight'],[166,'BrowserBack'],[167,'BrowserForward'],
    [19,'MediaPause'],[176,'MediaTrackNext'],[177,'MediaTrackPrevious'],[178,'MediaStop'],[179,'MediaPlayPause'],
    [415,'MediaPlay'],[427,'MediaTrackNext'],[428,'MediaTrackPrevious']
  ]);
  window.addEventListener('keyup',logRemoteKey,true);
  function handleRemoteKeydown(event){
    logRemoteKey(event);
    if(event.key==='MediaPlayPause'||event.keyCode===179){
      if(!event.repeat){
        lastHidTransportTime=performance.now();
        remotePlayPause('key','toggle');
      }
      return;
    }
    if(!remotePlayerActive())return;
    const knownKey=key=>remoteKeys.has(key)||remoteKeyDirections.has(key);
    const mediaKey=knownKey(event.key)?event.key:
      legacyRemoteKeys.get(event.key)||legacyRemoteKeys.get(event.keyCode||event.which);
    const direction=remoteKeyDirections.get(mediaKey);
    const control=remoteKeys.get(mediaKey);
    if(!direction&&!control)return;
    // The rotary dial focuses a range input; dedicated media keys still control playback.
    const dedicatedMediaKey=mediaKey.startsWith('Media');
    if(!dedicatedMediaKey&&(event.defaultPrevented||event.repeat))return;
    if(!dedicatedMediaKey&&event.target.closest?.('input,select,textarea,[contenteditable]'))return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if(direction)stepActiveChannel(direction,'key');
    else control();
  }
  window.addEventListener('keydown',handleRemoteKeydown,true);
  video.volume=0.20;updateTVNumbers();
  // Each launch starts at 30%; controls remain adjustable during the session.
  setRadioVolume(20);
  let pendingInstallPrompt=window.retroDeferredInstallPrompt||null,installBusy=false;const installButton=$('install-app'),installedModes=['standalone','minimal-ui','fullscreen','window-controls-overlay'].map(mode=>window.matchMedia(`(display-mode: ${mode})`));
  const installedBefore=()=>{try{return localStorage.getItem('retrotvra.installed.v1')==='true';}catch{return false;}};
  const isInstalledApp=()=>Boolean(navigator.standalone)||installedModes.some(query=>query.matches)||installedBefore();
  const updateInstallButton=()=>{if(isInstalledApp()){installButton.hidden=true;pendingInstallPrompt=null;}else installButton.hidden=false;};
  updateInstallButton();installedModes.forEach(query=>query.addEventListener?.('change',updateInstallButton));
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();const splashInstall=$('splash-install');if(splashInstall)splashInstall.textContent='INSTALL shortcut';try{localStorage.removeItem('retrotvra.installed.v1');}catch{}pendingInstallPrompt=event;if(!installedModes.some(query=>query.matches)&&!navigator.standalone){installButton.hidden=false;installButton.classList.add('install-ready');}});
  window.addEventListener('appinstalled',()=>{window.retroDeferredInstallPrompt=null;const splashInstall=$('splash-install');if(splashInstall){splashInstall.textContent='Installed';splashInstall.disabled=true;}pendingInstallPrompt=null;installButton.classList.remove('install-ready');installButton.hidden=true;try{localStorage.setItem('retrotvra.installed.v1','true');}catch{}notify('COOLmagRaTv added to your home screen.');});
  installButton.addEventListener('click',async()=>{
    if(installBusy)return;
    if(installedModes.some(query=>query.matches)||navigator.standalone){notify('COOLmagRaTv is already installed.');return;}
    const prompt=pendingInstallPrompt||window.retroDeferredInstallPrompt;
    if(prompt){
      installBusy=true;pendingInstallPrompt=null;window.retroDeferredInstallPrompt=null;
      try{
        await prompt.prompt();
        const choice=await prompt.userChoice;
        installButton.classList.remove('install-ready');
        if(choice.outcome==='accepted'){
          const splashInstall=$('splash-install');if(splashInstall)splashInstall.textContent='Installing?';
        }
      }catch{notify('The install prompt could not open. Please try again.');}
      finally{installBusy=false;}
      return;
    }
    if(location.protocol==='file:'||!window.isSecureContext){notify('Open the app using its HTTPS website or localhost to install it.');return;}
    if(/iphone|ipad|ipod/i.test(navigator.userAgent)){notify('In Safari, tap Share, then Add to Home Screen.');return;}
    if('onbeforeinstallprompt' in window){
      const splashInstall=$('splash-install');
      if(splashInstall){splashInstall.textContent='Preparing install?';setTimeout(()=>{if(splashInstall.isConnected&&splashInstall.textContent==='Preparing install?')splashInstall.textContent='INSTALL shortcut';},2500);}
      notify('The browser has not made installation available yet. If this app is already installed, open its shortcut; otherwise try Install again shortly.');
      return;
    }
    notify('This browser does not offer an in-page install prompt. Use its Add to Home Screen option.');
  });
  if('serviceWorker' in navigator&&window.isSecureContext){
    const localTest=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
    if(localTest){
      // Server testing must use disk files, never an installed offline copy.
      navigator.serviceWorker.getRegistration('./').then(async registration=>{
        if(!registration)return;
        await registration.unregister();
        if(navigator.serviceWorker.controller){
          const url=new URL(location.href);
          if(url.searchParams.get('local-build')!=='4.1.65'){
            url.searchParams.set('local-build','4.1.65');location.replace(url.href);
          }
        }
      }).catch(()=>{});
    }else navigator.serviceWorker.register('./service-worker.js',{scope:'./',updateViaCache:'none'}).catch(()=>{});
  }
  $('settings-open').addEventListener('click',()=>$('settings-dialog').showModal());
  $('save-presets')?.addEventListener('click',()=>{
    const collection={format:'coolradtv-curated-v1',exportedAt:new Date().toISOString(),radio:radioPresets,tv:tvPresets};
    const blob=new Blob([JSON.stringify(collection,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download='CoolRADtv-curated-presets.json';
    document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    notify('Presets exported: '+Object.keys(radioPresets).length+' Radio and '+Object.keys(tvPresets).length+' TV.');
  });
  $('clear-recent').addEventListener('click',()=>{if(!saveStore(RECENT_STORE,[]))return;recentHistory=[];renderPresets();notify('Recent history cleared.');});
  formatClock();setInterval(formatClock,30000);loadRadioNews();setInterval(loadRadioNews,60*60*1000);loadLanguageCatalog();
  fetchData().finally(()=>{
    audio.autoplay=true;
    audio.preload='auto';
    closeSplash(true);
    radioStartupPending=true;
    startOpenedPlayer(true);
  });
})();
