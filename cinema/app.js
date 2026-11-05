(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const film = $('film');
  const experience = $('experience');
  const canvas = $('particles');
  const ctx = canvas.getContext('2d', { alpha: true });
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const params = new URLSearchParams(location.search);
  const debugTimeout = Number(params.get('timeout'));
  const expirySeconds = params.has('timeout') && Number.isFinite(debugTimeout) && debugTimeout >= 1 && debugTimeout <= 300 ? debugTimeout : 60;
  const presets = ['愿你被这个世界温柔以待', '祝你生日快乐', '愿所有美好，都如约而至'];
  const presetIndex = Math.max(0, Math.min(2, Number.parseInt(params.get('wish') || '1', 10) || 0));
  let message = presets[presetIndex];
  if (params.has('msg')) {
    const clean = (params.get('msg') || '').replace(/[\u0000-\u001f\u007f<>\\]/g, '').replace(/\s+/g, ' ').trim();
    if (clean) message = Array.from(clean).slice(0, 48).join('');
  }
  $('blessing').textContent = message;

  const state = {
    phase: 'gate', source: '', startedAt: 0, expired: false, waiting: false,
    giftOpened: false, explosionFired: false, blessingFired: false,
    particlesFired: 0, hapticsFired: false, orientationSwitches: 0
  };
  let expiryTimer = 0, loadTimer = 0, resumeAfterOrientation = false;
  let particles = [], raf = 0, lastFrame = 0;

  function setHidden(id, hidden) { $(id).classList.toggle('hidden', hidden); }
  function chooseSource() { return innerHeight >= innerWidth ? 'portrait' : 'landscape'; }
  function loadFilm() {
    const next = chooseSource();
    if (state.source === next && film.getAttribute('src')) return;
    const previousTime = Number.isFinite(film.currentTime) ? film.currentTime : 0;
    const shouldResume = state.phase !== 'gate' && state.phase !== 'expired' && !film.paused;
    state.source = next;
    if (state.startedAt) { resumeAfterOrientation = shouldResume; state.orientationSwitches++; }
    setHidden('loading', state.phase !== 'gate' && state.phase !== 'expired');
    film.src = `./cinema-${next}.mp4`;
    film.load();
    film.addEventListener('loadedmetadata', function restore() {
      film.removeEventListener('loadedmetadata', restore);
      if (state.startedAt && previousTime > 0 && previousTime < film.duration) film.currentTime = Math.min(previousTime, film.duration - .05);
      if (resumeAfterOrientation && !state.expired) film.play().catch(showError);
      resumeAfterOrientation = false;
      setHidden('loading', true);
    });
  }
  function showError(event) {
    if (state.phase === 'gate' && !film.getAttribute('src')) return;
    clearTimeout(loadTimer);
    setHidden('loading', true);
    setHidden('error', false);
    $('error-detail').textContent = '影片暂时未能载入，请检查网络后重试。';
    state.phase = 'error';
    console.warn('Cinematic media playback interrupted', event?.message || event?.type || 'playback');
  }

  async function begin() {
    clearTimeout(loadTimer);
    setHidden('error', true); setHidden('gate', true); setHidden('expired', true); setHidden('finale', true); setHidden('opening', false); setHidden('sound', false);
    state.phase = 'intro'; state.startedAt = performance.now(); state.expired = false;
    state.waiting = false; state.giftOpened = false; state.explosionFired = false; state.blessingFired = false;
    state.hapticsFired = false; setHidden('tap-prompt', true); setHidden('gift-hit', true);
    particles = []; ctx.clearRect(0, 0, canvas.width, canvas.height);
    experience.classList.add('playing');
    film.currentTime = 0; film.muted = false; film.volume = .88;
    $('sound').setAttribute('aria-pressed', 'false'); $('sound').setAttribute('aria-label', '关闭声音'); $('sound').textContent = '♪';
    expiryTimer = window.setTimeout(expire, expirySeconds * 1000);
    try { await film.play(); }
    catch (error) {
      film.muted = true;
      try { await film.play(); $('sound').setAttribute('aria-pressed', 'true'); $('sound').textContent = '×'; }
      catch (secondError) { showError(secondError); }
    }
  }

  function onTime() {
    if (state.expired || state.phase === 'gate' || state.phase === 'error') return;
    const t = film.currentTime;
    if (!state.giftOpened && t >= 13.6) {
      if (!state.waiting) {
        state.waiting = true; state.phase = 'waiting'; film.pause();
        setHidden('tap-prompt', false); setHidden('gift-hit', false);
      }
    }
    if (state.giftOpened && t >= 23.25 && !state.explosionFired) explode();
    if (t >= 48.5 && !state.blessingFired) {
      state.blessingFired = true; state.phase = 'finale'; setHidden('finale', false);
    }
    if (t >= Math.min(59.8, film.duration || 60)) expire();
  }

  function openGift() {
    if (!state.waiting || state.giftOpened || state.expired) return;
    state.giftOpened = true; state.waiting = false; state.phase = 'cracking';
    setHidden('tap-prompt', true); setHidden('gift-hit', true);
    if (!reducedMotion) {
      film.animate([
        { transform: 'translate(0,0) scale(1)' }, { transform: 'translate(-5px,2px) scale(1.018)' },
        { transform: 'translate(5px,-3px) scale(1.025)' }, { transform: 'translate(-3px,2px) scale(1.018)' },
        { transform: 'translate(0,0) scale(1)' }
      ], { duration: 680, easing: 'ease-out' });
    }
    burst(innerWidth * .5, innerHeight * .46, 42, false);
    if (navigator.vibrate) navigator.vibrate(28);
    film.play().catch(showError);
  }

  function explode() {
    state.explosionFired = true; state.phase = 'explosion';
    burst(innerWidth * .5, innerHeight * .46, reducedMotion ? 40 : 220, true);
    if (navigator.vibrate) { navigator.vibrate([45, 35, 95]); state.hapticsFired = true; }
    if (!reducedMotion) {
      film.animate([
        { transform: 'translate(0,0) scale(1.035)' }, { transform: 'translate(-11px,6px) scale(1.05)' },
        { transform: 'translate(10px,-7px) scale(1.05)' }, { transform: 'translate(-6px,-4px) scale(1.045)' },
        { transform: 'translate(4px,3px) scale(1.035)' }, { transform: 'translate(0,0) scale(1)' }
      ], { duration: 850, easing: 'cubic-bezier(.2,.7,.2,1)' });
      $('flash').animate([{ opacity: 0 }, { opacity: .65, offset: .12 }, { opacity: 0 }], { duration: 780, easing: 'ease-out' });
    }
  }

  function expire() {
    if (state.expired) return;
    state.expired = true; state.phase = 'expired'; clearTimeout(expiryTimer); film.pause();
    setHidden('opening', true); setHidden('finale', true); setHidden('sound', true); setHidden('loading', true); setHidden('expired', false);
    if (navigator.vibrate) navigator.vibrate(0);
  }

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.75);
    canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
    canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    loadFilm();
  }

  function burst(x, y, count, powerful) {
    const colors = ['#fff8dc', '#f5d28c', '#e9ae54', '#a9d9ff'];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (powerful ? 100 : 24) + Math.random() * (powerful ? 450 : 75);
      particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - (powerful ? 20 : 5),
        age: 0, life: .65 + Math.random() * (powerful ? 1.6 : .7), size: .6 + Math.random() * (powerful ? 2.7 : 1.8),
        color: colors[i % colors.length] });
    }
    state.particlesFired += count;
    if (!raf) { lastFrame = performance.now(); raf = requestAnimationFrame(draw); }
  }
  function draw(now) {
    const dt = Math.min((now - lastFrame) / 1000, .04); lastFrame = now;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    particles = particles.filter(p => {
      p.age += dt; if (p.age >= p.life) return false;
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .986; p.vy = p.vy * .986 + 28 * dt;
      const a = (1 - p.age / p.life) ** 1.7;
      ctx.globalAlpha = a; ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - p.age / p.life * .45), 0, Math.PI * 2); ctx.fill();
      return true;
    });
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    raf = particles.length ? requestAnimationFrame(draw) : 0;
  }

  $('begin').addEventListener('click', begin);
  $('gift-hit').addEventListener('click', openGift);
  $('replay').addEventListener('click', begin);
  $('reopen').addEventListener('click', begin);
  $('retry').addEventListener('click', () => location.reload());
  $('sound').addEventListener('click', () => {
    film.muted = !film.muted;
    $('sound').setAttribute('aria-pressed', String(film.muted));
    $('sound').setAttribute('aria-label', film.muted ? '开启声音' : '关闭声音');
    $('sound').textContent = film.muted ? '×' : '♪';
  });
  film.addEventListener('timeupdate', onTime);
  film.addEventListener('waiting', () => { if (state.phase !== 'gate' && !state.waiting && !state.expired) setHidden('loading', false); });
  film.addEventListener('playing', () => setHidden('loading', true));
  film.addEventListener('canplay', () => setHidden('loading', true));
  film.addEventListener('ended', expire);
  film.addEventListener('error', showError);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !film.paused) { film.pause(); resumeAfterOrientation = true; }
    else if (!document.hidden && resumeAfterOrientation && !state.expired && !state.waiting) { film.play().catch(showError); resumeAfterOrientation = false; }
  });
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));
  film.muted = true; resize();
  window.cinemaDebug = { state, get expirySeconds() { return expirySeconds; }, get blessing() { return message; }, get videoTime() { return film.currentTime; }, get source() { return state.source; } };
})();
