import { aggregate, dateLabel, sameVote, validDates, WEEKENDS } from '../lib/vote-model.mjs';
import { VOTE_API } from '../lib/vote-api';

type Vote = { id: string; name: string; dates: number[]; updatedAt: string };
type Snapshot = { votes: Vote[]; ownId: string | null };
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const nameInput = $<HTMLInputElement>('voter-name');
const saveButton = $<HTMLButtonElement>('save-button');
const form = $<HTMLFormElement>('vote-form');
const dialog = $<HTMLDialogElement>('delete-dialog');
const dayButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-day]')];
const storage = { key: 'november-2026-vote-key', draft: 'november-2026-vote-draft' };
let token = '', storageReady = true, initialized = false, busy = false, connected = false;
let snapshot: Snapshot = { votes: [], ownId: null };
let selected = new Set<number>();
let mode: 'select' | 'results' = 'select';
let detailDay: number | null = null;
let toastTimer: ReturnType<typeof setTimeout>;
let requestSequence = 0;
let saved: { name: string; dates: number[] } = { name: '', dates: [] };
let hasVote = false;

try {
  token = localStorage.getItem(storage.key) || '';
  if (!/^[a-f0-9]{64}$/.test(token)) {
    token = [...crypto.getRandomValues(new Uint8Array(32))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(storage.key, token);
  }
} catch { storageReady = false; }
if (storageReady) {
  try {
    const restored = JSON.parse(localStorage.getItem(storage.draft) || 'null');
    if (restored && typeof restored.name === 'string' && restored.name.length <= 24 && validDates(restored.dates)) {
      nameInput.value = restored.name; selected = new Set(restored.dates);
    } else if (restored) localStorage.removeItem(storage.draft);
  } catch { try { localStorage.removeItem(storage.draft); } catch { /* Keep the session available. */ } }
}

const draft = () => ({ name: nameInput.value.trim(), dates: [...selected].sort((a, b) => a - b) });
const isDirty = () => !sameVote(draft(), saved);
function rememberDraft() {
  if (storageReady) { try { localStorage.setItem(storage.draft, JSON.stringify(draft())); } catch { /* Keep this session editable. */ } }
}
function showToast(message: string) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5000);
}
function showError(message: string, connection = false) {
  if (connection) { $('connection-message').textContent = message; $('connection-error').hidden = false; }
  else { $('form-error').textContent = message; $('form-error').hidden = false; }
}
function text<K extends keyof HTMLElementTagNameMap>(tag: K, content: string, className = '') {
  const el = document.createElement(tag); el.textContent = content; el.className = className; return el;
}
async function request(method: 'GET' | 'POST' | 'DELETE', body?: unknown): Promise<Snapshot | { ok: boolean }> {
  let response: Response;
  try { response = await fetch(VOTE_API, {
    method, mode: 'cors', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }); } catch { throw new Error('연결이 원활하지 않아 결과를 확인하지 못했어요. 선택 내용은 유지됩니다. 다시 연결한 뒤 시도해 주세요.'); }
  const payload = await response.json() as { error?: string };
  if (!response.ok) throw new Error(payload.error || '요청을 처리하지 못했습니다. 다시 시도해 주세요.');
  return payload as Snapshot | { ok: boolean };
}
function validateSnapshot(data: Snapshot) {
  if (!Array.isArray(data.votes) || !data.votes.every(v => typeof v.id === 'string' && typeof v.name === 'string' && validDates(v.dates))) throw new Error('투표 응답을 확인하지 못했습니다. 다시 연결해 주세요.');
}
async function refresh(initial = false) {
  if (busy) return;
  const sequence = ++requestSequence;
  try {
    const result = await request('GET') as Snapshot; validateSnapshot(result);
    if (sequence !== requestSequence || busy) return;
    snapshot = result; connected = true; $('connection-error').hidden = true;
    const own = result.votes.find(v => v.id === result.ownId);
    hasVote = !!own;
    if (initial || !initialized) {
      saved = own ? { name: own.name, dates: own.dates } : { name: '', dates: [] };
      let hasDraft = false;
      try { hasDraft = !!localStorage.getItem(storage.draft); } catch { /* Browser storage is unavailable. */ }
      if (own && !hasDraft) { nameInput.value = own.name; selected = new Set(own.dates); }
      initialized = true;
    }
    $('refresh-state').textContent = `${new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' }).format(new Date())} 업데이트 · 20초마다 갱신`;
    render();
  } catch (error) {
    if (sequence !== requestSequence) return;
    connected = false;
    showError(initial ? '투표 서버에 연결하지 못했어요. 선택 내용은 유지됩니다. 다시 연결해 주세요.' : '연결이 끊겨 최신 현황을 확인할 수 없어요. 다시 연결해 주세요.', true);
    $('refresh-state').textContent = snapshot.votes.length ? '마지막으로 불러온 결과입니다.' : '연결을 기다리고 있어요.';
    renderControls();
  }
}
function renderControls() {
  dayButtons.forEach(button => { button.disabled = busy || !storageReady; });
  nameInput.disabled = busy || !storageReady;
  $<HTMLButtonElement>('weekend-button').disabled = busy || !storageReady;
  $<HTMLButtonElement>('clear-button').disabled = busy || !selected.size;
  saveButton.disabled = busy || !connected || !storageReady || !selected.size || (hasVote && !isDirty());
  $('save-label').textContent = busy ? '저장하는 중…' : hasVote ? '변경한 일정 저장' : '투표 저장하기';
  $('form-heading').textContent = hasVote ? '내 투표 수정하기' : '내 일정 알려주기';
  $('delete-button').hidden = !hasVote;
  $<HTMLButtonElement>('delete-button').disabled = busy;
  $('mobile-selection').textContent = selected.size ? `${selected.size}일 선택${isDirty() ? ' · 저장 전' : ''}` : '가능한 날을 선택해 주세요';
  const status = $('save-state');
  status.classList.toggle('dirty', isDirty()); status.classList.toggle('saved', hasVote && !isDirty());
  status.textContent = busy ? '저장 중입니다. 잠시만 기다려 주세요.' : isDirty() ? '변경사항이 있어요. 저장하면 결과에 반영됩니다.' : hasVote ? '✓ 내 투표가 저장되어 있어요.' : '아직 저장한 투표가 없어요.';
  form.setAttribute('aria-busy', String(busy));
}
function renderCalendar() {
  const { counts, max, best } = aggregate(snapshot.votes);
  $('select-view').setAttribute('aria-pressed', String(mode === 'select'));
  $('results-view').setAttribute('aria-pressed', String(mode === 'results'));
  $('selection-tools').hidden = mode !== 'select'; $('refresh-button').hidden = mode !== 'results';
  $('calendar-instruction').textContent = mode === 'select' ? '날짜를 누르면 선택돼요. 다시 누르면 취소됩니다.' : '날짜를 눌러 참석 가능한 사람을 확인하세요.';
  $('calendar-legend').replaceChildren(text('i', ''), text('span', mode === 'select' ? '선택한 날짜' : '진할수록 많은 사람이 가능해요'));
  dayButtons.forEach(button => {
    const day = Number(button.dataset.day), chosen = selected.has(day), count = counts[day - 1];
    button.classList.toggle('selected', mode === 'select' && chosen);
    button.classList.toggle('is-best', mode === 'results' && best.includes(day));
    button.classList.toggle('is-detail', mode === 'results' && detailDay === day);
    button.style.backgroundColor = mode === 'results' && count ? `rgba(65,118,68,${.04 + count / Math.max(max, 1) * .16})` : '';
    button.setAttribute('aria-pressed', String(mode === 'select' ? chosen : detailDay === day));
    button.setAttribute('aria-label', `${dateLabel(day)}, ${mode === 'select' ? chosen ? '선택됨' : '선택 안 됨' : `${count}명 가능`}`);
    button.querySelector('.day-votes')!.textContent = mode === 'results' && count ? `${count}명 가능` : '';
  });
  $('date-detail').hidden = mode !== 'results' || detailDay === null;
  if (detailDay !== null) {
    const available = snapshot.votes.filter(v => v.dates.includes(detailDay!));
    $('date-detail-title').textContent = `${dateLabel(detailDay)} · ${available.length}명 가능`;
    $('date-detail-names').textContent = available.map(v => v.name).join(', ') || '아직 이 날짜에 가능한 사람이 없어요.';
  }
}
function renderSelection() {
  $('selected-count').textContent = `${selected.size}일`;
  const root = $('selected-list'); root.replaceChildren();
  if (!selected.size) root.append(text('p', '달력에서 가능한 날을 골라 주세요.'));
  [...selected].sort((a, b) => a - b).forEach(day => {
    const button = text('button', `11.${String(day).padStart(2, '0')} ×`); button.type = 'button'; button.disabled = busy;
    button.setAttribute('aria-label', `${dateLabel(day)} 선택 해제`);
    button.addEventListener('click', () => { selected.delete(day); changed(); }); root.append(button);
  });
}
function renderResults() {
  const { counts, max, best, ranked } = aggregate(snapshot.votes);
  $('total-voters').textContent = `${snapshot.votes.length}명 참여`; $('participant-count').textContent = String(snapshot.votes.length);
  const participants = $('participants'); participants.replaceChildren();
  if (!snapshot.votes.length) participants.append(text('p', '아직 참여자가 없어요. 첫 번째로 일정을 남겨 주세요.', 'empty-state'));
  else {
    const list = text('ul', '', 'participant-list');
    snapshot.votes.forEach(vote => {
      const row = text('li', '', 'participant');
      const avatar = text('span', [...vote.name][0] || '?', 'participant-avatar'); avatar.setAttribute('aria-hidden', 'true');
      const info = text('div', ''); const name = text('p', vote.name, 'participant-name');
      if (vote.id === snapshot.ownId) name.append(text('span', '나', 'participant-me'));
      info.append(name, text('p', vote.dates.map(day => `11.${String(day).padStart(2, '0')}`).join(' · '), 'participant-dates'));
      row.append(avatar, info, text('span', `${vote.dates.length}일 가능`, 'participant-days')); list.append(row);
    }); participants.append(list);
  }
  const ranking = $('ranking'); ranking.replaceChildren();
  if (!ranked.length) ranking.append(text('p', '투표가 모이면 많이 겹치는 날짜를 보여드려요.', 'empty-state'));
  ranked.slice(0, 5).forEach(day => {
    const count = counts[day - 1], rank = ranked.filter(d => counts[d - 1] > count).length + 1;
    const row = text('button', '', `rank-row${count === max ? ' winner' : ''}`); row.type = 'button';
    const track = text('span', '', 'rank-track'), fill = text('span', ''); fill.style.width = `${count / snapshot.votes.length * 100}%`; track.append(fill); track.setAttribute('aria-hidden', 'true');
    row.append(text('span', String(rank), 'rank-number'), text('span', dateLabel(day), 'rank-date'), track, text('span', `${count}명`, 'rank-count'));
    row.addEventListener('click', () => { mode = 'results'; detailDay = day; renderCalendar(); $('date-detail').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' }); $<HTMLButtonElement>('close-detail').focus({ preventScroll: true }); }); ranking.append(row);
  });
  const target = $('best-content'); target.replaceChildren();
  if (!best.length) target.append(text('p', '첫 번째 일정을 기다리고 있어요.', 'best-empty'), text('p', '투표가 모이면 가장 많이 겹치는 날을 알려드려요.', 'best-description'));
  else {
    const date = text('p', `11월 ${best[0]}일`, 'best-date'); date.append(text('small', dateLabel(best[0]).split('(')[1].replace(')', '요일')));
    const track = text('div', '', 'attendance-track'), fill = text('span', ''); fill.style.width = `${max / snapshot.votes.length * 100}%`; track.append(fill);
    target.append(date, text('p', `전체 ${snapshot.votes.length}명 중 ${max}명이 만날 수 있어요.`, 'best-description'), track);
    if (best.length > 1) target.append(text('p', `공동 1위 ${best.length}일 · ${best.map(d => `11.${String(d).padStart(2, '0')}`).join(', ')}`, 'best-ties'));
  }
}
function render() { renderCalendar(); renderSelection(); renderResults(); renderControls(); }
function changed() { $('form-error').hidden = true; nameInput.removeAttribute('aria-invalid'); rememberDraft(); renderCalendar(); renderSelection(); renderControls(); }
dayButtons.forEach(button => button.addEventListener('click', () => {
  const day = Number(button.dataset.day);
  if (mode === 'select') { selected.has(day) ? selected.delete(day) : selected.add(day); changed(); }
  else { detailDay = detailDay === day ? null : day; renderCalendar(); }
}));
nameInput.addEventListener('input', () => { $('form-error').hidden = true; nameInput.removeAttribute('aria-invalid'); rememberDraft(); renderControls(); });
$('weekend-button').addEventListener('click', () => { WEEKENDS.forEach(day => selected.add(day)); changed(); showToast('11월의 토요일·일요일을 선택했어요.'); });
$('clear-button').addEventListener('click', () => { selected.clear(); changed(); });
$('select-view').addEventListener('click', () => { mode = 'select'; renderCalendar(); });
$('results-view').addEventListener('click', () => { mode = 'results'; renderCalendar(); });
$('close-detail').addEventListener('click', () => { const previous = detailDay; detailDay = null; renderCalendar(); dayButtons.find(b => Number(b.dataset.day) === previous)?.focus(); });
$('refresh-button').addEventListener('click', () => { void refresh(); });
$('retry-button').addEventListener('click', () => { void refresh(!initialized); });
$('share-button').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText('https://lucas-jang.github.io/vote/'); showToast('투표 링크를 복사했어요. 함께 만날 사람에게 보내 주세요.'); }
  catch { showToast('주소창의 페이지 링크를 복사해 주세요.'); }
});
form.addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return;
  if (!nameInput.value.trim() || nameInput.value.trim().length > 24) { nameInput.setAttribute('aria-invalid', 'true'); showError('이름을 1~24자로 입력해 주세요.'); nameInput.focus(); return; }
  if (!selected.size) { showError('가능한 날짜를 하나 이상 선택해 주세요.'); $('calendar').focus(); return; }
  if (!connected || !storageReady) { showError('먼저 투표 서버 연결과 브라우저 저장 기능을 확인해 주세요.'); return; }
  const payload = draft(); busy = true; ++requestSequence; $('form-error').hidden = true; render();
  try {
    await request('POST', payload);
    saved = payload; hasVote = true;
    try { localStorage.removeItem(storage.draft); } catch { /* Acknowledged by the server. */ }
    showToast('✓ 내 투표가 저장됐어요. 결과를 확인해 보세요.');
    mode = 'results'; detailDay = null;
  } catch (error) { showError(error instanceof Error ? error.message : '저장 결과를 확인하지 못했어요. 다시 저장해도 투표는 중복되지 않습니다.'); }
  finally { busy = false; render(); }
  await refresh();
});
$('delete-button').addEventListener('click', () => { if (!busy) dialog.showModal(); });
$('cancel-delete').addEventListener('click', () => dialog.close());
$('confirm-delete').addEventListener('click', async () => {
  if (busy) return; busy = true; ++requestSequence; $<HTMLButtonElement>('confirm-delete').disabled = true; renderControls();
  try {
    await request('DELETE'); saved = { name: '', dates: [] }; hasVote = false; selected.clear(); nameInput.value = '';
    try { localStorage.removeItem(storage.draft); } catch { /* No local draft. */ }
    dialog.close(); mode = 'select'; detailDay = null; showToast('내 투표를 삭제했어요. 다시 참여할 수 있습니다.');
  } catch (error) { dialog.close(); showError(error instanceof Error ? error.message : '삭제 결과를 확인하지 못했어요. 다시 연결해 주세요.'); }
  finally { busy = false; $<HTMLButtonElement>('confirm-delete').disabled = false; render(); }
  await refresh();
});
window.addEventListener('beforeunload', event => { if (isDirty()) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('online', () => { void refresh(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void refresh(); });
setInterval(() => { if (document.visibilityState === 'visible' && !busy) void refresh(); }, 20000);
render();
if (!storageReady) showError('이 브라우저에서 내 투표를 보관할 수 없어요. 브라우저의 사이트 저장 기능을 허용한 뒤 새로고침해 주세요.', true);
else void refresh(true);
