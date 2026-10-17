import { geometry, trackPose, contain, createFlight, stepFlight, bottomDistance, ENVIRONMENTS, spring, clamp, mod, tangent, stepDrive, cornerCrossed, releaseVelocity, resizeFlight, roadPath } from './car-dynamics.mjs?v=20261017-6';
import { BOOST_CHARGE_MS, isCarHome, chargedBoost, shouldRamp } from './car-controls.mjs?v=20261017-5';
import { PORTS, thrusterCommands } from './car-thrusters.mjs?v=20261017-6';

// Wall adhesion → release under gravity → stopping-distance landing jets.
const id = 'lucas-roaming-car';
if (isCarHome(location)) initialize();

export function initialize() {
  if (document.getElementById(id)) return;
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
      .volume, [data-side="far"], .side.far { visibility: hidden; }
      .car.rolling .volume, .car.rolling [data-side="far"], .car.rolling .side.far { visibility: visible; }
      .roof, .hood, .underbody { position: absolute; height: var(--depth); transform: translateY(-50%) rotateX(90deg);
        border: 0; border-radius: 5px; background: linear-gradient(90deg,#d4d8d6,#f8f5e9 30%,#e1e2d9); }
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
      .thruster { position: absolute; width: 4.5%; height: 4%; min-height: 2px;
        border: .5px solid #a0aeae; border-radius: 50%; background: #24333b;
        box-shadow: inset 0 .6px 0 #c0c9c5, 0 0 3px rgb(210 254 255 / var(--lit,0));
        transform: translate(-50%,-50%) translateZ(calc(var(--depth) / 2 + 1px)); }
      .thruster[data-side="far"] { transform: translate(-50%,-50%) translateZ(calc(var(--depth) / -2 - 1px)); }
      .thruster.fore, .thruster.aft { width: 2.2%; height: 7%; border-radius: 45%; }
      .thruster.roof { width: 4%; height: 3%; border-radius: 3px; }
      .effects, .terrain { position: absolute; left: 0; top: 0; pointer-events: none; }
      .effects { z-index: 1; } .terrain { z-index: 0; overflow: visible; }
      .terrain path { fill: none; stroke-linecap: round; stroke-linejoin: round; }
      .sr { position: absolute; width: 1px; height: 1px; overflow: hidden;
        clip-path: inset(50%); white-space: nowrap; }
      .safe { visibility: hidden; position: absolute;
        padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px)
          env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px); }
      .launcher { position: fixed; right: max(12px, env(safe-area-inset-right));
        bottom: max(10px, env(safe-area-inset-bottom)); display: flex; gap: 6px; z-index: 4; }
      .boost-button { position: relative;
        pointer-events: auto;
        min-width: 54px; min-height: 44px; padding: 8px 13px; border: 1px solid #a4b7be;
        border-radius: 24px; background: #f8f8f1; box-shadow: 0 2px 12px #19354316; font-weight: 500; }
      .boost-button { background: #284d61; color: #fff; border-color: #284d61; min-width: 104px;
        display: grid; gap: 2px; line-height: 1.3; overflow: hidden; }
      .boost-button::before { content: ''; position: absolute; inset: 0; background: #85e4ea;
        opacity: .35; transform: scaleX(var(--charge,0)); transform-origin: left; pointer-events: none; }
      .boost-button[data-full="true"] { box-shadow: 0 0 0 2px #a9edf2, 0 2px 12px #19354316; }
      .boost-label, .boost-hint { position: relative; }
      .boost-hint { font-size: 10px; font-weight: 400; opacity: .85; }
      .boost-button:disabled { opacity: .65; cursor: default; }
      .garage { position: fixed; right: max(12px, env(safe-area-inset-right));
        bottom: max(64px, calc(env(safe-area-inset-bottom) + 54px)); pointer-events: auto;
        width: min(296px, calc(100% - 24px)); max-height: calc(100vh - 100px); max-height: calc(100dvh - 100px);
        overflow-y: auto; overscroll-behavior: contain; padding: 12px; border: 1px solid #c0cdd0; border-radius: 18px; z-index: 4;
        background: #f8f8f1; box-shadow: 0 8px 32px #19354324; }
      .environments { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 0; }
      .environments button { min-height: 44px; border: 1px solid #bdcbd0; border-radius: 9px; background: transparent; text-align: left; padding: 6px 10px; }
      .environments small { display: block; font-size: 11px; color: #526c79; }
      .environments [aria-pressed="true"] { background: #e1ecee; border-color: #406c7e; }
      .boost-button { touch-action: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
      @media (max-height: 360px) { .garage { bottom: 58px; max-height: calc(100dvh - 72px); padding: 10px; } }
      @media print { :host { display: none; } }
    </style>
    <span class="safe" aria-hidden="true"></span>
    <svg class="terrain" aria-hidden="true"><path /></svg><canvas class="effects" aria-hidden="true"></canvas>
    <button class="car" type="button" aria-label="흰색 베라크루즈, 탭은 높이 전환, 더블탭은 킥플립" aria-describedby="car-help">
      <span class="vehicle" aria-hidden="true">
        <span class="shell">
          <span class="side near"><picture><source srcset="/images/widgets/veracruz-body.webp" type="image/webp" /><img class="body" src="/images/widgets/veracruz-body.png" alt="" width="960" height="332" draggable="false" /></picture></span>
          <span class="side far"><picture><source srcset="/images/widgets/veracruz-body.webp" type="image/webp" /><img class="body" src="/images/widgets/veracruz-body.png" alt="" width="960" height="332" draggable="false" /></picture></span>
          <span class="roof volume"></span><span class="hood volume"></span><span class="underbody volume"></span><span class="cap nose volume"></span><span class="cap tail volume"></span>
          ${['near', 'far'].map(side => PORTS.map(port => `<span class="thruster ${port.id}" data-port="${port.id}" data-side="${side}" style="left:${port.x * 100}%;top:${port.y * 100}%"></span>`).join('')).join('')}
        </span>
        <span class="bridge front volume"></span><span class="bridge rear volume"></span>
        <span class="strut front" data-side="near"></span><span class="strut rear" data-side="near"></span>
        <span class="strut front" data-side="far"></span><span class="strut rear" data-side="far"></span>
        <span class="wheel front" data-side="near"></span><span class="wheel rear" data-side="near"></span>
        <span class="wheel front" data-side="far"></span><span class="wheel rear" data-side="far"></span>
      </span>
    </button>
    <span id="car-help" class="sr">차량을 한 번 탭하면 차고 높이 전환, 더블탭하면 킥플립. 공중으로 끌어 놓으면 중력 낙하 후 추진 착지. 부스트는 누르고 놓기. 1초 풀차지에서만 램프 점프. 부스트를 위로 쓸면 주행 환경 선택. 키보드 Enter는 차고 높이, K는 킥플립, B는 일반 부스트. 부스트에 포커스한 채 Space 또는 Enter를 누르고 놓으면 충전, 아래 방향키는 환경 선택.</span>
    <span class="sr" role="status" aria-live="polite" aria-atomic="true"></span>
    <div class="launcher"><button class="boost-button" type="button" aria-label="부스트 · 1초 풀차지 후 놓으면 램프 점프" title="누르고 놓기 · 풀차지는 램프 점프 · 위로 쓸면 환경 선택" aria-describedby="car-help" aria-expanded="false" aria-controls="car-environments"><span class="boost-label">부스트</span><span class="boost-hint" aria-hidden="true">꾹 · 램프 / ↑ 환경</span></button></div>
    <section id="car-environments" class="garage" aria-label="주행 환경" hidden>
      <div class="environments" role="group" aria-label="주행 환경">
        <button type="button" data-environment="normal" aria-pressed="true">노말<small>균형 잡힌 주행</small></button>
        <button type="button" data-environment="sport" aria-pressed="false">스포츠<small>낮은 차고 · 빠른 응답</small></button>
        <button type="button" data-environment="offroad" aria-pressed="false">오프로드<small>높은 차고 · 부드러운 댐핑</small></button>
        <button type="button" data-environment="mud" aria-pressed="false">머드<small>낮은 접지 · 신중한 가속</small></button>
      </div>
    </section>`;
  document.body.append(host);
  const car = root.querySelector('.car'), vehicle = root.querySelector('.vehicle');
  const shell = root.querySelector('.shell'), wheels = root.querySelectorAll('.wheel');
  const struts = root.querySelectorAll('.strut'), boostButton = root.querySelector('.boost-button');
  const ports = root.querySelectorAll('.thruster');
  const boostLabel = root.querySelector('.boost-label'), boostHint = root.querySelector('.boost-hint');
  const canvas = root.querySelector('.effects'), context = canvas.getContext('2d');
  const terrain = root.querySelector('.terrain'), terrainPath = terrain.querySelector('path');
  const panel = root.querySelector('.garage'), live = root.querySelector('[role="status"]');
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const heights = { low: .028, ride: 0, high: -.034 };
  const names = { low: '낮은 차고', ride: '기본 차고', high: '높은 차고' };
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem('lj-veracruz-v1') || '{}') || {}; } catch { /* Optional storage. */ }
  let environment = Object.hasOwn(ENVIRONMENTS, stored.environment) ? stored.environment : 'normal';
  let heightMode = Object.hasOwn(heights, stored.height) ? stored.height : 'ride';
  let g, distance = 0, pose, flight = null, press = null, frame = 0, lastTime = 0, wheelAngle = 0;
  let front = { value: 0, velocity: 0 }, rear = { ...front };
  let speed = 0, acceleration = 0, boostStarted = null, boostElapsed = 0, boostProfile = null, pageSuspended = false;
  let particles = [], smokeCredit = new Map(), smokeDirty = false, viewportKey = '', lastPhase = '';
  let tapTimer = 0, lastTap = 0, boostPointer = null;
  const settings = () => ENVIRONMENTS[environment];
  const announce = message => { live.textContent = message; };
  function save() {
    // Retired pause/visibility preferences must not strand returning clients.
    try { localStorage.setItem('lj-veracruz-v1', JSON.stringify({ height: heightMode, environment })); } catch { /* Optional storage. */ }
  }
  function controls() {
    car.setAttribute('aria-label', `흰색 베라크루즈, ${names[heightMode]}, 탭은 높이 전환, 더블탭은 킥플립`);
    host.dataset.height = heightMode; host.dataset.environment = environment;
    root.querySelectorAll('[data-environment]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.environment === environment)));
  }
  function setPanel(open, keyboard = false) {
    panel.hidden = !open;
    boostButton.setAttribute('aria-expanded', String(open));
    if (open && keyboard) root.querySelector(`[data-environment="${environment}"]`).focus();
    if (open) announce('주행 환경 선택 · 자동차는 계속 달려요');
  }
  function setHeight(mode) {
    heightMode = mode; controls(); save(); announce(`${names[mode]}로 조절했어요`);
    if (media.matches) { front = { value: heights[mode] * g.size, velocity: 0 }; rear = { ...front }; }
    schedule();
  }
  function cycleHeight() { const list = ['ride', 'low', 'high']; setHeight(list[(list.indexOf(heightMode) + 1) % 3]); }
  function tap() {
    const now = performance.now();
    if (tapTimer && now - lastTap < 320) {
      clearTimeout(tapTimer); tapTimer = 0; lastTap = 0; launch('kickflip');
    } else {
      clearTimeout(tapTimer); lastTap = now;
      tapTimer = setTimeout(() => { tapTimer = 0; cycleHeight(); }, 320);
    }
  }
  function boost(heldMs = 0) {
    setPanel(false);
    if (media.matches) { announce('동작 줄이기 설정에 따라 급가속과 점프를 생략해요'); return; }
    if (flight || press?.dragged || boostStarted !== null) return;
    boostProfile = chargedBoost(heldMs);
    boostStarted = performance.now(); boostElapsed = 0;
    announce(boostProfile.full ? '풀차지 · 급가속 후 다음 코너에서 램프 점프' : '일반 부스트 · 점프 없이 가속해요'); schedule();
  }
  function clearBoostCharge() {
    const held = boostPointer; boostPointer = null;
    if (held?.id !== null && held?.id !== undefined && boostButton.hasPointerCapture?.(held.id)) boostButton.releasePointerCapture(held.id);
  }
  function beginBoostCharge(id, x = 0, y = 0) {
    if (boostPointer || flight || press?.dragged || boostStarted !== null) return;
    setPanel(false);
    boostPointer = { id, x, y, time: performance.now(), cancelled: false, environment: false, notified: false };
    if (id !== null) boostButton.setPointerCapture(id);
    announce(media.matches ? '동작 줄이기 · 위로 쓸면 환경 선택' : '부스트 충전 · 1초를 채우고 놓으면 램프 점프'); schedule();
  }
  function finishBoostCharge(cancelled = false) {
    if (!boostPointer) return;
    const held = boostPointer, duration = performance.now() - held.time;
    clearBoostCharge();
    if (!cancelled && !held.cancelled) boost(duration);
    schedule();
  }
  function driveAllowed() { return !media.matches && !flight && !press?.dragged; }
  function targets() {
    const base = heights[heightMode] * g.size;
    const rough = driveAllowed() ? settings().bump : 0;
    const nose = clamp(acceleration / (9.81 * g.size / 4.84), -.6, 2.8) * g.size * .018;
    const balance = flight ? clamp((flight.frontThrust - flight.rearThrust) * g.size * .007, -4, 4) : 0;
    return { front: base - nose - balance + Math.sin(distance / 12) * rough,
      rear: base + nose * .65 + balance + Math.sin(distance / 12 - 2) * rough };
  }
  function active() { return !document.hidden && !pageSuspended && !media.matches; }
  function schedule() {
    if (g && pose) paint();
    if (active() && !frame) frame = requestAnimationFrame(tick);
    if (!active() && frame) { cancelAnimationFrame(frame); frame = 0; lastTime = 0; }
  }
  function suspensionPose() {
    return { heave: (front.value + rear.value) / 2,
      pitch: Math.atan2(rear.value - front.value, g.size * .567) * 180 / Math.PI };
  }
  function paint() {
    const p = contain(g, pose), roll = pose.roll || 0;
    car.style.width = `${g.size}px`; car.style.height = `${g.carHeight}px`;
    car.style.setProperty('--depth', `${g.size * .18}px`);
    car.style.transform = `translate3d(${p.x - g.size / 2}px,${p.y - g.carHeight / 2}px,0) rotate(${p.angle}deg)`;
    car.classList.toggle('rolling', !!flight && flight.kind === 'kickflip' && roll > 1 && roll < 359);
    vehicle.style.transform = `rotateX(${roll}deg) rotateY(${Math.sin(roll * Math.PI / 180) * 10}deg)`;
    const suspension = suspensionPose(), { pitch } = suspension;
    shell.style.transform = `translateY(${suspension.heave}px) rotate(${pitch}deg)`;
    wheels.forEach(w => { w.style.transform = `translate(-50%,-50%) translateZ(${(w.dataset.side === 'near' ? 1 : -1) * (g.size * .09 + 1)}px) rotate(${wheelAngle}deg)`; });
    struts.forEach(s => {
      const anchor = g.size * .205 + (s.classList.contains('front') ? front.value : rear.value);
      s.style.top = `${anchor}px`; s.style.height = `${Math.max(5, g.size * .3 - anchor)}px`;
      s.style.transform = `translateX(-50%) translateZ(${(s.dataset.side === 'near' ? 1 : -1) * (g.size * .09 - 1)}px)`;
    });
    const boosting = boostStarted !== null && driveAllowed();
    const commands = thrusterCommands(g, { ...pose, ...p }, suspension, flight, boosting ? boostProfile?.power || 0 : 0);
    const levels = new Map(commands.map(c => [c.key, Math.min(1, c.power)]));
    ports.forEach(port => port.style.setProperty('--lit', String(levels.get(`${port.dataset.port}:${port.dataset.side === 'near' ? 1 : -1}`) || 0)));
    vehicle.style.setProperty('--adhesion', !flight && !press?.dragged && p.angle > 10 ? '.4' : '0');
    boostButton.disabled = !!flight || boostStarted !== null || !!press?.dragged;
    const charge = boostPointer && !boostPointer.cancelled ? clamp((performance.now() - boostPointer.time) / BOOST_CHARGE_MS, 0, 1) : 0;
    boostButton.style.setProperty('--charge', String(charge));
    boostButton.dataset.full = String(charge === 1);
    if (charge === 1 && !boostPointer.notified) { boostPointer.notified = true; announce('풀차지 완료 · 놓으면 램프 점프'); }
    const label = flight ? '착지 중' : boosting ? boostProfile?.full ? '램프 추진' : '부스트 중' : charge === 1 ? '풀차지' : charge > 0 ? `${Math.floor(charge * 100)}%` : '부스트';
    const hint = charge === 1 ? '놓으면 램프 점프' : charge > 0 ? '계속 누르면 램프' : '꾹 · 램프 / ↑ 환경';
    if (boostLabel.textContent !== label) boostLabel.textContent = label;
    if (boostHint.textContent !== hint) boostHint.textContent = hint;
    host.dataset.state = flight ? flight.phase : press?.dragged ? 'dragging' : media.matches ? 'reduced-motion' : 'cruising';
    Object.assign(host.dataset, { edgeAngle: String(pose.angle), trick: flight?.kind || '',
      verticalVelocity: String(flight?.vy || 0), thrust: String(flight?.thrust || 0),
      frontThrust: String(flight?.frontThrust || 0), rearThrust: String(flight?.rearThrust || 0),
      speed: String(speed), acceleration: String(acceleration), pitch: String(pitch),
      particles: String(particles.length), x: String(p.x), y: String(p.y),
      boostCharge: String(charge), boostKind: boosting ? boostProfile?.full ? 'ramp' : 'normal' : '',
      boostPower: String(boosting ? boostProfile?.power || 0 : 0), cornerRadius: String(g.radius),
      avoiding: String(flight?.avoiding || false),
      jetLeft: String(flight?.jets?.left || 0), jetRight: String(flight?.jets?.right || 0), jetUp: String(flight?.jets?.up || 0), jetDown: String(flight?.jets?.down || 0) });
  }
  function drawTerrain() {
    terrain.setAttribute('width', String(innerWidth)); terrain.setAttribute('height', String(innerHeight));
    terrainPath.setAttribute('d', roadPath(g)); terrainPath.setAttribute('stroke', settings().color);
    terrainPath.setAttribute('stroke-width', String(settings().track));
    terrainPath.setAttribute('stroke-dasharray', settings().dash);
    terrainPath.setAttribute('opacity', environment === 'normal' ? '.1' : '.35');
  }
  function smoke(dt) {
    if (!context) return;
    const boosting = boostStarted !== null && driveAllowed();
    const commands = thrusterCommands(g, { ...pose, ...contain(g, pose) }, suspensionPose(), flight, boosting ? boostProfile?.power || 0 : 0);
    if (!particles.length && !commands.length) {
      if (smokeDirty) context.clearRect(0, 0, innerWidth, innerHeight);
      smokeDirty = false; return;
    }
    smokeDirty = true;
    const activePorts = new Set(commands.map(c => c.key));
    for (const key of smokeCredit.keys()) if (!activePorts.has(key)) smokeCredit.delete(key);
    for (const command of commands) {
      let credit = Math.min((smokeCredit.get(command.key) || 0) + dt * command.power * 30, 4);
      while (credit >= 1 && particles.length < 96) {
        credit--;
        const exhaust = 90 + command.power * 45;
        particles.push({ x: command.x, y: command.y,
          vx: command.dx * exhaust + (flight?.vx || 0) * .15 + (Math.random() - .5) * 25,
          vy: command.dy * exhaust + (flight?.vy || 0) * .15 + (Math.random() - .5) * 25,
          age: 0, life: .5 + Math.random() * .4, radius: 2 + Math.random() * 3 });
      }
      smokeCredit.set(command.key, Math.min(credit, 2));
    }
    context.clearRect(0, 0, innerWidth, innerHeight);
    particles = particles.filter(p => p.age < p.life);
    for (const p of particles) {
      p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= Math.exp(-dt * 1.7); p.vy -= 20 * dt;
      const alpha = Math.max(0, (1 - p.age / p.life) * .8), radius = p.radius + p.age * 20;
      const gradient = context.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
      gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
      gradient.addColorStop(.5, `rgba(248,253,255,${alpha * .7})`);
      gradient.addColorStop(1, 'rgba(238,248,255,0)');
      context.fillStyle = gradient; context.beginPath(); context.arc(p.x, p.y, radius, 0, Math.PI * 2); context.fill();
    }
    for (const command of commands) {
      const length = g.size * .13 * Math.sqrt(command.power);
      const x = command.x + command.dx * length, y = command.y + command.dy * length;
      const core = context.createLinearGradient(command.x, command.y, x, y);
      core.addColorStop(0, 'rgba(247,255,255,.95)'); core.addColorStop(1, 'rgba(235,252,255,0)');
      context.strokeStyle = core; context.lineWidth = Math.max(1, g.size * .016 * Math.sqrt(command.power));
      context.lineCap = 'round'; context.beginPath(); context.moveTo(command.x, command.y); context.lineTo(x, y); context.stroke();
    }
  }
  function tick(now) {
    frame = 0;
    const dt = lastTime ? clamp((now - lastTime) / 1000, 0, .1) : 0;
    lastTime = now;
    if (flight) {
      acceleration = 0; flight = stepFlight(g, flight, dt); pose = { ...flight };
      wheelAngle -= Math.hypot(flight.vx, flight.vy) * dt / (g.size * .075) * 180 / Math.PI;
      if (flight.phase !== lastPhase) {
        lastPhase = flight.phase;
        announce(flight.lit ? '전후륜 추진체로 균형을 잡으며 착지해요' : flight.phase === 'ascent' ? '도약 · 중력이 속도를 줄여요' : '중력 낙하');
      }
      if (flight.landed) {
        distance = bottomDistance(g, flight.x); speed = Math.max(0, -flight.vx); flight = null;
        front.velocity += g.size * .45; rear.velocity += g.size * .34;
        announce('착지 완료 · 에어서스펜션으로 충격을 흡수했어요');
      }
    } else if (press?.dragged) {
      acceleration = 0;
      pose = contain(g, { ...press.pose, x: press.pose.x + press.dx, y: press.pose.y + press.dy });
    } else if (driveAllowed()) {
      const before = distance, next = stepDrive(g, { distance, speed }, dt, settings(), boostStarted !== null ? boostProfile.power : false);
      distance = next.distance; speed = next.speed; acceleration = next.acceleration;
      wheelAngle -= next.travel / (g.size * .075) * 180 / Math.PI * (environment === 'mud' ? 1.35 : 1);
      pose = trackPose(g, distance);
      if (boostStarted !== null) {
        boostElapsed += dt;
        if (shouldRamp(boostProfile, boostElapsed, cornerCrossed(g, before, next.travel))) launch('ramp');
        else if (!boostProfile.full && boostElapsed >= boostProfile.duration) { boostStarted = null; boostProfile = null; }
      }
    }
    const t = targets();
    front = spring(front, t.front, dt, settings()); rear = spring(rear, t.rear, dt, settings());
    smoke(dt); paint();
    if (active()) frame = requestAnimationFrame(tick); else lastTime = 0;
  }
  function launch(kind, velocity) {
    clearBoostCharge();
    if (media.matches) { announce('동작 줄이기 설정에 따라 회전과 점프를 생략해요'); return; }
    if (!velocity) {
      velocity = flight ? { x: flight.vx, y: flight.vy } : tangent(pose, speed * (kind === 'ramp' ? .8 : .6));
      velocity.x += (pose.nx || 0) * g.size * .8;
      velocity.y += (pose.ny || 0) * g.size * .8;
    }
    flight = createFlight(g, pose, kind, velocity); lastPhase = '';
    boostStarted = null; boostProfile = null; acceleration = 0;
    announce(kind === 'kickflip' ? '킥플립 · 입체 회전 후 균형 착지' : kind === 'ramp' ? '램프 점프 · 관성 도약 후 추진 착지' : '중력 낙하 · 추진 착지');
    schedule();
  }
  function releaseCapture(pointerId) { if (car.hasPointerCapture?.(pointerId)) car.releasePointerCapture(pointerId); }
  function finishGesture(e, cancelled = false) {
    if (!press || press.id !== e.pointerId) return;
    const held = press; press = null; releaseCapture(held.id);
    if (held.dragged) {
      pose = contain(g, { ...held.pose, x: held.pose.x + held.dx, y: held.pose.y + held.dy });
      launch('drop', cancelled ? { x: 0, y: 0 } : releaseVelocity(held.samples, performance.now(), g.size));
    } else if (!cancelled) tap();
    schedule();
  }
  function resize() {
    const oldG = g, progress = g ? distance / (g.perimeter || 1) : 0;
    const safe = getComputedStyle(root.querySelector('.safe')), v = window.visualViewport;
    const viewport = { width: v?.width || document.documentElement.clientWidth, height: v?.height || innerHeight,
      left: v?.offsetLeft || 0, top: v?.offsetTop || 0 };
    const safeArea = { top: parseFloat(safe.paddingTop) || 0, right: parseFloat(safe.paddingRight) || 0,
      bottom: parseFloat(safe.paddingBottom) || 0, left: parseFloat(safe.paddingLeft) || 0 };
    const key = JSON.stringify({ viewport, safeArea });
    if (key === viewportKey) return;
    if (press?.dragged && oldG) flight = createFlight(oldG, pose, 'drop');
    viewportKey = key; g = geometry(viewport, safeArea); distance = progress * g.perimeter;
    if (press) { const held = press; press = null; releaseCapture(held.id); }
    if (flight && oldG) {
      flight = resizeFlight(g, oldG, flight);
      pose = { ...flight };
    } else pose = trackPose(g, distance);
    if (context) {
      const dpr = Math.min(devicePixelRatio || 1, 2, Math.sqrt(4000000 / (innerWidth * innerHeight)));
      canvas.width = Math.ceil(innerWidth * dpr); canvas.height = Math.ceil(innerHeight * dpr);
      canvas.style.width = `${innerWidth}px`; canvas.style.height = `${innerHeight}px`; context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    drawTerrain(); lastTime = 0; schedule();
  }
  car.addEventListener('pointerdown', e => {
    if (!e.isPrimary || e.button !== 0 || press || media.matches) return;
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0, dragged: false,
      pose: { ...pose }, samples: [{ x: e.clientX, y: e.clientY, time: performance.now() }] };
    car.setPointerCapture(e.pointerId);
  });
  car.addEventListener('pointermove', e => {
    if (!press || press.id !== e.pointerId) return;
    press.dx = e.clientX - press.x; press.dy = e.clientY - press.y;
    if (!press.dragged && Math.hypot(press.dx, press.dy) > 9) {
      clearTimeout(tapTimer); tapTimer = 0;
      press.dragged = true; press.pose = { ...pose, roll: 0 }; flight = null; boostStarted = null;
    }
    press.samples.push({ x: e.clientX, y: e.clientY, time: performance.now() });
    press.samples = press.samples.slice(-12); schedule();
  });
  car.addEventListener('pointerup', e => finishGesture(e));
  car.addEventListener('pointercancel', e => finishGesture(e, true));
  car.addEventListener('lostpointercapture', e => finishGesture(e, true));
  car.addEventListener('contextmenu', e => e.preventDefault());
  car.addEventListener('dblclick', e => e.preventDefault());
  car.addEventListener('click', e => { if (e.detail === 0 || !window.PointerEvent || media.matches) cycleHeight(); });
  car.addEventListener('keydown', e => {
    if (e.repeat) return;
    const key = e.key.toLowerCase();
    if (['k', 'b', 'arrowup', 'arrowdown'].includes(key)) e.preventDefault();
    if (key === 'k') launch('kickflip'); if (key === 'b') boost();
    if (key === 'arrowup') setHeight('high'); if (key === 'arrowdown') setHeight('low');
  });
  boostButton.addEventListener('pointerdown', e => {
    if (!e.isPrimary || e.button !== 0) return;
    beginBoostCharge(e.pointerId, e.clientX, e.clientY);
  });
  boostButton.addEventListener('pointermove', e => {
    if (!boostPointer || boostPointer.id !== e.pointerId || boostPointer.cancelled) return;
    const dx = e.clientX - boostPointer.x, dy = e.clientY - boostPointer.y;
    if (dy < -22 && Math.abs(dy) > Math.abs(dx)) {
      boostPointer.cancelled = true; boostPointer.environment = true; setPanel(true);
    } else if (Math.abs(dx) > 24 || dy > 24) {
      boostPointer.cancelled = true; announce('부스트 충전을 취소했어요');
    }
    schedule();
  });
  boostButton.addEventListener('pointerup', e => { if (boostPointer?.id === e.pointerId) finishBoostCharge(); });
  boostButton.addEventListener('pointercancel', () => finishBoostCharge(true));
  boostButton.addEventListener('lostpointercapture', () => finishBoostCharge(true));
  boostButton.addEventListener('click', e => { if (e.detail === 0) boost(); });
  boostButton.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (!boostPointer || e.button === 2) { clearBoostCharge(); setPanel(true); schedule(); }
  });
  boostButton.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!e.repeat) beginBoostCharge(null); }
    if (e.key === 'ArrowDown') { e.preventDefault(); clearBoostCharge(); setPanel(true, true); schedule(); }
  });
  boostButton.addEventListener('keyup', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (boostPointer?.id === null) finishBoostCharge(); }
  });
  boostButton.addEventListener('blur', () => { if (boostPointer?.id === null) { finishBoostCharge(true); } });
  root.querySelectorAll('[data-environment]').forEach(b => b.addEventListener('click', () => {
    environment = b.dataset.environment; setHeight(settings().height); drawTerrain(); setPanel(false); boostButton.focus({ preventScroll: true });
    announce(`${settings().label} · ${names[heightMode]} · 계속 주행해요`);
  }));
  root.addEventListener('keydown', e => {
    if (e.key === 'Escape' && boostPointer) { finishBoostCharge(true); announce('부스트 충전을 취소했어요'); }
    if (e.key === 'Escape' && !panel.hidden) { e.preventDefault(); setPanel(false); boostButton.focus({ preventScroll: true }); }
    if (!panel.hidden && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && e.target.matches('[data-environment]')) {
      e.preventDefault(); const buttons = [...root.querySelectorAll('[data-environment]')];
      buttons[mod(buttons.indexOf(e.target) + (['ArrowLeft', 'ArrowUp'].includes(e.key) ? -1 : 1), 4)].focus();
    }
  });
  document.addEventListener('pointerdown', e => {
    if (!panel.hidden && !e.composedPath().includes(panel) && !e.composedPath().includes(boostButton)) setPanel(false);
  }, { passive: true });
  const suspend = () => {
    clearTimeout(tapTimer); tapTimer = 0; clearBoostCharge();
    if (press) finishGesture({ pointerId: press.id }, true);
    particles = []; smokeCredit.clear();
    context?.clearRect(0, 0, innerWidth, innerHeight); lastTime = 0; schedule();
  };
  const motionChanged = () => {
    if (media.matches) {
      if (press) { const held = press; press = null; releaseCapture(held.id); }
      flight = null; boostStarted = null; boostProfile = null; speed = 0; acceleration = 0; pose = trackPose(g, distance); suspend();
    }
    schedule();
  };
  if (media.addEventListener) media.addEventListener('change', motionChanged); else media.addListener(motionChanged);
  document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); else { lastTime = 0; schedule(); } });
  window.addEventListener('resize', resize, { passive: true });
  window.visualViewport?.addEventListener('resize', resize, { passive: true });
  window.visualViewport?.addEventListener('scroll', resize, { passive: true });
  window.addEventListener('pagehide', () => { pageSuspended = true; suspend(); });
  window.addEventListener('pageshow', () => { pageSuspended = false; lastTime = 0; schedule(); });
  root.querySelector('img').addEventListener('error', () => {
    pageSuspended = true; car.hidden = true; boostButton.hidden = true; suspend();
    announce('자동차 그림을 불러오지 못했어요');
  });
  resize(); controls(); save(); paint(); schedule();
}
