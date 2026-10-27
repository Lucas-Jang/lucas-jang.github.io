import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregate, dateLabel, sameVote, validDates, WEEKENDS } from '../src/lib/vote-model.mjs';
import { guestGreeting, countdown, VOTE_DEADLINE } from '../src/lib/vote-model.mjs';

test('November 2026 starts on Sunday and ends on Monday, with 30 dates', () => {
  assert.equal(new Date(2026, 10, 1).getDay(), 0);
  assert.equal(new Date(2026, 11, 0).getDate(), 30);
  assert.equal(dateLabel(1), '11월 1일 (일)');
  assert.equal(dateLabel(30), '11월 30일 (월)');
  assert.deepEqual(WEEKENDS, [1, 7, 8, 14, 15, 21, 22, 28, 29]);
});
test('no vote does not invent a recommended date', () => {
  const result = aggregate([]);
  assert.equal(result.max, 0); assert.deepEqual(result.best, []); assert.deepEqual(result.ranked, []);
});
test('shared dates count once per participant, ties remain visible, date sorting is numeric', () => {
  const result = aggregate([{dates:[2,7,14]},{dates:[7,14,21]},{dates:[21]}]);
  assert.equal(result.max, 2); assert.deepEqual(result.best,[7,14,21]);
  assert.deepEqual(result.ranked,[7,14,21,2]); assert.equal(result.counts[29],0);
});
test('dirty state compares date sets, trims names, and detects removals', () => {
  assert.ok(sameVote({name:' 이름 ',dates:[14,7]},{name:'이름',dates:[7,14]}));
  assert.ok(!sameVote({name:'이름',dates:[7]},{name:'이름',dates:[7,14]}));
  assert.ok(!sameVote({name:'다른 이름',dates:[7]},{name:'이름',dates:[7]}));
});
test('invalid dates and malformed local drafts cannot enter the model', () => {
  for (const value of [null, {}, '7', [0], [31], [7.5], ['7'], Array(31).fill(7)]) assert.equal(validDates(value),false);
  assert.equal(validDates([1,7,30]),true);
});
test('each invited name receives the listed welcome; everyone else is equally welcome', () => {
  for (const name of ['전지원', '장원준', '송창훈', ' 전지원 ', '장 원준']) {
    const greeting = guestGreeting(name);
    assert.equal(greeting.listed, true);
    assert.match(greeting.message, /명단에도 있고/);
    assert.match(greeting.message, /환영/);
  }
  for (const name of ['김민수', '전지워', '<img onerror=alert(1)>']) {
    const greeting = guestGreeting(name);
    assert.equal(greeting.listed, false);
    assert.match(greeting.title, /명단엔 없어도/);
    assert.match(greeting.message, /환영/);
  }
});
test('deadline includes all of November 6 in Korea and closes exactly at midnight', () => {
  assert.equal(VOTE_DEADLINE, Date.parse('2026-11-06T15:00:00Z'));
  assert.equal(countdown(Date.parse('2026-11-06T23:59:59.999+09:00')).closed, false);
  assert.equal(countdown(Date.parse('2026-11-07T00:00:00+09:00')).closed, true);
  assert.equal(countdown(VOTE_DEADLINE + 100000).seconds, 0);
});
test('countdown has stable day, hour, minute and second boundaries without negative values', () => {
  assert.deepEqual(countdown(VOTE_DEADLINE - (86400 + 3600 + 60 + 1) * 1000), {closed:false,days:1,hours:1,minutes:1,seconds:1});
  assert.deepEqual(countdown(VOTE_DEADLINE), {closed:true,days:0,hours:0,minutes:0,seconds:0});
  assert.equal(countdown(VOTE_DEADLINE - 1).seconds,1);
});
