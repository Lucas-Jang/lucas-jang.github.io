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
