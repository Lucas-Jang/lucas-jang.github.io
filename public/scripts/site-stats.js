(() => {
  const counterOrigin = 'https://lucasjang.goatcounter.com';
  const totalPath = 'TOTAL';
  const formatter = new Intl.NumberFormat('ko-KR');

  const isLikelyBot = () => (
    Boolean(window.callPhantom || window._phantom || window.phantom || window.__nightmare)
    || Boolean(
      document.__selenium_unwrapped
      || document.__webdriver_evaluate
      || document.__driver_evaluate
      || navigator.webdriver
    )
  );

  const isLocalHost = () => (
    location.protocol === 'file:'
    || /^(localhost|127\.|10\.|192\.168\.|0\.0\.0\.0$)/.test(location.hostname)
    || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(location.hostname)
  );

  const optedOut = () => {
    try {
      return localStorage.getItem('skipgc') === 't';
    } catch {
      return false;
    }
  };

  const shouldSkipTracking = () => (
    isLikelyBot()
    || isLocalHost()
    || (window.self !== window.top)
    || optedOut()
  );

  const trackingUrl = ({ path, title, referrer }) => {
    const url = new URL(`${counterOrigin}/count`);
    url.searchParams.set('p', path);
    url.searchParams.set('t', title);
    if (referrer) url.searchParams.set('r', referrer);
    url.searchParams.set('s', String(window.screen.width));
    url.searchParams.set('rnd', Math.random().toString(36).slice(2, 7));
    return url;
  };

  const sendCount = (details) => {
    if (shouldSkipTracking()) return false;

    const url = trackingUrl(details);
    if (navigator.sendBeacon?.(url)) return true;

    const pixel = new Image(1, 1);
    pixel.alt = '';
    pixel.referrerPolicy = 'strict-origin-when-cross-origin';
    pixel.src = url;
    return true;
  };

  const parseCount = (value) => {
    const count = Number.parseInt(String(value ?? '').replace(/[^0-9]/g, ''), 10);
    return Number.isFinite(count) ? count : null;
  };

  const counterUrl = (path, params = {}) => {
    const url = new URL(`${counterOrigin}/counter/${encodeURIComponent(path)}.json`);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    return url;
  };

  const readCount = async (path, params) => {
    const response = await fetch(counterUrl(path, params), {
      credentials: 'omit',
      mode: 'cors',
    });
    if (!response.ok) return null;
    const data = await response.json();
    return parseCount(data.count);
  };

  const setStat = (name, count) => {
    if (count === null) return;
    document.querySelectorAll(`[data-stat="${name}"]`).forEach((element) => {
      element.textContent = formatter.format(count);
    });
  };

  const kstDate = () => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const value = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return `${value.year}-${value.month}-${value.day}`;
  };

  const loadStats = async () => {
    sendCount({
      path: `${location.pathname}${location.search}`,
      title: document.title,
      referrer: document.referrer,
    });
    const today = kstDate();
    const pageviewElement = document.querySelector('[data-stat="pageviews"][data-path]');
    const tasks = [
      readCount(totalPath).then((count) => setStat('visitors', count)),
      readCount(totalPath, { start: today, end: today }).then((count) => setStat('today', count)),
    ];

    if (pageviewElement?.dataset.path) {
      tasks.push(
        readCount(pageviewElement.dataset.path).then((count) => setStat('pageviews', count)),
      );
    }

    await Promise.allSettled(tasks);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadStats, { once: true });
  } else {
    loadStats();
  }
})();
