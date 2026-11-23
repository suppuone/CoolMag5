/* Optional feedback only. The player owns every stream and media element. */
(() => {
  'use strict';

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  function createSoundFX() {
    const preference = 'coolmag.hardware-sound';
    let enabled = true;
    try { enabled = localStorage.getItem(preference) !== 'off'; } catch {}
    let context, output, noise, staticVoice;
    let lastTick = -Infinity, lastStatic = -Infinity, lastVibration = -Infinity;

    function unlock(event) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!event.isTrusted || !enabled || !Audio) return;
      try {
        if (!context) {
          context = new Audio();
          output = context.createGain();
          output.gain.value = .22;
          output.connect(context.destination);
        }
        if (context.state !== 'running') context.resume().catch(() => {});
      } catch {}
    }

    function play(source, filter, duration, peak) {
      const now = context.currentTime;
      const envelope = context.createGain();
      source.connect(filter || envelope);
      filter?.connect(envelope);
      envelope.connect(output);
      envelope.gain.setValueAtTime(peak, now);
      envelope.gain.exponentialRampToValueAtTime(.0001, now + duration);
      source.onended = () => {
        source.disconnect();
        filter?.disconnect();
        envelope.disconnect();
      };
      source.start(now);
      source.stop(now + duration + .005);
      return envelope;
    }

    function vibrate() {
      const now = performance.now();
      if (now - lastVibration < 36 || motion.matches || document.hidden) return;
      lastVibration = now;
      try { navigator.vibrate?.(6); } catch {}
    }

    function mechanical(tick, tactile = true) {
      if (tactile) vibrate();
      if (!enabled || context?.state !== 'running' || document.hidden) return;
      const now = context.currentTime;
      if (tick && now - lastTick < .018) return;
      if (tick) lastTick = now;
      const oscillator = context.createOscillator();
      oscillator.type = tick ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(tick ? 1800 : 140, now);
      oscillator.frequency.exponentialRampToValueAtTime(tick ? 1150 : 60, now + (tick ? .012 : .035));
      const highpass = tick ? context.createBiquadFilter() : null;
      if (highpass) {
        highpass.type = 'highpass';
        highpass.frequency.value = 1500;
      }
      play(oscillator, highpass, tick ? .012 : .035, tick ? .17 : .35);
    }

    function staticBurst() {
      if (!enabled || context?.state !== 'running' || document.hidden) return;
      const now = context.currentTime;
      if (now - lastStatic < .16) return;
      lastStatic = now;
      if (!noise) {
        noise = context.createBuffer(1, Math.ceil(context.sampleRate * .12), context.sampleRate);
        const samples = noise.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      }
      const source = context.createBufferSource();
      source.buffer = noise;
      const filter = context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = .85;
      filter.frequency.setValueAtTime(2800, now);
      filter.frequency.exponentialRampToValueAtTime(680, now + .12);
      staticVoice = play(source, filter, .12, .24);
    }

    function lock() {
      if (!staticVoice || context?.state !== 'running') return;
      const gain = staticVoice.gain;
      const now = context.currentTime;
      if (gain.cancelAndHoldAtTime) gain.cancelAndHoldAtTime(now);
      else gain.cancelScheduledValues(now);
      gain.setTargetAtTime(.0001, now, .008);
      staticVoice = null;
    }

    function clack({rocker = false} = {}) {
      if (!enabled) return;
      mechanical(false);
      if (rocker) mechanical(true, false);
    }

    return {
      get enabled() { return enabled; },
      setEnabled(value) {
        enabled = value;
        if (output) output.gain.setTargetAtTime(value ? .22 : 0, context.currentTime, .008);
        try { localStorage.setItem(preference, value ? 'on' : 'off'); } catch {}
      },
      unlock, detent: () => mechanical(true), thunk: () => mechanical(false), clack,
      rockerSnap() { clack({rocker:true}); },
      staticBurst, lock
    };
  }

  const SoundFX = createSoundFX();

  function createFlywheel() {
    let frame = 0, value = 0, velocity = 0, sampledAt = 0;
    function cancel() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    }
    return {
      cancel,
      start(position, time) {
        cancel();
        value = position;
        velocity = 0;
        sampledAt = time;
      },
      sample(position, time) {
        const elapsed = time - sampledAt;
        if (elapsed <= 0) return;
        const measured = Math.max(-.045, Math.min(.045, (position - value) / elapsed));
        velocity = velocity * .35 + measured * .65;
        value = position;
        sampledAt = time;
        if (Math.abs(velocity) > .022) SoundFX.staticBurst();
      },
      release({position, time, maximum, preview, settle}) {
        if (motion.matches || time - sampledAt > 90 || Math.abs(velocity) < .006 ||
            (position <= 0 && velocity < 0) || (position >= maximum && velocity > 0)) {
          settle();
          return;
        }
        let previous = performance.now();
        const started = previous;
        let travel = position;
        function advance(now) {
          const elapsed = Math.max(0, Math.min(32, now - previous));
          previous = now;
          travel = Math.min(maximum, Math.max(0, travel + velocity * elapsed));
          preview(travel);
          velocity *= Math.exp(-elapsed / 105);
          if (travel === 0 || travel === maximum || Math.abs(velocity) < .003 || now - started >= 300) {
            frame = 0;
            settle();
          } else frame = requestAnimationFrame(advance);
        }
        frame = requestAnimationFrame(advance);
      }
    };
  }

  window.RetroHardware = {SoundFX, createFlywheel};
  document.addEventListener('pointerdown', SoundFX.unlock, {capture:true, passive:true});
  document.addEventListener('pointerup', SoundFX.unlock, {capture:true, passive:true});
  document.addEventListener('keydown', SoundFX.unlock, {capture:true});
  const mechanicalKeys = '.hardware-filter,[data-console-mute],.orange-rocker';
  const feedbackButton = event => event.target.closest?.('button:not(:disabled)');
  document.addEventListener('pointerdown', event => {
    if (!event.isTrusted || event.button !== 0) return;
    const button = feedbackButton(event);
    if (button?.matches(mechanicalKeys)) SoundFX.clack({rocker:button.classList.contains('orange-rocker')});
  }, {capture:true, passive:true});
  document.addEventListener('click', event => {
    if (!event.isTrusted) return;
    SoundFX.unlock(event);
    const button = feedbackButton(event);
    if (button?.matches(mechanicalKeys)) {
      if (!event.detail) SoundFX.clack({rocker:button.classList.contains('orange-rocker')});
    } else if (button?.matches('[data-console-filter],[data-console-mode],[data-sleep-open],.cabinet-favorite,#radio-play,#tv-toggle')) SoundFX.thunk();
    if (button?.matches('#radio-prev,#radio-next,#tv-prev,#tv-next,[data-radio-shortcut],[data-remote-preset],[data-fullscreen-action="previous"],[data-fullscreen-action="next"],[data-remote="channel-up"],[data-remote="channel-down"]')) SoundFX.staticBurst();
  }, true);

  let rockerTimer;
  document.addEventListener('retro-mode-changing', ({detail:{previous, screenId}}) => {
    const playerModes = ['radio-screen', 'tv-screen'];
    if (previous === screenId || !playerModes.includes(previous) || !playerModes.includes(screenId) || motion.matches) return;
    const rocker = document.getElementById(screenId)?.querySelector('.orange-rocker');
    if (!rocker || document.fullscreenElement || document.body.classList.contains('tv-fullscreen-open')) return;
    clearTimeout(rockerTimer);
    document.querySelector('.rocker-flipping')?.classList.remove('rocker-flipping');
    rocker.classList.add('rocker-flipping');
    rockerTimer = setTimeout(() => rocker.classList.remove('rocker-flipping'), 300);
  });

  document.addEventListener('DOMContentLoaded', () => {
    const audio = document.getElementById('radio-audio');
    const video = document.getElementById('tv-video');
    for (const media of [audio, video]) media.addEventListener('playing', SoundFX.lock);
    const soundToggle = document.getElementById('hardware-sound-enabled');
    soundToggle.checked = SoundFX.enabled;
    soundToggle.addEventListener('change', event => {
      SoundFX.setEnabled(soundToggle.checked);
      SoundFX.unlock(event);
    });

    const clocks = document.querySelectorAll('.crt-telemetry .crt-clock');
    const formatter = new Intl.DateTimeFormat(undefined, {hour:'2-digit', minute:'2-digit', hourCycle:'h23'});
    const refreshClock = () => {
      const time = formatter.format(new Date());
      for (const clock of clocks) if (clock.textContent !== time) clock.textContent = time;
    };
    refreshClock();
    setInterval(refreshClock, 5000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshClock(); });

    const sleepDialog = document.getElementById('cabinet-sleep-dialog');
    const sleepButtons = [...document.querySelectorAll('[data-sleep-open]')];
    let deadline = 0, updateTimer;
    const refreshSleep = () => {
      clearTimeout(updateTimer);
      const remaining = deadline - Date.now();
      if (deadline && remaining <= 0) {
        deadline = 0;
        document.dispatchEvent(new Event('retro-sleep-expired'));
      }
      for (const button of sleepButtons) {
        button.classList.toggle('sleep-armed', Boolean(deadline));
        button.querySelector('span').textContent = deadline ? Math.ceil(remaining / 60000) + 'm' : 'Zz';
        button.setAttribute('aria-label', deadline ? 'Sleep timer, ' + Math.ceil(remaining / 60000) + ' minutes left' : 'Set sleep timer');
      }
      if (deadline) updateTimer = setTimeout(refreshSleep, Math.min(remaining, 1000));
    };
    for (const button of sleepButtons) button.addEventListener('click', () => sleepDialog.showModal());
    sleepDialog.addEventListener('close', () => {
      if (!/^(0|15|30|60)$/.test(sleepDialog.returnValue)) return;
      const minutes = Number(sleepDialog.returnValue);
      deadline = minutes ? Date.now() + minutes * 60000 : 0;
      sleepDialog.returnValue = '';
      refreshSleep();
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && deadline) refreshSleep(); });
  });
})();
