import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregate, dateLabel, sameVote, validDates, WEEKENDS } from '../src/lib/vote-model.mjs';

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
