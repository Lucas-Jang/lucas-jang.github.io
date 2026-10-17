import { geometry, trackPose, contain, gesture, flightPose, spring, clamp, mod } from './car-motion.mjs';

// Side-profile Veracruz: edge cruise → pull/charge → stunt → air landing.
const id = 'lucas-roaming-car';
if (!document.getElementById(id)) initialize();

function initialize() {
  const host = document.createElement('div');
  host.id = id;
  host.setAttribute('data-pagefind-ignore', '');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      :host { all: initial; position: fixed; inset: 0; z-index: 8; pointer-events: none;
        font: 13px/1.5 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        color: #203a48; color-scheme: light; }
      *, *::before, *::after { box-sizing: border-box; }
      [hidden] { display: none !important; }
      button { font: inherit; color: inherit; cursor: pointer; touch-action: manipulation; }
      button:focus-visible { outline: 2px solid #286280; outline-offset: 3px; }
      .car { position: absolute; inset: 0 auto auto 0; border: 0; padding: 0;
        background: transparent; pointer-events: auto; touch-action: none; user-select: none;
        -webkit-user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent;
        cursor: grab; transform-origin: center; will-change: transform; border-radius: 15px; }
      .car:active { cursor: grabbing; }
      .vehicle { position: absolute; inset: 0; pointer-events: none;
        transform-origin: 50% 58%; filter: drop-shadow(0 2px 2px #102e4038); }
      .body { position: absolute; top: 4.65%; left: 0; width: 100%; height: auto;
        transform-origin: 50% 70%; user-select: none; pointer-events: none; }
      .wheel { position: absolute; top: 69.77%; width: 15%; aspect-ratio: 1;
        border: 2px solid #232a30; border-radius: 50%;
        background: radial-gradient(circle, #475866 0 12%, #cad4d8 13% 23%, transparent 24%),
          repeating-conic-gradient(#c5d0d5 0 14deg, #61717d 14deg 28deg, #dbe2e4 28deg 40deg), #26323b;
        box-shadow: inset 0 0 0 2px #38434a; }
      .front { left: 20.7%; } .rear { left: 77.4%; }
      .air { position: absolute; inset: auto 16% 7%; height: 5px; border-bottom: 2px solid #dce7e9;
        border-radius: 50%; opacity: 0; pointer-events: none; }
      .sr { position: absolute; width: 1px; height: 1px; overflow: hidden;
        clip-path: inset(50%); white-space: nowrap; }
      .safe { visibility: hidden; position: absolute;
        padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px)
          env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px); }
      .garage-toggle { position: fixed; right: max(12px, env(safe-area-inset-right));
        bottom: max(10px, env(safe-area-inset-bottom)); pointer-events: auto;
        min-width: 54px; min-height: 44px; padding: 8px 13px; border: 1px solid #a4b7be;
        border-radius: 24px; background: #f8f8f1; box-shadow: 0 2px 12px #19354316; font-weight: 500; }
      .garage { position: fixed; right: max(12px, env(safe-area-inset-right));
        bottom: max(64px, calc(env(safe-area-inset-bottom) + 54px)); pointer-events: auto;
        width: min(296px, calc(100% - 24px)); max-height: calc(100vh - 100px); max-height: calc(100dvh - 100px);
        overflow-y: auto; padding: 16px; border: 1px solid #c0cdd0; border-radius: 18px;
        background: #f8f8f1; box-shadow: 0 8px 32px #19354324; }
      .garage h2 { margin: 0; font-size: 14px; font-weight: 600; letter-spacing: .08em; }
      .garage p { margin: 5px 0 12px; font-size: 12px; }
      .heading { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
      .close { min-width: 44px; min-height: 44px; border: 0; background: transparent; font-size: 20px; }
      .modes, .tricks, .utilities { display: flex; gap: 6px; }
      .modes button, .tricks button, .utilities button { flex: 1; min-width: 0; min-height: 44px;
        border: 1px solid #bccbd0; border-radius: 9px; background: transparent; padding: 7px 5px; }
      .modes [aria-pressed="true"] { background: #355c70; color: #fff; border-color: #355c70; }
      .tricks { flex-wrap: wrap; margin: 10px 0; }
      .tricks button { flex-basis: calc(50% - 6px); }
      .utilities button { border: 0; color: #426170; }
      .hint { margin-bottom: 0 !important; color: #426170; }
      @media (max-height: 360px) { .garage { bottom: 58px; max-height: calc(100dvh - 72px); padding: 10px; } }
      @media print { :host { display: none; } }
    </style>
    <span class="safe" aria-hidden="true"></span>
    <button class="car" type="button" aria-label="흰색 베라크루즈, 누르면 차고 전환" aria-describedby="car-help">
      <span class="vehicle" aria-hidden="true">
        <span class="wheel front"></span><span class="wheel rear"></span>
        <picture><source srcset="/images/widgets/veracruz-body.webp" type="image/webp" /><img class="body" src="/images/widgets/veracruz-body.png" alt="" width="960" height="332" draggable="false" decoding="async" /></picture>
        <span class="air"></span>
      </span>
    </button>
    <span id="car-help" class="sr">탭하면 차고 전환. 안쪽으로 짧게 당기면 킥플립, 길게 당기면 램프 점프. 길게 눌렀다 놓으면 에어 홉. 키보드 K는 킥플립, R은 램프, H는 홉, 방향키 위아래는 차고 조절, Escape는 정차.</span>
    <span class="sr" role="status" aria-live="polite" aria-atomic="true"></span>
    <button class="garage-toggle" type="button" aria-expanded="false" aria-controls="car-garage" aria-label="자동차 차고 열기">차고</button>
    <section id="car-garage" class="garage" aria-label="베라크루즈 에어서스펜션" hidden>
      <div class="heading"><h2>VERACRUZ · AIR</h2><button class="close" type="button" aria-label="자동차 차고 닫기">×</button></div>
      <p class="state">가장자리를 달리는 중</p>
      <div class="modes" role="group" aria-label="차체 높이">
        <button type="button" data-height="low" aria-pressed="false">낮게</button>
        <button type="button" data-height="ride" aria-pressed="true">기본</button>
        <button type="button" data-height="high" aria-pressed="false">높게</button>
      </div>
      <div class="tricks" role="group" aria-label="자동차 기믹">
        <button type="button" data-trick="kickflip">킥플립</button>
        <button type="button" data-trick="ramp">램프 점프</button>
        <button type="button" data-trick="hop">에어 홉</button>
        <button type="button" data-kneel>앞쪽 낮추기</button>
      </div>
      <div class="utilities"><button type="button" data-pause>주행 멈추기</button><button type="button" data-hide>자동차 숨기기</button></div>
      <p class="hint">탭 · 차고 전환<br>길게 누르기 · 에어 홉<br>화면 안쪽으로 당겨 놓기 · 트릭</p>
    </section>`;
  document.body.append(host);
  const car = root.querySelector('.car'), vehicle = root.querySelector('.vehicle');
  const body = root.querySelector('.body'), wheels = root.querySelectorAll('.wheel'), air = root.querySelector('.air');
  const panel = root.querySelector('.garage'), toggle = root.querySelector('.garage-toggle');
  const stateLabel = root.querySelector('.state'), live = root.querySelector('[role="status"]');
  const pauseButton = root.querySelector('[data-pause]');
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const heights = { low: .028, ride: 0, high: -.034 };
  const names = { low: '낮은 차고', ride: '기본 차고', high: '높은 차고' };
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem('lj-veracruz-v1') || '{}') || {}; } catch { /* Storage is optional. */ }
  let heightMode = Object.prototype.hasOwnProperty.call(heights, stored.height) ? stored.height : 'ride';
  let userPaused = stored.paused === true;
  let paused = media.matches || userPaused, visible = stored.visible !== false;
  let focusHeld = false, g, distance = 0, pose, flight = null, press = null;
  let kneelUntil = 0, puffUntil = 0, frame = 0, lastTime = 0, wheelAngle = 0, pageSuspended = false;
  let front = { value: 0, velocity: 0 }, rear = { value: 0, velocity: 0 };

  function save() {
    try { localStorage.setItem('lj-veracruz-v1', JSON.stringify({ height: heightMode, paused: userPaused, visible })); } catch { /* Private mode/storage disabled. */ }
  }
  function announce(message) { live.textContent = message; stateLabel.textContent = message; }
  function controls() {
    root.querySelectorAll('[data-height]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.height === heightMode)));
    pauseButton.textContent = paused ? '주행 다시 시작' : '주행 멈추기';
    pauseButton.setAttribute('aria-pressed', String(paused));
    car.hidden = !visible;
    toggle.textContent = visible ? '차고' : '자동차';
    toggle.setAttribute('aria-label', visible ? panel.hidden ? '자동차 차고 열기' : '자동차 차고 접기' : '자동차 다시 보이기');
    car.setAttribute('aria-label', `흰색 베라크루즈, ${names[heightMode]}, 누르면 차고 전환`);
    host.dataset.height = heightMode;
  }
  function setPanel(open) {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? '자동차 차고 접기' : '자동차 차고 열기');
    if (open) announce(`${names[heightMode]} · 차고를 닫으면 ${paused ? '정차 유지' : '주행 재개'}`);
    schedule();
  }
  function setHeight(mode) {
    heightMode = mode; kneelUntil = 0; puffUntil = performance.now() + 400;
    controls(); save(); announce(`${names[mode]}로 조절했어요`);
    if (media.matches) { front = { value: heights[mode] * g.size, velocity: 0 }; rear = { ...front }; paint(); }
    schedule();
  }
  function cycleHeight() { const list = ['ride', 'low', 'high']; setHeight(list[(list.indexOf(heightMode) + 1) % list.length]); }
  function targets(now) {
    const base = heights[heightMode] * g.size;
    const compressed = !media.matches && press && !press.dragged && now - press.time > 420;
    return { front: base + (compressed ? g.size * .027 : 0) + (now < kneelUntil ? g.size * .035 : 0), rear: base + (compressed ? g.size * .027 : 0) };
  }
  function driveAllowed() { return !paused && !focusHeld && panel.hidden && !press && !flight; }
  function active() {
    if (!visible || document.hidden || pageSuspended) return false;
    const t = targets(performance.now());
    const unsettled = Math.abs(front.value - t.front) + Math.abs(rear.value - t.rear) + Math.abs(front.velocity) + Math.abs(rear.velocity) > .03;
    return driveAllowed() || !!flight || !!press || (!media.matches && (unsettled || performance.now() < kneelUntil || performance.now() < puffUntil));
  }
  function schedule() {
    if (g && pose) paint();
    if (active() && !frame) frame = requestAnimationFrame(tick);
    if (!active() && frame) { cancelAnimationFrame(frame); frame = 0; lastTime = 0; }
  }
  function paint() {
    const p = contain(g, pose);
    car.style.width = `${g.size}px`; car.style.height = `${g.carHeight}px`;
    car.style.transform = `translate3d(${p.x - g.size / 2}px, ${p.y - g.carHeight / 2}px, 0) rotate(${p.angle}deg)`;
    vehicle.style.transform = `perspective(600px) rotateX(${pose.roll || 0}deg)`;
    const heave = (front.value + rear.value) / 2;
    const pitch = Math.atan2(rear.value - front.value, g.size * .567) * 180 / Math.PI;
    body.style.transform = `translateY(${heave}px) rotate(${pitch}deg)`;
    wheels.forEach(w => { w.style.transform = `translate(-50%, -50%) rotate(${wheelAngle}deg)`; });
    air.style.opacity = media.matches ? '0' : String(clamp((puffUntil - performance.now()) / 400, 0, .7));
    host.dataset.state = !visible ? 'hidden' : flight ? flight.kind : press ? press.dragged ? 'dragging' : 'charging' : driveAllowed() ? 'cruising' : 'parked';
    host.dataset.edgeAngle = String(Math.round(pose.angle));
    host.dataset.paused = String(paused);
  }
  function tick(now) {
    frame = 0;
    const dt = lastTime ? clamp((now - lastTime) / 1000, 0, .05) : 0;
    lastTime = now;
    if (flight) {
      const t = (now - flight.time) / flight.duration;
      pose = flightPose(g, flight, t);
      if (t >= 1) {
        distance = mod(flight.to, g.perimeter); flight = null;
        front.velocity = g.size * .52; rear.velocity = g.size * .4;
        puffUntil = now + 450;
        announce('착지 완료 · 에어서스가 수평을 맞췄어요');
      }
    } else if (press) {
      pose = contain(g, { ...press.pose, x: press.pose.x + press.dx * .8, y: press.pose.y + press.dy * .8 });
    } else {
      if (driveAllowed()) {
        const travel = (heightMode === 'low' ? 25 : 38) * dt;
        distance = mod(distance + travel, g.perimeter);
        wheelAngle -= travel / (g.size * .075) * 180 / Math.PI;
      }
      pose = trackPose(g, distance);
    }
    const t = targets(now);
    front = spring(front, t.front, dt); rear = spring(rear, t.rear, dt);
    paint();
    if (active()) frame = requestAnimationFrame(tick); else lastTime = 0;
  }
  function launch(kind) {
    if (flight || !visible) return;
    if (media.matches) { pose = trackPose(g, distance); paint(); announce('동작 줄이기 설정에 따라 회전과 점프를 생략했어요'); return; }
    const travel = kind === 'ramp' ? g.size * 1.35 : kind === 'kickflip' ? g.size * .35 : 0;
    flight = { kind, start: { ...pose }, to: distance + travel, time: performance.now(), duration: kind === 'ramp' ? 1200 : kind === 'kickflip' ? 1050 : 700 };
    kneelUntil = 0;
    announce(kind === 'kickflip' ? '킥플립 · 한 바퀴 돌아 착지해요' : kind === 'ramp' ? '램프 점프 · 가장자리로 돌아와요' : '에어 홉 · 가볍게 튀어 올라요');
    schedule();
  }
  function releaseCapture(pointerId) { if (car.hasPointerCapture?.(pointerId)) car.releasePointerCapture(pointerId); }
  function cancelGesture() {
    if (!press) return;
    const pointerId = press.id; press = null; releaseCapture(pointerId);
    pose = trackPose(g, distance); paint(); schedule();
  }
  function settle() {
    cancelGesture();
    if (flight) distance = mod(flight.to, g.perimeter);
    flight = null; kneelUntil = 0;
    front = { value: heights[heightMode] * g.size, velocity: 0 }; rear = { ...front };
    pose = trackPose(g, distance); paint(); lastTime = 0;
  }
  function resize() {
    const progress = g ? distance / g.perimeter : 0;
    const safe = getComputedStyle(root.querySelector('.safe')), v = window.visualViewport;
    g = geometry({ width: v?.width || document.documentElement.clientWidth, height: v?.height || innerHeight,
      left: v?.offsetLeft || 0, top: v?.offsetTop || 0 }, {
      top: parseFloat(safe.paddingTop) || 0, right: parseFloat(safe.paddingRight) || 0,
      bottom: parseFloat(safe.paddingBottom) || 0, left: parseFloat(safe.paddingLeft) || 0,
    });
    distance = progress * g.perimeter;
    // Old pointer coordinates and flight arcs are invalid after a viewport change.
    settle(); schedule();
  }
  car.addEventListener('pointerdown', e => {
    if (!e.isPrimary || e.button !== 0 || press || flight) return;
    focusHeld = false;
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0, dragged: false, pose: { ...pose }, time: performance.now() };
    car.setPointerCapture(e.pointerId); schedule();
  });
  car.addEventListener('pointermove', e => {
    if (!press || press.id !== e.pointerId) return;
    press.dx = e.clientX - press.x; press.dy = e.clientY - press.y;
    press.dragged ||= Math.hypot(press.dx, press.dy) > 9;
    if (press.dragged) {
      const result = gesture(g, press.pose, press.dx, press.dy);
      stateLabel.textContent = result.kind === 'ramp' ? '놓으면 램프 점프' : result.kind === 'kickflip' ? '놓으면 킥플립' : '화면 안쪽으로 당겨 보세요';
    }
  });
  car.addEventListener('pointerup', e => {
    if (!press || press.id !== e.pointerId) return;
    const held = press, kind = gesture(g, held.pose, held.dx, held.dy).kind;
    const charged = performance.now() - held.time >= 420;
    pose = contain(g, { ...held.pose, x: held.pose.x + held.dx * .8, y: held.pose.y + held.dy * .8 });
    press = null; releaseCapture(e.pointerId);
    if (held.dragged && kind) launch(kind);
    else if (!held.dragged && charged) launch('hop');
    else { pose = trackPose(g, distance); if (!held.dragged) cycleHeight(); paint(); schedule(); }
  });
  car.addEventListener('pointercancel', cancelGesture);
  car.addEventListener('lostpointercapture', cancelGesture);
  car.addEventListener('contextmenu', e => e.preventDefault());
  car.addEventListener('click', e => { if (e.detail === 0 || !window.PointerEvent) cycleHeight(); });
  car.addEventListener('focus', () => { focusHeld = car.matches(':focus-visible'); schedule(); });
  car.addEventListener('blur', () => { focusHeld = false; schedule(); });
  car.addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    if (['k', 'r', 'h', 'arrowup', 'arrowdown', 'escape'].includes(key)) e.preventDefault();
    if (key === 'k') launch('kickflip'); if (key === 'r') launch('ramp'); if (key === 'h') launch('hop');
    if (key === 'arrowup') setHeight('high'); if (key === 'arrowdown') setHeight('low');
    if (key === 'escape') { paused = userPaused = true; settle(); controls(); save(); schedule(); announce('자동차를 정차했어요'); }
  });
  toggle.addEventListener('click', () => {
    if (!visible) { visible = true; controls(); save(); paint(); schedule(); announce('자동차가 돌아왔어요'); }
    else setPanel(panel.hidden);
  });
  root.querySelector('.close').addEventListener('click', () => { setPanel(false); toggle.focus(); });
  root.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) { setPanel(false); toggle.focus(); } });
  root.querySelectorAll('[data-height]').forEach(b => b.addEventListener('click', () => setHeight(b.dataset.height)));
  root.querySelectorAll('[data-trick]').forEach(b => b.addEventListener('click', () => launch(b.dataset.trick)));
  root.querySelector('[data-kneel]').addEventListener('click', () => {
    if (flight) return;
    if (media.matches) { announce('동작 줄이기 설정에 따라 차체 기울이기를 생략했어요'); return; }
    kneelUntil = performance.now() + 1000; puffUntil = kneelUntil + 400;
    announce('앞쪽을 낮췄다가 자동으로 수평을 맞춰요'); schedule();
  });
  pauseButton.addEventListener('click', () => {
    paused = userPaused = !paused; controls(); save(); announce(paused ? '주행을 멈췄어요' : '차고를 닫으면 주행을 시작해요'); schedule();
  });
  root.querySelector('[data-hide]').addEventListener('click', () => {
    visible = false; settle(); setPanel(false); controls(); save(); schedule(); toggle.focus();
  });
  const motionChanged = () => {
    paused = media.matches || userPaused; settle(); controls(); save(); schedule();
    announce(media.matches ? '동작 줄이기 · 정차했어요' : paused ? '정차 상태를 유지해요' : '가장자리 주행을 시작해요');
  };
  if (media.addEventListener) media.addEventListener('change', motionChanged);
  else media.addListener(motionChanged);
  document.addEventListener('visibilitychange', () => { if (document.hidden) settle(); schedule(); });
  window.addEventListener('resize', resize, { passive: true });
  window.visualViewport?.addEventListener('resize', resize, { passive: true });
  window.visualViewport?.addEventListener('scroll', resize, { passive: true });
  window.addEventListener('pagehide', () => { pageSuspended = true; settle(); schedule(); });
  window.addEventListener('pageshow', () => { pageSuspended = false; lastTime = 0; schedule(); });
  root.querySelector('img').addEventListener('error', () => {
    paused = true; visible = false; controls(); schedule();
    announce('자동차 그림을 불러오지 못했어요. 잠시 후 다시 열어 주세요.');
  });
  resize(); controls(); paint(); schedule();
}
