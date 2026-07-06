/**
 * writing-dnd-check.js — D&D 라이팅 문항 구현 검증
 *
 * 검증 범위:
 *  1. normalizeAnswer / judgeUnscramble 유틸 정확성
 *  2. extractTrailingPunct 종결 부호 추출
 *  3. 실제 unscramble 문항 데이터 구조 검증
 *  4. 정답/오답/대소문자/공백 정규화 시나리오
 *  5. Builder 문항(picture_choice) D&D 대상 제외 확인
 *
 * 실행: node scripts/writing-dnd-check.js
 */
'use strict';

const path = require('path');
const fs   = require('fs');

const AU = require(path.join(__dirname, '../public/answer-utils'));
const { normalizeAnswer, judgeUnscramble, isUnscrambleType, extractTrailingPunct } = AU;

// ── 색상 헬퍼 ──────────────────────────────────────────────────────────────
const C = {
  reset:'\x1b[0m', bold:'\x1b[1m',
  red:'\x1b[31m', green:'\x1b[32m', yellow:'\x1b[33m',
  cyan:'\x1b[36m', gray:'\x1b[90m', blue:'\x1b[34m',
};
const ok   = s => C.green + '✓ ' + s + C.reset;
const fail = s => C.red   + '✗ ' + s + C.reset;
const hdr  = s => '\n' + C.bold + C.cyan + s + C.reset;
const note = s => '    ' + C.gray + s + C.reset;

let PASS = 0, FAIL = 0;

function assert(cond, label, got) {
  if (cond) { console.log('  ' + ok(label)); PASS++; }
  else {
    const d = got !== undefined ? C.gray + '  (got: ' + JSON.stringify(got) + ')' + C.reset : '';
    console.log('  ' + fail(label) + d); FAIL++;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. normalizeAnswer
// ═══════════════════════════════════════════════════════════════════════════
console.log(hdr('1. normalizeAnswer'));

assert(normalizeAnswer('  Hello  World  ') === 'hello world',
  '양끝 공백 제거 + 다중 공백 축소 + 소문자');
assert(normalizeAnswer("Don't stop.") === "don't stop.",
  "내부 아포스트로피 보존 + 소문자");
assert(normalizeAnswer('This is a desk.') === 'this is a desk.',
  '일반 종결 부호 소문자');
assert(normalizeAnswer(null) === '', 'null → 빈 문자열');
assert(normalizeAnswer(undefined) === '', 'undefined → 빈 문자열');
assert(normalizeAnswer('') === '', '빈 문자열 → 빈 문자열');

// ═══════════════════════════════════════════════════════════════════════════
// 2. extractTrailingPunct
// ═══════════════════════════════════════════════════════════════════════════
console.log(hdr('2. extractTrailingPunct'));

assert(extractTrailingPunct(['This is a desk.']) === '.', 'period 추출');
assert(extractTrailingPunct(['Are you ready?'])  === '?', 'question mark 추출');
assert(extractTrailingPunct(["Don't stop!"])     === '!', 'exclamation 추출');
assert(extractTrailingPunct(['hello'])           === '',  '종결 부호 없으면 빈 문자열');
assert(extractTrailingPunct([])                 === '',  '빈 배열 → 빈 문자열');
assert(extractTrailingPunct(null)               === '',  'null → 빈 문자열');

// ═══════════════════════════════════════════════════════════════════════════
// 3. judgeUnscramble — 정오판정 시나리오
// ═══════════════════════════════════════════════════════════════════════════
console.log(hdr('3. judgeUnscramble — 정오판정'));

// 정확한 정답 (종결 부호 포함)
assert(judgeUnscramble('This is a desk.',  ['This is a desk.']),  '정확한 정답 ✓');
assert(judgeUnscramble("Don't pour too much sugar in it!", ["Don't pour too much sugar in it!"]),
  '아포스트로피 + ! 정확한 정답 ✓');

// 대소문자 무시
assert(judgeUnscramble('this is a desk.',  ['This is a desk.']),  '소문자 submitted → 정답 ✓');
assert(judgeUnscramble('THIS IS A DESK.',  ['This is a desk.']),  '대문자 submitted → 정답 ✓');

// 공백 정규화
assert(judgeUnscramble('This  is  a  desk.', ['This is a desk.']),
  '다중 공백 정규화 → 정답 ✓');
assert(judgeUnscramble(' This is a desk. ',  ['This is a desk.']),
  '양끝 공백 → 정답 ✓');

// 단어 순서 오류 → 오답
assert(!judgeUnscramble('is This a desk.', ['This is a desk.']),
  '순서 틀림 → 오답 ✓');
assert(!judgeUnscramble('This is desk.',   ['This is a desk.']),
  '단어 누락 → 오답 ✓');

// 종결 부호 누락 → 오답
assert(!judgeUnscramble('This is a desk',  ['This is a desk.']),
  '종결 부호 누락 → 오답 ✓');

// expected 복수 허용 (배열)
assert(judgeUnscramble('He is tall.', ['He is tall.', 'He is a tall boy.']),
  'expected 복수 — 첫 번째 일치 ✓');
assert(judgeUnscramble('He is a tall boy.', ['He is tall.', 'He is a tall boy.']),
  'expected 복수 — 두 번째 일치 ✓');

// ═══════════════════════════════════════════════════════════════════════════
// 4. isUnscrambleType — D&D 대상 판별
// ═══════════════════════════════════════════════════════════════════════════
console.log(hdr('4. isUnscrambleType — D&D 대상 판별'));

assert(isUnscrambleType({ questionType: 'unscramble' }),          'unscramble → true');
assert(!isUnscrambleType({ questionType: 'multiple_choice' }),    'multiple_choice → false');
assert(!isUnscrambleType({ questionType: 'picture_choice' }),     'picture_choice → false (Builder 쓰기)');
assert(!isUnscrambleType({ questionType: 'fill_in_the_blank' }),  'fill_in_the_blank → false');
assert(!isUnscrambleType(null),                                   'null → false');
assert(!isUnscrambleType({}),                                     '빈 객체 → false');

// ═══════════════════════════════════════════════════════════════════════════
// 5. 실제 문항 데이터 검증 (questions.englab.json)
// ═══════════════════════════════════════════════════════════════════════════
console.log(hdr('5. questions.englab.json — 실제 unscramble 문항 구조'));

const englabPath = path.join(__dirname, '../public/questions.englab.json');
let englabData;
try {
  englabData = JSON.parse(fs.readFileSync(englabPath, 'utf8'));
} catch (e) {
  console.log('  ' + fail('파일 읽기 실패: ' + e.message));
  FAIL++;
  englabData = null;
}

if (englabData) {
  // 전체 문항 수집 (중첩 구조 flatMap)
  const allQs = Object.values(englabData).flatMap(section =>
    Array.isArray(section) ? section : Object.values(section).flat()
  );
  const unscrambles = allQs.filter(q => q.questionType === 'unscramble');

  assert(unscrambles.length > 0,
    `unscramble 문항 존재 (${unscrambles.length}개)`);

  // words[], expected[] 필드 모두 존재
  const hasWords    = unscrambles.every(q => Array.isArray(q.words) && q.words.length > 0);
  const hasExpected = unscrambles.every(q => Array.isArray(q.expected) && q.expected.length > 0);
  assert(hasWords,    'words[] 필드 존재 (전체)');
  assert(hasExpected, 'expected[] 필드 존재 (전체)');

  // words에 종결 부호가 없는지 확인 (expected에만 있어야 함)
  const noTrailingInWords = unscrambles.every(q =>
    q.words.every(w => !/^[.?!]$/.test(w.trim()))
  );
  assert(noTrailingInWords, 'words[] 에 단독 종결 부호 없음');

  // expected[0]의 종결 부호가 올바르게 추출되는지 검증 (표본 5개)
  const sample = unscrambles.slice(0, 5);
  let punctOk = true;
  sample.forEach(q => {
    const pt = extractTrailingPunct(q.expected);
    const exp = q.expected[0] || '';
    const expLast = exp[exp.length - 1] || '';
    if (/[.?!]/.test(expLast) && pt !== expLast) punctOk = false;
    if (!/[.?!]/.test(expLast) && pt !== '') punctOk = false;
  });
  assert(punctOk, '표본 5개 종결 부호 추출 정확');

  // 정답 단어 배열 → join + punct → judgeUnscramble 통과
  let joinPass = 0, joinTotal = 0;
  unscrambles.slice(0, 10).forEach(q => {
    const pt = extractTrailingPunct(q.expected);
    // expected[0] 에서 종결 부호 제거한 단어들을 공백 분리 → 재결합
    const exp0 = q.expected[0] || '';
    const wordsInOrder = /[.?!]$/.test(exp0)
      ? exp0.slice(0, -1).trim().split(/\s+/)
      : exp0.trim().split(/\s+/);
    const submitted = wordsInOrder.join(' ') + pt;
    joinTotal++;
    if (judgeUnscramble(submitted, q.expected)) joinPass++;
  });
  assert(joinPass === joinTotal,
    `expected 순서 재조합 → 전부 정답 (${joinPass}/${joinTotal})`);

  console.log(note(`총 unscramble ${unscrambles.length}개 확인 완료`));
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. Builder 문항 — picture_choice 는 D&D 제외 확인
// ═══════════════════════════════════════════════════════════════════════════
console.log(hdr('6. questions.builder.json — writing 문항 D&D 제외'));

const builderPath = path.join(__dirname, '../public/questions.builder.json');
let builderData;
try {
  builderData = JSON.parse(fs.readFileSync(builderPath, 'utf8'));
} catch (e) {
  console.log('  ' + fail('파일 읽기 실패: ' + e.message));
  FAIL++;
  builderData = null;
}

if (builderData) {
  const allBuilderQs = Object.values(builderData).flatMap(section =>
    Array.isArray(section) ? section : Object.values(section).flat()
  );
  const writingQs = allBuilderQs.filter(q => q.section === 'writing');
  const dndTargets = writingQs.filter(q => isUnscrambleType(q));

  assert(writingQs.length > 0,
    `Builder writing 문항 존재 (${writingQs.length}개)`);
  assert(dndTargets.length === 0,
    `Builder writing 문항 중 D&D 대상 없음 (모두 picture_choice 등)`);

  const types = [...new Set(writingQs.map(q => q.questionType))];
  console.log(note('Builder writing 문항 유형: ' + types.join(', ')));
}

// ═══════════════════════════════════════════════════════════════════════════
// 최종 결과
// ═══════════════════════════════════════════════════════════════════════════
console.log(hdr('═══ 검증 결과 ═══'));
const total = PASS + FAIL;
if (FAIL === 0) {
  console.log(C.bold + C.green + '  전체 통과: ' + PASS + '/' + total + C.reset);
} else {
  console.log(C.bold + C.red + '  실패 ' + FAIL + '/' + total + C.reset);
  process.exitCode = 1;
}
console.log('');
