(() => {
  const counterOrigin = 'https://lucasjang.goatcounter.com';
  const totalPath = 'TOTAL';
  const formatter = new Intl.NumberFormat('ko-KR');
  const priorities = new Map();
  const utcDate = () => new Date().toISOString().slice(0, 10);
  const trackingPath = () => {
    const path = location.pathname.replace(/\/+$/, '') || '/';
    const category = new URLSearchParams(location.search).get('category');
    return path === '/' && ['DEV', 'ENGLISH', 'BJJ', 'DIVE', 'DISTILL', 'LIFE'].includes(category)
      ? `/?category=${category}` : path;
  };

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
    try {
      if (navigator.sendBeacon?.(url)) return true;
    } catch {
      // A browser policy can reject the beacon synchronously; retain the pixel fallback.
    }

    const pixel = new Image(1, 1);
    pixel.alt = '';
    pixel.referrerPolicy = 'strict-origin-when-cross-origin';
    pixel.setAttribute('aria-hidden', 'true');
    pixel.style.cssText = 'position:absolute;width:1px;height:1px;bottom:0;pointer-events:none';
    const remove = () => pixel.remove();
    pixel.addEventListener('load', remove, { once: true });
    pixel.addEventListener('error', remove, { once: true });
    pixel.src = url;
    document.body.appendChild(pixel);
    return true;
  };

  const parseCount = (value) => {
    const text = String(value ?? '').trim();
    if (!/^(?:\d+|\d{1,3}(?:[.,\s]\d{3})+)$/.test(text)) return null;
    const count = Number(text.replace(/[.,\s]/g, ''));
    return Number.isSafeInteger(count) && count >= 0 ? count : null;
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
      signal: globalThis.AbortSignal?.timeout?.(8000),
    });
    // GoatCounter returns a valid zero-valued JSON counter with 404 for an unseen path.
    if (!response.ok && response.status !== 404) return null;
    const data = await response.json();
    return parseCount(data.count);
  };

  const setStat = (name, count, priority = 2, updatedAt) => {
    if (count === null) return;
    if ((priorities.get(name) ?? 0) > priority) return;
    priorities.set(name, priority);
    document.querySelectorAll(`[data-stat="${name}"]`).forEach((element) => {
      element.textContent = formatter.format(count);
      element.title = updatedAt
        ? `저장된 집계 · ${new Date(updatedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} KST · 4시간 이상 지연될 수 있습니다.`
        : 'GoatCounter 방문 집계 · 최대 4시간 지연될 수 있습니다.';
    });
  };

  const readSnapshot = async (today, path) => {
    const response = await fetch('/data/goatcounter.json', {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: globalThis.AbortSignal?.timeout?.(8000),
    });
    if (!response.ok) return null;

    const data = await response.json();
    setStat('visitors', parseCount(data.total), 1, data.totalUpdatedAt ?? data.generatedAt);
    if (utcDate() === today && data.today?.date === today && data.today.timeZone === 'UTC') {
      setStat('today', parseCount(data.today.count), 1, data.today.updatedAt ?? data.generatedAt);
    }
    if (path) setStat('pageviews', parseCount(data.pageviews?.[path]), 1, data.pageviewsUpdatedAt?.[path] ?? data.generatedAt);
  };

  const refreshStats = async () => {
    const today = utcDate();
    priorities.clear();
    const pageviewElement = document.querySelector('[data-stat="pageviews"][data-path]');
    const path = pageviewElement?.dataset.path?.replace(/\/+$/, '') || null;
    const tasks = [
      readSnapshot(today, path),
      readCount(totalPath).then((count) => setStat('visitors', count)),
      // Public counters parse dates at UTC midnight. An equal end date only includes
      // that first hour, not the day. An open end includes all processed visits today.
      readCount(totalPath, { start: today }).then((count) => {
        if (utcDate() === today) setStat('today', count);
      }),
    ];

    if (path) tasks.push(readCount(path).then((count) => setStat('pageviews', count)));

    await Promise.allSettled(tasks);
  };

  const loadStats = () => {
    let counted = false;
    let lastRefresh = 0;
    let date = utcDate();
    const onVisible = () => {
      if (document.visibilityState && document.visibilityState !== 'visible') return;
      if (!counted) {
        counted = true;
        sendCount({ path: trackingPath(), title: document.title, referrer: document.referrer });
      }
      if (date !== utcDate()) {
        date = utcDate();
        document.querySelectorAll('[data-stat="today"]').forEach((element) => { element.textContent = '—'; });
        lastRefresh = 0;
      }
      if (!lastRefresh || Date.now() - lastRefresh >= 5 * 60 * 1000) {
        lastRefresh = Date.now();
        void refreshStats();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onVisible);
    setInterval(onVisible, 60 * 1000);
    onVisible();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadStats, { once: true });
  } else {
    loadStats();
  }
})();
