/* A tiny, dependency-free visitor. Click the car to park or drive again. */
(() => {
  const id = 'lucas-roaming-car';
  if (document.getElementById(id)) return;

  const host = document.createElement('div');
  host.id = id;
  host.setAttribute('data-pagefind-ignore', '');
  // Shadow DOM keeps blog styles and the widget's styles independent.
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      :host { all: initial; position: fixed; inset: 0; z-index: 8; pointer-events: none; }
      button { position: absolute; left: 0; top: 0; width: 64px; height: 64px;
        display: grid; place-items: center; padding: 0; border: 0; border-radius: 50%;
        background: transparent; pointer-events: auto; cursor: pointer;
        touch-action: manipulation; -webkit-tap-highlight-color: transparent;
        will-change: transform; }
      button:focus-visible { outline: 2px solid #356780; outline-offset: 4px;
        background: #e9f1f5; }
      svg { width: 38px; height: 58px; overflow: visible;
        filter: drop-shadow(1px 3px 2px #14273338); }
      .park { opacity: 0; }
      [aria-pressed="true"] .park { opacity: 1; }
      @media print { :host { display: none; } }
    </style>
    <button type="button" aria-pressed="false" aria-label="자동차 멈추기" title="클릭하면 주차해요">
      <svg viewBox="0 0 44 72" aria-hidden="true" focusable="false">
        <g fill="#25333c">
          <rect x="1" y="13" width="7" height="13" rx="2"/>
          <rect x="36" y="13" width="7" height="13" rx="2"/>
          <rect x="1" y="48" width="7" height="13" rx="2"/>
          <rect x="36" y="48" width="7" height="13" rx="2"/>
        </g>
        <rect x="6" y="2" width="32" height="67" rx="12" fill="#66879b" stroke="#35566b" stroke-width="1.2"/>
        <path d="M10 12Q22 7 34 12L33 24H11Z" fill="#90acbc"/>
        <path d="M11 25Q22 20 33 25L31 34H13Z" fill="#203e50"/>
        <rect x="13" y="35" width="18" height="16" rx="4" fill="#7c9aaa"/>
        <path d="M13 53H31L33 60Q22 64 11 60Z" fill="#203e50"/>
        <path d="M8 29H11V51H8M33 29H36V51H33" fill="#bdd0da"/>
        <rect x="9" y="5" width="7" height="4" rx="1.5" fill="#fff4c5"/>
        <rect x="28" y="5" width="7" height="4" rx="1.5" fill="#fff4c5"/>
        <rect x="9" y="63" width="6" height="3" rx="1" fill="#eb8b79"/>
        <rect x="29" y="63" width="6" height="3" rx="1" fill="#eb8b79"/>
        <g class="park" transform="translate(30 48)">
          <circle r="9" fill="#f5f0e5" stroke="#35566b"/>
          <path d="M-2 5V-5H1C6-5 6 1 1 1H-2" fill="none" stroke="#35566b" stroke-width="2"/>
        </g>
      </svg>
    </button>`;
  document.body.append(host);

  const button = root.querySelector('button');
  const car = root.querySelector('svg');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const edge = 38; // Half the hit area plus a small gap, at every rotation.
  const speed = 48; // CSS pixels per second, independent of frame rate.
  let width = 0;
  let height = 0;
  let x = 0;
  let y = 0;
  let angle = -Math.PI * 0.7;
  let target = { x: 0, y: 0 };
  let parked = motion.matches;
  let focused = false;
  let frame = 0;
  let previous = 0;
  let nextTurn = 0;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const randomPoint = () => ({
    x: edge + Math.random() * Math.max(0, width - edge * 2),
    y: edge + Math.random() * Math.max(0, height - edge * 2),
  });
  const paint = () => {
    button.style.transform = `translate3d(${x - 32}px, ${y - 32}px, 0)`;
    car.style.transform = `rotate(${angle + Math.PI / 2}rad)`;
  };
  const resize = () => {
    width = document.documentElement.clientWidth;
    height = window.innerHeight;
    x = clamp(x, Math.min(edge, width / 2), Math.max(width / 2, width - edge));
    y = clamp(y, Math.min(edge, height / 2), Math.max(height / 2, height - edge));
    target = randomPoint();
    paint();
  };
  const updateLabel = () => {
    button.setAttribute('aria-pressed', String(parked));
    button.setAttribute('aria-label', parked ? '자동차 출발하기' : '자동차 멈추기');
    button.title = parked ? '클릭하면 출발해요' : '클릭하면 주차해요';
  };
  const tick = (time) => {
    frame = 0;
    const dt = previous ? Math.min((time - previous) / 1000, 0.05) : 0;
    previous = time;
    if (time > nextTurn || Math.hypot(target.x - x, target.y - y) < 35) {
      target = randomPoint();
      nextTurn = time + 3500 + Math.random() * 3000;
    }
    const desired = Math.atan2(target.y - y, target.x - x);
    const difference = Math.atan2(Math.sin(desired - angle), Math.cos(desired - angle));
    angle += clamp(difference, -1.7 * dt, 1.7 * dt);
    // Ease off on tight turns so the car doesn't spin at full speed.
    const distance = speed * dt * (1 - Math.min(Math.abs(difference) / Math.PI, 0.65));
    const nx = x + Math.cos(angle) * distance;
    const ny = y + Math.sin(angle) * distance;
    const left = Math.min(edge, width / 2);
    const right = Math.max(width / 2, width - edge);
    const top = Math.min(edge, height / 2);
    const bottom = Math.max(height / 2, height - edge);
    x = clamp(nx, left, right);
    y = clamp(ny, top, bottom);
    if (x !== nx || y !== ny) {
      if (x !== nx) angle = Math.PI - angle;
      if (y !== ny) angle = -angle;
      target = randomPoint();
    }
    paint();
    sync();
  };
  function sync() {
    const running = !parked && !focused && !document.hidden;
    if (running && !frame) frame = requestAnimationFrame(tick);
    if (!running) {
      cancelAnimationFrame(frame);
      frame = 0;
      previous = 0;
    }
  }
  button.addEventListener('click', () => {
    parked = !parked;
    updateLabel();
    sync();
  });
  // Keyboard users get a stationary target; pointer clicks can resume immediately.
  button.addEventListener('focus', () => {
    focused = button.matches(':focus-visible');
    sync();
  });
  button.addEventListener('blur', () => { focused = false; sync(); });
  motion.addEventListener('change', () => {
    parked = motion.matches;
    updateLabel();
    sync();
  });
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('pagehide', () => {
    cancelAnimationFrame(frame);
    frame = 0;
    previous = 0;
  });
  window.addEventListener('pageshow', sync);
  resize();
  x = Math.max(width / 2, width - edge - 12);
  y = Math.max(height / 2, height - edge - 12);
  paint();
  updateLabel();
  sync();
})();
