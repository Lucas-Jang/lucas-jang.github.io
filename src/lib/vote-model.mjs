export const DAYS = Array.from({ length: 30 }, (_, i) => i + 1);
export const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
export const dateLabel = day => `11월 ${day}일 (${WEEK[(day - 1) % 7]})`;
export const WEEKENDS = DAYS.filter(day => [0, 6].includes((day - 1) % 7));
export function validDates(input) {
  return Array.isArray(input) && input.length <= 30 && input.every(day => Number.isInteger(day) && day >= 1 && day <= 30);
}
export function aggregate(votes) {
  const counts = DAYS.map(day => votes.filter(vote => vote.dates.includes(day)).length);
  const max = Math.max(0, ...counts);
  const ranked = DAYS.filter(day => counts[day - 1] > 0).sort((a, b) => counts[b - 1] - counts[a - 1] || a - b);
  return { counts, max, best: DAYS.filter(day => max > 0 && counts[day - 1] === max), ranked };
}
export function sameVote(a, b) {
  return a.name.trim() === b.name.trim() && [...a.dates].sort((x,y) => x-y).join(',') === [...b.dates].sort((x,y) => x-y).join(',');
}
// November 6 is inclusive in Korea. The first closed instant is November 7 midnight.
export const VOTE_DEADLINE = Date.parse('2026-11-07T00:00:00+09:00');
export const INVITED_NAMES = ['전지원', '장원준', '송창훈'];
export function normalizeGuestName(value) {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ');
}
export function guestGreeting(value) {
  const name = normalizeGuestName(value);
  const listed = INVITED_NAMES.includes(name.replace(/\s/g, ''));
  return {
    name, listed,
    title: listed ? '기다리고 있었어요.' : '명단엔 없어도,\n빈자리는 있어요.',
    message: listed ? '명단에도 있고, 마음에도 있습니다.\n진단 회식에 오신 걸 환영해요.' : '좋은 사람은 원래 번외로 오니까요.\n진단 회식에 오신 걸 환영해요.',
    note: listed ? '오늘의 진단: 반가움 정상 초과.' : '오늘의 진단: 뜻밖의 만남, 아주 좋음.',
  };
}
export function countdown(now, deadline = VOTE_DEADLINE) {
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  return { closed: now >= deadline, days: Math.floor(seconds / 86400), hours: Math.floor(seconds % 86400 / 3600), minutes: Math.floor(seconds % 3600 / 60), seconds: seconds % 60 };
}
