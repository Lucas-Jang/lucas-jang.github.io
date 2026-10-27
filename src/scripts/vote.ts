import { aggregate, countdown, dateLabel, guestGreeting, normalizeGuestName, sameVote, validDates, VOTE_DEADLINE } from '../lib/vote-model.mjs';
import { VOTE_API } from '../lib/vote-api';

type Vote = { id: string; name: string; dates: number[]; updatedAt: string };
type Snapshot = { votes: Vote[]; ownId: string | null; serverTime?: string; deadlineAt?: string; closed?: boolean };
type Screen = 'cover' | 'name' | 'welcome' | 'calendar' | 'done';
type Reply = { ok?: boolean; error?: string; code?: string; serverTime?: string; deadlineAt?: string };
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const nameInput = $<HTMLInputElement>('voter-name');
const saveButton = $<HTMLButtonElement>('save-button');
const dayButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-day]')];
const storage = { key: 'november-2026-vote-key', draft: 'november-2026-vote-draft' };
let token = '', storageReady = true, initialized = false, busy = false, connected = false;
let snapshot: Snapshot = { votes: [], ownId: null };
let selected = new Set<number>();
let screen: Screen = 'cover', mode: 'select' | 'results' = 'select', detailDay: number | null = null;
let guestName = '', nameTouched = false, datesTouched = false, requestSequence = 0;
let compactName = false;
let saved = { name: '', dates: [] as number[] }, hasVote = false;
let clockAnchor: { server: number; tick: number } | null = null, deadline = VOTE_DEADLINE, serverClosed = false, previouslyClosed = false;
let toastTimer: ReturnType<typeof setTimeout>;
function setText(id: string, value: string) { const el = $(id); if (el.textContent !== value) el.textContent = value; }
const now = () => clockAnchor ? clockAnchor.server + performance.now() - clockAnchor.tick : Date.now();
const isClosed = () => serverClosed || countdown(now(), deadline).closed;
const draft = () => ({ name: normalizeGuestName(nameInput.value), dates: [...selected].sort((a, b) => a - b) });
const isDirty = () => !sameVote(draft(), saved);

try {
  token = localStorage.getItem(storage.key) || '';
  if (!/^[a-f0-9]{64}$/.test(token)) {
    token = [...crypto.getRandomValues(new Uint8Array(32))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(storage.key, token);
  }
} catch { storageReady = false; }
if (storageReady) {
  try {
    const value = JSON.parse(localStorage.getItem(storage.draft) || 'null');
    if (value && typeof value.name === 'string' && value.name.length <= 24 && validDates(value.dates)) {
      nameInput.value = value.name; selected = new Set(value.dates);
    } else if (value) localStorage.removeItem(storage.draft);
  } catch { try { localStorage.removeItem(storage.draft); } catch { /* Preserve the session. */ } }
}
function rememberDraft() {
  if (storageReady) { try { localStorage.setItem(storage.draft, JSON.stringify(draft())); } catch { /* The selection remains in memory. */ } }
}
function notify(message: string) {
  setText('toast', message); $('toast').hidden = false; clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500);
}
function connectionError(message: string) { setText('connection-message', message); $('connection-notice').hidden = false; }
function syncClock(data: Reply | Snapshot) {
  if (data.serverTime && Number.isFinite(Date.parse(data.serverTime))) clockAnchor = { server: Date.parse(data.serverTime), tick: performance.now() };
  if (data.deadlineAt && Number.isFinite(Date.parse(data.deadlineAt))) deadline = Date.parse(data.deadlineAt);
  if ('closed' in data) serverClosed = !!data.closed;
}
async function request(method: 'GET' | 'POST', body?: unknown) {
  let response: Response;
  try {
    response = await fetch(VOTE_API, { method, mode: 'cors', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  } catch { throw new Error('답장이 잠깐 길을 잃었어요. 선택은 그대로 두었으니, 다시 연결해 주세요.'); }
  const payload = await response.json() as Reply & Snapshot;
  if (method === 'POST' || !response.ok) syncClock(payload);
  if (!response.ok) {
    if (payload.code === 'VOTING_CLOSED') serverClosed = true;
    throw new Error(payload.error || '답장을 보내지 못했어요. 잠시 후 다시 시도해 주세요.');
  }
  return payload;
}
function showScreen(next: Screen, focus = true) {
  screen = next;
  fitViewport();
  for (const name of ['cover', 'name', 'welcome', 'calendar', 'done']) $(`${name}-screen`).hidden = name !== next;
  document.querySelector<HTMLElement>('.header-note')!.hidden = next !== 'cover';
  $('back-button').hidden = next === 'cover';
  setText('step-counter', ({ cover: 'OPEN ME', name: '01 / 04', welcome: '02 / 04', calendar: '03 / 04', done: '04 / 04' })[next]);
  $('toast').hidden = true;
  render();
  if (focus) requestAnimationFrame(() => {
    const title = $(`${next === 'calendar' ? 'calendar' : next === 'welcome' ? 'welcome' : next === 'name' ? 'name' : next === 'done' ? 'done' : 'cover'}-title`);
    title.focus({ preventScroll: true });
  });
}
async function refresh(initial = false) {
  if (busy || !storageReady) return;
  const sequence = ++requestSequence;
  try {
    const result = await request('GET');
    if (!Array.isArray(result.votes) || !result.votes.every(v => typeof v.id === 'string' && typeof v.name === 'string' && validDates(v.dates))) throw new Error('답장함을 열지 못했어요. 잠시 후 다시 연결해 주세요.');
    if (sequence !== requestSequence || busy) return;
    syncClock(result); snapshot = result; connected = true; $('connection-notice').hidden = true;
    const own = result.votes.find(v => v.id === result.ownId);
    hasVote = !!own;
    if (initial || !initialized) {
      saved = own ? { name: own.name, dates: own.dates } : { name: '', dates: [] };
      let hasDraft = false; try { hasDraft = !!localStorage.getItem(storage.draft); } catch { /* Storage is unavailable. */ }
      if (own && !hasDraft) { if (!nameTouched) nameInput.value = own.name; if (!datesTouched) selected = new Set(own.dates); }
      initialized = true;
    }
    render();
  } catch (error) {
    if (sequence !== requestSequence) return;
    connected = false;
    connectionError(error instanceof Error ? error.message : '답장함 연결이 잠깐 끊겼어요. 다시 연결해 주세요.'); renderControls();
  }
}
function renderWelcome() {
  const greeting = guestGreeting(guestName || nameInput.value);
  setText('welcome-name', `${greeting.name} 님, 잘 오셨어요.`);
  setText('welcome-title', greeting.title); setText('welcome-message', greeting.message); setText('welcome-note', greeting.note);
  setText('welcome-stamp', greeting.listed ? '명단\n확인' : '특별\n환영');
  setText('go-calendar', isClosed() ? '모인 일정 보러 가기 →' : '이제, 만날 날을 골라볼까요? →');
}
function renderCalendar() {
  const { counts, max, best } = aggregate(snapshot.votes), closed = isClosed();
  setText('calendar-guest', `${guestName || nameInput.value || '당신'} 님의 자리를 생각하며`);
  $('select-view').setAttribute('aria-pressed', String(mode === 'select'));
  $('results-view').setAttribute('aria-pressed', String(mode === 'results'));
  setText('calendar-instruction', mode === 'select' ? closed ? '회신이 마감됐어요. 함께할 날을 기다려 주세요.' : '가능한 날을 모두 눌러 주세요. 다시 누르면 취소돼요.' : '날짜를 누르면, 함께할 수 있는 사람을 보여드려요.');
  $('clear-button').hidden = mode !== 'select' || closed; $('refresh-button').hidden = mode !== 'results';
  dayButtons.forEach(button => {
    const day = Number(button.dataset.day), count = counts[day - 1], chosen = selected.has(day);
    button.classList.toggle('selected', mode === 'select' && chosen);
    button.classList.toggle('has-count', mode === 'results' && count > 0);
    button.classList.toggle('is-best', mode === 'results' && best.includes(day));
    button.classList.toggle('is-detail', mode === 'results' && detailDay === day);
    button.style.backgroundColor = mode === 'results' && count ? `rgba(164,78,56,${.04 + count / Math.max(max, 1) * .12})` : '';
    button.setAttribute('aria-pressed', String(mode === 'select' ? chosen : detailDay === day));
    button.setAttribute('aria-label', `${dateLabel(day)}, ${mode === 'select' ? chosen ? '선택됨' : '선택 안 됨' : `${count}명 가능`}`);
    button.querySelector('.day-count')!.textContent = mode === 'results' && count ? `${count}명` : '';
  });
  if (mode === 'results') {
    if (detailDay !== null) {
      const names = snapshot.votes.filter(v => v.dates.includes(detailDay!)).map(v => v.name);
      setText('selection-summary', `${detailDay}일 · ${names.length ? names.slice(0, 2).join(', ') + (names.length > 2 ? ` 외 ${names.length - 2}명` : '') : '아직 가능한 분이 없어요.'}`);
      $('selection-summary').title = names.join(', ');
    } else { setText('selection-summary', `${snapshot.votes.length}명의 반가운 답장이 모였어요.`); $('selection-summary').removeAttribute('title'); }
  } else {
    const dates = [...selected].sort((a, b) => a - b);
    const summary = dates.length ? `${dates.length}일 선택 · ${dates.map(d => `${d}일`).join(', ')}` : '아직 고른 날이 없어요.';
    setText('selection-summary', summary); $('selection-summary').title = summary;
  }
}
function renderDone() {
  setText('done-name', `${saved.name || guestName} 님의 답장`); setText('done-count', String(saved.dates.length));
  const allDates = saved.dates.map(d => `11.${String(d).padStart(2, '0')}`);
  setText('done-dates', allDates.length > 8 ? `${allDates.slice(0, 6).join(' · ')} 외 ${allDates.length - 6}일` : allDates.join(' · '));
  $('done-dates').setAttribute('aria-label', allDates.join(', '));
  const { best, max } = aggregate(snapshot.votes);
  setText('best-summary', best.length ? `지금은 11월 ${best[0]}일에 가장 많이 만날 수 있어요. ${max}명 가능${best.length > 1 ? ` · 공동 1위 ${best.length}일` : ''}.` : '아직은 조용한 답장함. 곧 반가운 일정들이 모일 거예요.');
  const closed = isClosed();
  $<HTMLButtonElement>('edit-button').disabled = closed || busy;
  setText('edit-button', closed ? '회신이 마감됐어요' : '일정 다시 고르기 ↗');
  setText('done-deadline', closed ? '이제 날짜를 정하고, 얼굴 볼 일만 남았습니다.' : '11월 6일까지, 같은 브라우저에서 수정할 수 있어요.');
}
function renderControls() {
  const closed = isClosed();
  dayButtons.forEach(button => { button.disabled = busy || (mode === 'select' && (closed || !storageReady)); });
  $<HTMLButtonElement>('clear-button').disabled = busy || !selected.size;
  $<HTMLButtonElement>('refresh-button').disabled = busy;
  $<HTMLButtonElement>('back-button').disabled = busy;
  nameInput.disabled = busy;
  saveButton.disabled = busy || (closed ? !hasVote : mode === 'select' && (!connected || !storageReady || !selected.size));
  const label = busy ? '답장 보내는 중…' : closed ? hasVote ? '내가 보낸 답장 보기' : '투표가 마감됐어요' : mode === 'results' ? '내 일정 고르러 가기' : hasVote && !isDirty() ? '저장한 답장 보기' : hasVote ? '바뀐 일정으로 답장하기' : '이날은 만날 수 있어요';
  setText('save-label', label);
  setText('calendar-status', closed ? '회신 마감 · 11월 6일 23:59 한국시간' : busy ? '잠시만요. 반가운 답장을 전달하고 있어요.' : !connected ? '답장함에 연결하고 있어요.' : isDirty() && selected.size ? '선택한 날을 저장하면 답장이 전해집니다.' : hasVote ? '보낸 답장은 마감 전까지 바꿀 수 있어요.' : '마감 전에는 언제든 수정할 수 있어요.');
  $('calendar-status').classList.toggle('dirty', isDirty() && selected.size > 0);
  $('calendar-screen').setAttribute('aria-busy', String(busy));
}
function updateCountdown() {
  const time = countdown(now(), deadline), closed = isClosed();
  const pad = (n: number) => String(n).padStart(2, '0');
  setText('countdown-clock', closed ? '답장이 모두 모였어요' : `${time.days}일 ${pad(time.hours)}:${pad(time.minutes)}:${pad(time.seconds)}`);
  setText('countdown-label', closed ? '회신 마감' : '회신 마감까지');
  $('countdown-block').classList.toggle('closed', closed);
  $('countdown-clock').setAttribute('aria-label', closed ? '투표가 마감되었습니다.' : `투표 종료까지 ${time.days}일 ${time.hours}시간 ${time.minutes}분 ${time.seconds}초`);
  if (closed !== previouslyClosed) { previouslyClosed = closed; renderControls(); renderCalendar(); renderDone(); renderWelcome(); }
}
function render() { renderWelcome(); renderCalendar(); renderDone(); renderControls(); updateCountdown(); }
function selectChanged() { datesTouched = true; rememberDraft(); renderCalendar(); renderControls(); }
$('open-invitation').addEventListener('click', () => showScreen('name'));
$('name-form').addEventListener('submit', event => {
  event.preventDefault(); const name = normalizeGuestName(nameInput.value);
  if (!name || name.length > 24 || /[\x00-\x1F]/.test(name)) {
    setText('name-error', '반가운 이름을 1~24자로 적어 주세요.'); $('name-error').hidden = false; nameInput.setAttribute('aria-invalid', 'true'); nameInput.focus(); return;
  }
  nameInput.value = name; guestName = name; nameInput.blur(); rememberDraft(); showScreen('welcome');
});
nameInput.addEventListener('input', () => { nameTouched = true; $('name-error').hidden = true; nameInput.removeAttribute('aria-invalid'); rememberDraft(); });
$('rename-button').addEventListener('click', () => showScreen('name'));
$('go-calendar').addEventListener('click', () => { mode = isClosed() ? 'results' : 'select'; showScreen('calendar'); });
$('back-button').addEventListener('click', () => { if (!busy) showScreen(({ name: 'cover', welcome: 'name', calendar: 'welcome', done: 'calendar', cover: 'cover' } as const)[screen]); });
dayButtons.forEach(button => button.addEventListener('click', () => {
  const day = Number(button.dataset.day);
  if (mode === 'select' && !isClosed()) { selected.has(day) ? selected.delete(day) : selected.add(day); selectChanged(); }
  else if (mode === 'results') { detailDay = detailDay === day ? null : day; renderCalendar(); }
}));
$('select-view').addEventListener('click', () => { mode = 'select'; detailDay = null; renderCalendar(); renderControls(); });
$('results-view').addEventListener('click', () => { mode = 'results'; detailDay = null; renderCalendar(); renderControls(); });
$('clear-button').addEventListener('click', () => { selected.clear(); selectChanged(); });
$('refresh-button').addEventListener('click', () => { void refresh(); });
$('retry-button').addEventListener('click', () => { if (!storageReady) location.reload(); else void refresh(!initialized); });
$('edit-button').addEventListener('click', () => { if (isClosed()) return; mode = 'select'; showScreen('calendar'); });
$('view-results-button').addEventListener('click', () => { mode = 'results'; detailDay = null; showScreen('calendar'); });
saveButton.addEventListener('click', async () => {
  if (busy) return;
  if (isClosed()) { if (hasVote) showScreen('done'); return; }
  if (mode === 'results') { mode = 'select'; render(); return; }
  if (hasVote && !isDirty()) { showScreen('done'); return; }
  if (!selected.size || !guestName || !connected || !storageReady) return;
  const payload = { name: guestName, dates: [...selected].sort((a,b) => a-b) };
  busy = true; ++requestSequence; renderControls();
  try {
    await request('POST', payload); saved = payload; hasVote = true;
    try { localStorage.removeItem(storage.draft); } catch { /* Server has acknowledged the reply. */ }
    showScreen('done');
  } catch (error) { notify(error instanceof Error ? error.message : '답장을 보내지 못했어요. 다시 시도해 주세요.'); }
  finally { busy = false; render(); }
  await refresh();
});
function fitViewport() {
  const viewport = window.visualViewport;
  if (!viewport) return;
  $('app').style.setProperty('--app-height', `${Math.floor(viewport.height)}px`);
  if (screen !== 'name') compactName = false;
  else if (viewport.height < 500 && document.activeElement === nameInput) compactName = true;
  // Keep the compact form until submission so keyboard blur cannot move the tapped button.
  $('app').classList.toggle('keyboard-open', compactName || viewport.height < window.innerHeight * .78);
}
window.visualViewport?.addEventListener('resize', fitViewport);
nameInput.addEventListener('focus', fitViewport);
nameInput.addEventListener('blur', fitViewport);
window.addEventListener('online', () => { void refresh(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { void refresh(); updateCountdown(); } });
setInterval(updateCountdown, 1000);
setInterval(() => { if (document.visibilityState === 'visible' && !busy) void refresh(); }, 20000);
fitViewport(); render();
if (!storageReady) connectionError('이 브라우저에서 답장을 보관할 수 없어요. 사이트 저장을 허용한 뒤 다시 연결해 주세요.');
else void refresh(true);
