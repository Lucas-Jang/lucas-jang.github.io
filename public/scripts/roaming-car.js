import { geometry, trackPose, contain, createFlight, stepFlight, bottomDistance, ENVIRONMENTS, spring, clamp, mod } from './car-physics.mjs?v=20261017-3';

// Wall adhesion → release under gravity → stopping-distance landing jets.
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
      .car { perspective: 700px; transform-style: preserve-3d; z-index: 2; }
      .vehicle, .shell { position: absolute; inset: 0; pointer-events: none;
        transform-origin: 50% 58%; transform-style: preserve-3d; }
      .side { position: absolute; inset: 0; backface-visibility: hidden; }
      .side.near { transform: translateZ(calc(var(--depth) / 2)); }
      .side.far { transform: translateZ(calc(var(--depth) / -2)) rotateY(180deg); }
      .side.far .body { transform: scaleX(-1); }
      .roof, .hood, .underbody { position: absolute; height: var(--depth); transform: translateY(-50%) rotateX(90deg);
        border: 1px solid #7c8589; border-radius: 5px; background: linear-gradient(90deg,#d4d8d6,#f8f5e9 30%,#e1e2d9); }
      .roof { left: 29%; width: 54%; top: 11%; background: linear-gradient(90deg,#dedfd6 8%,#40545e 9% 40%,#eeeee3 41%); }
      .hood { left: 4%; width: 29%; top: 43%; }
      .underbody { left: 10%; width: 81%; top: 73%; border-radius: 9px; border: 2px solid #202c34;
        background: repeating-linear-gradient(90deg,#344149 0 15%,#758088 16% 18%,#29363e 19% 30%); }
      .cap { position: absolute; top: 43%; width: var(--depth); height: 28%;
        transform: translateX(-50%) rotateY(90deg); border: 1px solid #8b969b; border-radius: 4px;
        background: linear-gradient(#eaece4 30%,#465b66 32% 52%,#d9ded7 54% 68%,#394750 70%); }
      .nose { left: 2%; } .tail { left: 98%; background: linear-gradient(#e9e8df 35%,#ad5a4b 36% 52%,#d0d6d2 54% 70%,#334149 71%); }
      .bridge { position: absolute; top: 69.77%; width: 15%; height: var(--depth);
        transform: translate(-50%,-50%) rotateX(90deg); border-radius: 6px;
        background: repeating-linear-gradient(0deg,#202c33 0 3px,#3a474f 3px 5px); }
      .strut { position: absolute; width: 7%; max-width: 12px; border: 1px solid #667985;
        border-radius: 3px; background: repeating-linear-gradient(#253743 0 3px,#a4b2b7 3px 4px,#33434d 4px 6px); }
      .strut::before, .strut::after { content: ''; position: absolute; left: -2px; right: -2px; height: 3px; border-radius: 2px; background: #a9bac1; }
      .strut::before { top: -2px; } .strut::after { bottom: -2px; }
      .body { position: absolute; top: 4.65%; left: 0; width: 100%; height: auto;
        transform-origin: 50% 70%; user-select: none; pointer-events: none; }
      .wheel { position: absolute; top: 69.77%; width: 15%; aspect-ratio: 1;
        border: 2px solid #232a30; border-radius: 50%;
        background: radial-gradient(circle, #475866 0 12%, #cad4d8 13% 23%, transparent 24%),
          repeating-conic-gradient(#c5d0d5 0 14deg, #61717d 14deg 28deg, #dbe2e4 28deg 40deg), #26323b;
        box-shadow: inset 0 0 0 2px #38434a, 0 0 6px rgb(148 231 241 / var(--adhesion,0)); }
      .front { left: 20.7%; } .rear { left: 77.4%; }
      :host([data-environment="mud"]) .wheel { border-color: #65523e; box-shadow: inset 0 0 0 2px #827057; }
      :host([data-environment="mud"]) .underbody { border-color: #685440; }
      .nozzle { position: absolute; top: 76%; width: 6%; height: 7%; border: 1px solid #6c7c85;
        border-radius: 2px 2px 4px 4px; background: #334953; transform: translateZ(3px); }
      .nozzle.a { left: 29%; } .nozzle.b { left: 67%; }
      .nozzle::after { content: ''; position: absolute; inset: 60% -25% -350%; border-radius: 45%;
        background: #efffff; box-shadow: 0 0 7px #d4fcff; opacity: var(--jet,0); }
      .afterburner { position: absolute; left: 94%; top: 61%; width: 6%; height: 8%; border-radius: 3px;
        border: 1px solid #87979d; background: #334953; transform: translateZ(5px); }
      .afterburner::after { content: ''; position: absolute; inset: 12% -70% 12% 75%; border-radius: 50%;
        background: #f6ffff; box-shadow: 0 0 8px #d8ffff; opacity: var(--boost,0); }
      .effects, .terrain { position: absolute; left: 0; top: 0; pointer-events: none; }
      .effects { z-index: 1; } .terrain { z-index: 0; overflow: visible; }
      .terrain path { fill: none; stroke-linecap: round; stroke-linejoin: round; }
      .air { position: absolute; inset: auto 16% 7%; height: 5px; border-bottom: 2px solid #dce7e9;
        border-radius: 50%; opacity: 0; pointer-events: none; }
      .sr { position: absolute; width: 1px; height: 1px; overflow: hidden;
        clip-path: inset(50%); white-space: nowrap; }
      .safe { visibility: hidden; position: absolute;
        padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px)
          env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px); }
      .launcher { position: fixed; right: max(12px, env(safe-area-inset-right));
        bottom: max(10px, env(safe-area-inset-bottom)); display: flex; gap: 6px; z-index: 4; }
      .garage-toggle, .boost-button { position: relative;
        pointer-events: auto;
        min-width: 54px; min-height: 44px; padding: 8px 13px; border: 1px solid #a4b7be;
        border-radius: 24px; background: #f8f8f1; box-shadow: 0 2px 12px #19354316; font-weight: 500; }
      .boost-button { background: #284d61; color: #fff; border-color: #284d61; min-width: 76px; }
      .boost-button[aria-pressed="true"] { background: #16718a; }
      .boost-button:disabled { opacity: .65; cursor: default; }
      .garage { position: fixed; right: max(12px, env(safe-area-inset-right));
        bottom: max(64px, calc(env(safe-area-inset-bottom) + 54px)); pointer-events: auto;
        width: min(296px, calc(100% - 24px)); max-height: calc(100vh - 100px); max-height: calc(100dvh - 100px);
        overflow-y: auto; overscroll-behavior: contain; padding: 16px; border: 1px solid #c0cdd0; border-radius: 18px; z-index: 4;
        background: #f8f8f1; box-shadow: 0 8px 32px #19354324; }
      .garage h2 { margin: 0; font-size: 14px; font-weight: 600; letter-spacing: .08em; }
      .garage p { margin: 5px 0 12px; font-size: 12px; }
      .heading { display: flex; justify-content: space-between; align-items: center; gap: 8px;
        position: sticky; top: -16px; background: #f8f8f1; z-index: 1; }
      .close { min-width: 44px; min-height: 44px; border: 0; background: transparent; font-size: 20px; }
      .modes, .tricks, .utilities { display: flex; gap: 6px; }
      .modes button, .tricks button, .utilities button { flex: 1; min-width: 0; min-height: 44px;
        border: 1px solid #bccbd0; border-radius: 9px; background: transparent; padding: 7px 5px; }
      .modes [aria-pressed="true"] { background: #355c70; color: #fff; border-color: #355c70; }
      .tricks { flex-wrap: wrap; margin: 10px 0; }
      .tricks button { flex-basis: calc(50% - 6px); }
      .utilities button { border: 0; color: #426170; }
      .hint { margin-bottom: 0 !important; color: #426170; }
      .environments { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 8px 0 14px; }
      .environments button { min-height: 44px; border: 1px solid #bdcbd0; border-radius: 9px; background: transparent; text-align: left; padding: 6px 10px; }
      .environments small { display: block; font-size: 11px; color: #526c79; }
      .environments [aria-pressed="true"] { background: #e1ecee; border-color: #406c7e; }
      .physics { padding: 8px 0; border-top: 1px solid #d9e0de; color: #496472; }
      .state { min-height: 36px; }
      @media (max-height: 360px) { .garage { bottom: 58px; max-height: calc(100dvh - 72px); padding: 10px; } }
      @media print { :host { display: none; } }
    </style>
    <span class="safe" aria-hidden="true"></span>
    <svg class="terrain" aria-hidden="true"><path /></svg><canvas class="effects" aria-hidden="true"></canvas>
    <button class="car" type="button" aria-label="흰색 베라크루즈, 누르면 차고 전환" aria-describedby="car-help">
      <span class="vehicle" aria-hidden="true">
        <span class="shell">
          <span class="side near"><picture><source srcset="/images/widgets/veracruz-body.webp" type="image/webp" /><img class="body" src="/images/widgets/veracruz-body.png" alt="" width="960" height="332" draggable="false" /></picture></span>
          <span class="side far"><picture><source srcset="/images/widgets/veracruz-body.webp" type="image/webp" /><img class="body" src="/images/widgets/veracruz-body.png" alt="" width="960" height="332" draggable="false" /></picture></span>
          <span class="roof"></span><span class="hood"></span><span class="underbody"></span><span class="cap nose"></span><span class="cap tail"></span>
        </span>
        <span class="bridge front"></span><span class="bridge rear"></span>
        <span class="strut front" data-side="near"></span><span class="strut rear" data-side="near"></span>
        <span class="strut front" data-side="far"></span><span class="strut rear" data-side="far"></span>
        <span class="wheel front" data-side="near"></span><span class="wheel rear" data-side="near"></span>
        <span class="wheel front" data-side="far"></span><span class="wheel rear" data-side="far"></span>
        <span class="nozzle a"></span><span class="nozzle b"></span><span class="afterburner"></span>
        <span class="air"></span>
      </span>
    </button>
    <span id="car-help" class="sr">탭하면 차고 전환. 공중으로 끌어 놓으면 중력 낙하 후 추진 착지. 길게 눌렀다 놓으면 에어 홉. K는 킥플립, R은 램프, H는 홉, B는 부스트, 위아래 방향키는 차고, Escape는 정차.</span>
    <span class="sr" role="status" aria-live="polite" aria-atomic="true"></span>
    <div class="launcher"><button class="boost-button" type="button" aria-label="자동차 급가속" aria-pressed="false">부스트</button><button class="garage-toggle" type="button" aria-expanded="false" aria-controls="car-garage" aria-label="자동차 차고 열기">차고</button></div>
    <section id="car-garage" class="garage" aria-label="베라크루즈 에어서스펜션" hidden>
      <div class="heading"><h2>VERACRUZ · AIR</h2><button class="close" type="button" aria-label="자동차 차고 닫기">×</button></div>
      <p class="state">가장자리를 달리는 중</p>
      <div class="environments" role="group" aria-label="주행 환경">
        <button type="button" data-environment="normal" aria-pressed="true">노말<small>균형 잡힌 주행</small></button>
        <button type="button" data-environment="sport" aria-pressed="false">스포츠<small>낮은 차고 · 빠른 응답</small></button>
        <button type="button" data-environment="offroad" aria-pressed="false">오프로드<small>높은 차고 · 부드러운 댐핑</small></button>
        <button type="button" data-environment="mud" aria-pressed="false">머드<small>낮은 접지 · 신중한 가속</small></button>
      </div>
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
      <p class="physics">중력 9.81 m/s² · 벽에서는 흡착</p>
      <p class="hint">탭 · 차고 전환<br>길게 누르기 · 에어 홉<br>공중으로 끌어 놓기 · 낙하 후 추진 착지</p>
    </section>`;
  document.body.append(host);
  const car = root.querySelector('.car'), vehicle = root.querySelector('.vehicle');
  const shell = root.querySelector('.shell'), wheels = root.querySelectorAll('.wheel'), air = root.querySelector('.air');
  const struts = root.querySelectorAll('.strut'), boostButton = root.querySelector('.boost-button');
  const canvas = root.querySelector('.effects'), context = canvas.getContext('2d');
  const terrain = root.querySelector('.terrain'), terrainPath = terrain.querySelector('path');
  const panel = root.querySelector('.garage'), toggle = root.querySelector('.garage-toggle');
  const stateLabel = root.querySelector('.state'), live = root.querySelector('[role="status"]');
  const pauseButton = root.querySelector('[data-pause]');
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const heights = { low: .028, ride: 0, high: -.034 };
  const names = { low: '낮은 차고', ride: '기본 차고', high: '높은 차고' };
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem('lj-veracruz-v1') || '{}') || {}; } catch { /* Storage is optional. */ }
  let environment = Object.prototype.hasOwnProperty.call(ENVIRONMENTS, stored.environment) ? stored.environment : 'normal';
  let heightMode = Object.prototype.hasOwnProperty.call(heights, stored.height) ? stored.height : 'ride';
  let userPaused = stored.paused === true;
  let paused = media.matches || userPaused, visible = stored.visible !== false;
  let focusHeld = false, g, distance = 0, pose, flight = null, press = null;
  let kneelUntil = 0, puffUntil = 0, frame = 0, lastTime = 0, wheelAngle = 0, pageSuspended = false;
  let front = { value: 0, velocity: 0 }, rear = { value: 0, velocity: 0 };
  let speed = 0, boostUntil = 0, particles = [], smokeCredit = 0, smokeDirty = false, lastPhase = '', viewportKey = '';
  const settings = () => ENVIRONMENTS[environment];

  function save() {
    try { localStorage.setItem('lj-veracruz-v1', JSON.stringify({ height: heightMode, environment, paused: userPaused, visible })); } catch { /* Private mode/storage disabled. */ }
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
    host.dataset.environment = environment;
    root.querySelectorAll('[data-environment]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.environment === environment)));
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
  function setEnvironment(mode) {
    environment = mode;
    setHeight(settings().height);
    drawTerrain();
    announce(`${settings().label} · ${names[heightMode]} · 중력은 그대로 유지돼요`);
  }
  function boost() {
    if (!visible || flight) return;
    if (media.matches) { announce('동작 줄이기 설정에서는 급가속 연출을 생략해요'); return; }
    paused = userPaused = false; focusHeld = false;
    boostUntil = performance.now() + 2000;
    setPanel(false); controls(); save();
    announce('부스트 · 후방 추진체로 급가속해요'); schedule();
  }
  function targets(now) {
    const base = heights[heightMode] * g.size;
    const compressed = !media.matches && press && !press.dragged && now - press.time > 420;
    const rough = driveAllowed() ? settings().bump : 0;
    return { front: base + (compressed ? g.size * .027 : 0) + (now < kneelUntil ? g.size * .035 : 0) + Math.sin(distance / 12) * rough,
      rear: base + (compressed ? g.size * .027 : 0) + Math.sin(distance / 12 - 2) * rough };
  }
  function driveAllowed() { return !paused && !focusHeld && panel.hidden && !press && !flight; }
  function active() {
    if (!visible || document.hidden || pageSuspended) return false;
    const t = targets(performance.now());
    const unsettled = Math.abs(front.value - t.front) + Math.abs(rear.value - t.rear) + Math.abs(front.velocity) + Math.abs(rear.velocity) > .03;
    return driveAllowed() || !!flight || !!press || (!media.matches && (unsettled || particles.length > 0 || performance.now() < kneelUntil || performance.now() < puffUntil));
  }
  function schedule() {
    if (g && pose) paint();
    if (active() && !frame) frame = requestAnimationFrame(tick);
    if (!active() && frame) { cancelAnimationFrame(frame); frame = 0; lastTime = 0; }
  }
  function paint() {
    const p = contain(g, pose);
    car.style.width = `${g.size}px`; car.style.height = `${g.carHeight}px`;
    car.style.setProperty('--depth', `${g.size * .18}px`);
    car.style.transform = `translate3d(${p.x - g.size / 2}px, ${p.y - g.carHeight / 2}px, 0) rotate(${p.angle}deg)`;
    const roll = pose.roll || 0;
    vehicle.style.transform = `rotateX(${roll}deg) rotateY(${Math.sin(roll * Math.PI / 180) * 12}deg)`;
    const heave = (front.value + rear.value) / 2;
    const pitch = Math.atan2(rear.value - front.value, g.size * .567) * 180 / Math.PI;
    shell.style.transform = `translateY(${heave}px) rotate(${pitch}deg)`;
    wheels.forEach(w => { w.style.transform = `translate(-50%, -50%) translateZ(${(w.dataset.side === 'near' ? 1 : -1) * (g.size * .09 + 1)}px) rotate(${wheelAngle}deg)`; });
    struts.forEach(s => {
      const displacement = s.classList.contains('front') ? front.value : rear.value;
      const anchor = g.size * .205 + displacement;
      s.style.top = `${anchor}px`; s.style.height = `${Math.max(5, g.size * .3 - anchor)}px`;
      s.style.transform = `translateX(-50%) translateZ(${(s.dataset.side === 'near' ? 1 : -1) * (g.size * .09 - 1)}px)`;
    });
    const boosting = performance.now() < boostUntil && driveAllowed();
    const launchJet = flight && flight.kind !== 'drop' && flight.elapsed < .18;
    vehicle.style.setProperty('--jet', String(media.matches ? 0 : flight ? Math.max(launchJet ? 1 : 0, clamp(flight.thrust / flight.gravity, 0, 1)) : 0));
    vehicle.style.setProperty('--boost', boosting ? '1' : '0');
    vehicle.style.setProperty('--adhesion', !flight && !press && Math.abs(Math.sin(p.angle * Math.PI / 360)) > .1 ? '.55' : '0');
    if (boostButton.getAttribute('aria-pressed') !== String(boosting)) boostButton.setAttribute('aria-pressed', String(boosting));
    const disabled = !visible || !!flight || media.matches;
    if (boostButton.disabled !== disabled) boostButton.disabled = disabled;
    const boostLabel = media.matches ? '모션 줄임' : flight ? '착지 중' : boosting ? '추진 중' : '부스트';
    if (boostButton.textContent !== boostLabel) boostButton.textContent = boostLabel;
    air.style.opacity = media.matches ? '0' : String(clamp((puffUntil - performance.now()) / 400, 0, .7));
    host.dataset.state = !visible ? 'hidden' : flight ? flight.phase : press ? press.dragged ? 'dragging' : 'charging' : driveAllowed() ? 'cruising' : 'parked';
    host.dataset.edgeAngle = String(Math.round(pose.angle));
    host.dataset.paused = String(paused);
    host.dataset.trick = flight?.kind || '';
    host.dataset.verticalVelocity = String(flight?.vy || 0);
    host.dataset.thrust = String(flight?.thrust || 0);
    host.dataset.speed = String(speed);
    host.dataset.particles = String(particles.length);
  }

  function drawTerrain() {
    terrain.setAttribute('width', String(innerWidth)); terrain.setAttribute('height', String(innerHeight));
    let path = '';
    for (let i = 0; i <= 240; i++) {
      const p = contain(g, trackPose(g, g.perimeter * i / 240));
      path += `${i ? 'L' : 'M'}${p.x - p.nx * g.carHeight * .43},${p.y - p.ny * g.carHeight * .43}`;
    }
    terrainPath.setAttribute('d', `${path}Z`);
    terrainPath.setAttribute('stroke', settings().color);
    terrainPath.setAttribute('stroke-width', String(settings().track));
    terrainPath.setAttribute('stroke-dasharray', settings().dash);
    terrainPath.setAttribute('opacity', environment === 'normal' ? '.12' : '.4');
  }
  function smoke(dt, now) {
    if (!context) return;
    const boosting = now < boostUntil && driveAllowed();
    const launchJet = flight && flight.kind !== 'drop' && flight.elapsed < .18;
    const power = flight ? Math.max(launchJet ? 2 : 0, clamp(flight.thrust / flight.gravity, 0, 3)) : boosting ? 1.7 : 0;
    if (!particles.length && power <= .1) {
      if (smokeDirty) context.clearRect(0, 0, innerWidth, innerHeight);
      smokeDirty = false; return;
    }
    smokeDirty = true;
    if (!media.matches && power > .1) {
      smokeCredit += dt * power * 36;
      const angle = pose.angle * Math.PI / 180;
      while (smokeCredit >= 1 && particles.length < 96) {
        smokeCredit--;
        const side = Math.random() < .5 ? -.23 : .23;
        const lx = boosting ? g.size * .48 : side * g.size;
        const ly = boosting ? g.carHeight * .1 : g.carHeight * .32;
        particles.push({ x: pose.x + Math.cos(angle) * lx - Math.sin(angle) * ly,
          y: pose.y + Math.sin(angle) * lx + Math.cos(angle) * ly,
          vx: (boosting ? Math.cos(angle) * 140 : (Math.random() - .5) * 55),
          vy: (boosting ? Math.sin(angle) * 140 : 110 + Math.random() * 80),
          age: 0, life: .65 + Math.random() * .6, radius: 3 + Math.random() * 4 });
      }
      smokeCredit = Math.min(smokeCredit, 2);
    } else smokeCredit = 0;
    context.clearRect(0, 0, innerWidth, innerHeight);
    particles = particles.filter(p => p.age < p.life);
    for (const p of particles) {
      p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= Math.exp(-dt * 1.7); p.vy -= 28 * dt;
      const floor = g.bottom + g.carHeight * .4;
      if (p.y > floor) { p.y = floor; p.vy = -8; p.vx += (p.x < pose.x ? -1 : 1) * 80 * dt; }
      const alpha = Math.max(0, (1 - p.age / p.life) * .8);
      const radius = p.radius + p.age * 22;
      const gradient = context.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
      gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
      gradient.addColorStop(.5, `rgba(248,253,255,${alpha * .7})`);
      gradient.addColorStop(1, 'rgba(238,248,255,0)');
      context.fillStyle = gradient; context.beginPath(); context.arc(p.x, p.y, radius, 0, Math.PI * 2); context.fill();
    }
  }
  function tick(now) {
    frame = 0;
    const dt = lastTime ? clamp((now - lastTime) / 1000, 0, .1) : 0;
    lastTime = now;
    if (flight) {
      flight = stepFlight(g, flight, dt);
      pose = { ...flight };
      if (flight.phase !== lastPhase) {
        lastPhase = flight.phase;
        announce(flight.lit ? '추진 착지 · 흰 연기와 함께 감속해요' : flight.phase === 'ascent' ? '추진 도약 · 중력이 속도를 줄여요' : '흡착 해제 · 중력으로 낙하해요');
      }
      if (flight.landed) {
        distance = bottomDistance(g, flight.x); flight = null; speed = 0;
        front.velocity = g.size * .52; rear.velocity = g.size * .4;
        puffUntil = now + 450;
        announce('착지 완료 · 에어서스가 충격을 흡수했어요');
      }
    } else if (press) {
      pose = contain(g, { ...press.pose, x: press.pose.x + press.dx, y: press.pose.y + press.dy });
    } else {
      if (driveAllowed()) {
        const desired = settings().speed * (now < boostUntil ? 3.5 : 1);
        const acceleration = settings().acceleration * (now < boostUntil ? 4 : 1);
        speed += clamp(desired - speed, -acceleration * dt, acceleration * dt);
        const travel = speed * dt;
        distance = mod(distance + travel, g.perimeter);
        wheelAngle -= travel / (g.size * .075) * 180 / Math.PI * (environment === 'mud' ? 1.4 : 1);
      } else speed = 0;
      pose = trackPose(g, distance);
    }
    const t = targets(now);
    front = spring(front, t.front, dt, settings()); rear = spring(rear, t.rear, dt, settings());
    smoke(dt, now);
    paint();
    if (active()) frame = requestAnimationFrame(tick); else lastTime = 0;
  }
  function launch(kind, velocity = {}) {
    if (flight || !visible) return;
    if (media.matches) { pose = trackPose(g, distance); paint(); announce('동작 줄이기 설정에 따라 회전과 점프를 생략했어요'); return; }
    flight = createFlight(g, pose, kind, velocity); lastPhase = ''; boostUntil = 0;
    kneelUntil = 0;
    announce(kind === 'kickflip' ? '킥플립 · 입체 회전 후 추진 착지해요' : kind === 'hop' ? '에어 홉 · 가볍게 튀어 올라요' : '흡착 해제 · 낙하 후 추진 착지해요');
    schedule();
  }
  function releaseCapture(pointerId) { if (car.hasPointerCapture?.(pointerId)) car.releasePointerCapture(pointerId); }
  function cancelGesture(recover = true) {
    if (!press) return;
    const held = press; press = null; releaseCapture(held.id);
    if (recover !== false && held.dragged && !document.hidden && !pageSuspended) {
      pose = contain(g, { ...held.pose, x: held.pose.x + held.dx, y: held.pose.y + held.dy });
      launch('drop');
    } else pose = trackPose(g, distance);
    paint(); schedule();
  }
  function settle() {
    cancelGesture(false);
    if (flight) distance = bottomDistance(g, pose.x);
    flight = null; kneelUntil = 0; boostUntil = 0; particles = []; speed = 0;
    if (context) context.clearRect(0, 0, innerWidth, innerHeight);
    smokeDirty = false;
    front = { value: heights[heightMode] * g.size, velocity: 0 }; rear = { ...front };
    pose = trackPose(g, distance); paint(); lastTime = 0;
  }
  function resize() {
    const progress = g ? distance / (g.perimeter || 1) : 0;
    const airborne = flight;
    const oldG = g;
    const safe = getComputedStyle(root.querySelector('.safe')), v = window.visualViewport;
    const viewport = { width: v?.width || document.documentElement.clientWidth, height: v?.height || innerHeight,
      left: v?.offsetLeft || 0, top: v?.offsetTop || 0 };
    const safeArea = {
      top: parseFloat(safe.paddingTop) || 0, right: parseFloat(safe.paddingRight) || 0,
      bottom: parseFloat(safe.paddingBottom) || 0, left: parseFloat(safe.paddingLeft) || 0,
    };
    const nextKey = JSON.stringify({ viewport, safeArea });
    if (nextKey === viewportKey) return;
    viewportKey = nextKey;
    g = geometry(viewport, safeArea);
    distance = progress * g.perimeter;
    settle();
    if (airborne && oldG && !media.matches) {
      const resizedPose = contain(g, { ...airborne, x: g.left + (airborne.x - oldG.left) * (g.right - g.left) / Math.max(1, oldG.right - oldG.left),
        y: g.top + (airborne.y - oldG.top) * (g.bottom - g.top) / Math.max(1, oldG.bottom - oldG.top) });
      flight = createFlight(g, resizedPose, 'drop', { x: airborne.vx, y: airborne.vy }); pose = { ...flight };
    }
    if (context) {
      const dpr = Math.min(devicePixelRatio || 1, 2, Math.sqrt(4000000 / (innerWidth * innerHeight)));
      canvas.width = Math.ceil(innerWidth * dpr); canvas.height = Math.ceil(innerHeight * dpr);
      canvas.style.width = `${innerWidth}px`; canvas.style.height = `${innerHeight}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    drawTerrain(); schedule();
  }
  car.addEventListener('pointerdown', e => {
    if (!e.isPrimary || e.button !== 0 || press) return;
    flight = null; boostUntil = 0; speed = 0;
    pose = { ...pose, roll: 0 };
    focusHeld = false;
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0, dragged: false, pose: { ...pose }, time: performance.now() };
    car.setPointerCapture(e.pointerId); schedule();
  });
  car.addEventListener('pointermove', e => {
    if (!press || press.id !== e.pointerId) return;
    press.dx = e.clientX - press.x; press.dy = e.clientY - press.y;
    press.dragged ||= Math.hypot(press.dx, press.dy) > 9;
    if (press.dragged) {
      stateLabel.textContent = '놓으면 중력 낙하 · 바닥에서 추진 착지';
    }
  });
  car.addEventListener('pointerup', e => {
    if (!press || press.id !== e.pointerId) return;
    const held = press;
    held.dx = e.clientX - held.x; held.dy = e.clientY - held.y;
    held.dragged ||= Math.hypot(held.dx, held.dy) > 9;
    const charged = performance.now() - held.time >= 420;
    pose = contain(g, { ...held.pose, x: held.pose.x + held.dx, y: held.pose.y + held.dy });
    press = null; releaseCapture(e.pointerId);
    if (held.dragged) launch('drop');
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
    if (key === 'escape' && !panel.hidden) { e.preventDefault(); setPanel(false); toggle.focus(); return; }
    if (['k', 'r', 'h', 'b', 'arrowup', 'arrowdown', 'escape'].includes(key)) e.preventDefault();
    if (key === 'k') launch('kickflip'); if (key === 'r') launch('ramp'); if (key === 'h') launch('hop');
    if (key === 'b') boost();
    if (key === 'arrowup') setHeight('high'); if (key === 'arrowdown') setHeight('low');
    if (key === 'escape') {
      paused = userPaused = true;
      if (flight || press?.dragged) {
        if (press) { const pointerId = press.id; press = null; releaseCapture(pointerId); }
        flight = createFlight(g, pose, 'drop', { y: Math.max(0, flight?.vy || 0) });
        announce('비상 착지 · 추진체가 안전하게 감속해요');
      } else { settle(); announce('자동차를 정차했어요'); }
      controls(); save(); schedule();
    }
  });
  toggle.addEventListener('click', () => {
    if (!visible) { visible = true; controls(); save(); paint(); schedule(); announce('자동차가 돌아왔어요'); }
    else setPanel(panel.hidden);
  });
  root.querySelector('.close').addEventListener('click', () => { setPanel(false); toggle.focus(); });
  root.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) { setPanel(false); toggle.focus(); } });
  root.querySelectorAll('[data-height]').forEach(b => b.addEventListener('click', () => setHeight(b.dataset.height)));
  root.querySelectorAll('[data-environment]').forEach(b => b.addEventListener('click', () => setEnvironment(b.dataset.environment)));
  boostButton.addEventListener('click', boost);
  root.querySelectorAll('[data-trick]').forEach(b => b.addEventListener('click', () => {
    setPanel(false); car.focus({ preventScroll: true }); launch(b.dataset.trick);
  }));
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
