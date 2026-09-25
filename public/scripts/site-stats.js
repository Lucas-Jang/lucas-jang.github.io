(() => {
  const counterOrigin = 'https://lucasjang.goatcounter.com';
  const visitorPath = '/visitors';
  const formatter = new Intl.NumberFormat('ko-KR');

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
    const data = await response.json();
    const count = parseCount(data.count);
    if (!response.ok && count === null) throw new Error('Counter unavailable');
    return count;
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

  const countVisitor = () => new Promise((resolve) => {
    let attempts = 0;
    const waitForCounter = window.setInterval(() => {
      attempts += 1;
      if (window.goatcounter?.count) {
        window.clearInterval(waitForCounter);
        window.goatcounter.count({ path: visitorPath, title: 'Site visitor', referrer: '' });
        resolve();
      } else if (attempts >= 20) {
        window.clearInterval(waitForCounter);
        resolve();
      }
    }, 150);
  });

  const loadStats = async () => {
    await countVisitor();

    const today = kstDate();
    const pageviewElement = document.querySelector('[data-stat="pageviews"][data-path]');
    const tasks = [
      readCount(visitorPath).then((count) => setStat('visitors', count)),
      readCount(visitorPath, { start: today, end: today }).then((count) => setStat('today', count)),
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
