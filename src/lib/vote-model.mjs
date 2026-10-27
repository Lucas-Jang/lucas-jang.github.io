export const DAYS = Array.from({ length: 30 }, (_, i) => i + 1);
// Both API votes and stored drafts retain available dates; only the calendar marks unavailable dates.
export function complementDates(dates) {
  const excluded = new Set(dates);
  return DAYS.filter(day => !excluded.has(day));
}
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
const PERSONAL_GREETINGS = new Map([
  ['전지원', {
    title: '지원 님,\n반가운 지원군 등장.',
    message: '전지원 님, 명단에서 바로 찾았어요.\n환영합니다. 이제 날짜만 지원해 주세요.',
    note: '오늘의 안건: 메뉴 선정에도 적극 지원 부탁.',
  }],
  ['장원준', {
    title: '원준 님,\n이번엔 진짜 모이죠.',
    message: '장원준 님, 명단에 있습니다. 환영해요.\n“언제 한번”을 이번엔 실행해 봅시다.',
    note: '구두 약속 → 날짜 확정, 추진 중.',
  }],
  ['송창훈', {
    title: '창훈 님,\n출석 확인했습니다.',
    message: '송창훈 님, 명단 확인했어요. 환영합니다.\n어려운 질문은 없어요. 언제 시간 되세요?',
    note: '준비물: 빈속. 근황은 선택 사항.',
  }],
]);
const OTHER_GREETINGS = [
  { title: '명단엔 없어도,\n합석은 환영이죠.', message: '명단에는 이름이 없네요. 그래도 환영해요.\n인원이 늘면, 메뉴도 하나 더 시키면 되죠.', note: '명단 수정 사유: 반가운 사람 추가.' },
  { title: '명단 담당자가\n한 분 놓쳤네요.', message: '명단엔 없지만, 오신 건 대환영입니다.\n담당자에겐 저희가 잘 얘기할게요.', note: '입장 심사 결과: 일단 같이 먹기로.' },
  { title: '예상 밖의 손님,\n오히려 좋습니다.', message: '명단에서는 못 찾았지만, 환영해요.\n원래 재밌는 모임엔 번외 멤버가 있죠.', note: '참석 자격: 같이 밥 먹고 싶은 사람.' },
  { title: '초대 명단보다\n식탁이 넓습니다.', message: '명단에 없다고 못 올 이유는 없죠.\n환영합니다. 수저 하나 더 놓을게요.', note: '추가 인원 접수 완료. 날짜만 남았습니다.' },
];
export function normalizeGuestName(value) {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ');
}
export function guestGreeting(value) {
  const name = normalizeGuestName(value);
  const key = name.replace(/\s/g, '');
  const personal = PERSONAL_GREETINGS.get(key);
  // The same name keeps the same greeting across countdown ticks and refreshes.
  const hash = [...key].reduce((value, char) => (Math.imul(value, 31) + char.codePointAt(0)) >>> 0, 0);
  return { name, listed: !!personal, ...(personal || OTHER_GREETINGS[hash % OTHER_GREETINGS.length]) };
}
export function countdown(now, deadline = VOTE_DEADLINE) {
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  return { closed: now >= deadline, days: Math.floor(seconds / 86400), hours: Math.floor(seconds % 86400 / 3600), minutes: Math.floor(seconds % 3600 / 60), seconds: seconds % 60 };
}
