/**
 * report-check.js — scoreAndDiagnose 채점·진단 로직 검증
 *
 * 실행: node scripts/report-check.js
 *
 * 검증 케이스 (단계 2·3·4·5 각각):
 *   A. 전부 정답 (30/30) → 보너스 대상, advance 또는 상위 버킷
 *   B. 절반 정답 (15/30, base/upper 균등) → 보너스 없음, 중간 버킷
 *   C. Upper 강세 (base 50%, upper 80%+) → advance 신호
 *   D. Upper 약세 (base 50%, upper 0%) → stay 신호
 */
'use strict';

const path = require('path');
const TC   = require(path.join(__dirname, '../public/test-composer.js'));

// ── 색상 헬퍼 ─────────────────────────────────────────────────────────────
const C = {
  reset:'\x1b[0m', bold:'\x1b[1m',
  red:'\x1b[31m', green:'\x1b[32m', yellow:'\x1b[33m',
  cyan:'\x1b[36m', gray:'\x1b[90m', blue:'\x1b[34m',
};
const ok   = s => C.green + '✓ ' + s + C.reset;
const fail = s => C.red   + '✗ ' + s + C.reset;
const hdr  = s => '\n' + C.bold + C.cyan + s + C.reset;
const note = s => C.gray + '    ' + s + C.reset;

let PASS = 0, FAIL = 0;

function assert(cond, label, detail) {
  if (cond) { console.log('  ' + ok(label)); PASS++; }
  else {
    const d = detail !== undefined ? C.gray + '  (got: ' + JSON.stringify(detail) + ')' + C.reset : '';
    console.log('  ' + fail(label) + d); FAIL++;
  }
}

// ── 응답 세트 생성기 ──────────────────────────────────────────────────────
/** 각 문항에 correct 태그 부착. baseRate/upperRate: 0~1 */
function makeAnswers(questions, baseRate, upperRate) {
  let bi = 0, ui = 0;
  return questions.map(q => {
    const isBase  = q.origin === 'base';
    const counter = isBase ? bi++ : ui++;
    const rate    = isBase ? baseRate : upperRate;
    // 앞쪽 rate 비율만큼 정답, 나머지 오답
    const correct = counter < Math.round((isBase
      ? questions.filter(x => x.origin === 'base').length
      : questions.filter(x => x.origin === 'upper').length) * rate);
    return Object.assign({}, q, { correct });
  });
}

// ── 단계별 기대값 ─────────────────────────────────────────────────────────
const EXPECTED_CEFR = { 2:'A1', 3:'A1~A2', 4:'A2~B1', 5:'B1~B2' };
const EXPECTED_NEXT = { 2:'Challenger', 3:'Explorer', 4:'Inventor', 5:'Innovator' };
const EXPECTED_LEVEL_KEY = { 2:'Builder', 3:'Challenger', 4:'Explorer', 5:'Inventor' };

// ── 각 단계 검증 ──────────────────────────────────────────────────────────
const STAGES = [2, 3, 4, 5];

for (const stage of STAGES) {
  console.log(hdr(`단계 ${stage} (${EXPECTED_LEVEL_KEY[stage]})`));

  // 시험 구성
  let composed;
  try {
    composed = TC.composeTest(stage);
  } catch(e) {
    console.log('  ' + fail('composeTest 실패: ' + e.message));
    FAIL++; continue;
  }
  assert(composed.active && composed.questions.length === 30,
    `composeTest → 30문항 (active)`);

  const qs        = composed.questions;
  const baseCount  = qs.filter(q => q.origin === 'base').length;
  const upperCount = qs.filter(q => q.origin === 'upper').length;
  console.log(note(`base=${baseCount} upper=${upperCount}`));

  // ── 케이스 A: 전부 정답 ──────────────────────────────────────────────
  console.log(C.blue + '  [A] 전부 정답 (30/30)' + C.reset);
  {
    const answered = qs.map(q => Object.assign({}, q, { correct: true }));
    const r = TC.scoreAndDiagnose(stage, answered);

    assert(r.score === 30 && r.total === 30 && r.scorePct === 100,
      'score=30, scorePct=100');
    assert(r.bonusEligible === true,
      'bonusEligible=true (scorePct≥90)');
    assert(r.appropriate && r.appropriate.cefr === EXPECTED_CEFR[stage],
      'appropriate.cefr=' + EXPECTED_CEFR[stage], r.appropriate && r.appropriate.cefr);
    assert(r.appropriate && r.appropriate.recommended !== null,
      'appropriate.recommended 존재', r.appropriate && r.appropriate.recommended);
    assert(r.challenge.signal === 'advance',
      'challenge.signal=advance (upper 100%)', r.challenge.signal);
    assert(r.challenge.nextStageName === EXPECTED_NEXT[stage],
      'challenge.nextStageName=' + EXPECTED_NEXT[stage], r.challenge.nextStageName);
    assert(r.speaking.responseRate === null && r.speaking.sttText === null,
      'speaking placeholder 값=null');

    // 섹션 합계 검증
    const secSum = Object.values(r.sections).reduce((a, s) => a + s.correct, 0);
    assert(secSum === 30, '섹션별 correct 합=30', secSum);
    const secTotalSum = Object.values(r.sections).reduce((a, s) => a + s.total, 0);
    assert(secTotalSum === 30, '섹션별 total 합=30', secTotalSum);

    console.log(note('추천: ' + (r.appropriate && r.appropriate.recommended)));
  }

  // ── 케이스 B: 절반 정답 ──────────────────────────────────────────────
  console.log(C.blue + '  [B] 절반 정답 (base 50%, upper 50%)' + C.reset);
  {
    const answered = makeAnswers(qs, 0.5, 0.5);
    const r = TC.scoreAndDiagnose(stage, answered);
    const expScore = answered.filter(a => a.correct).length;

    assert(r.score === expScore, 'score 계산 정확', r.score + ' vs ' + expScore);
    assert(r.bonusEligible === false,
      'bonusEligible=false (scorePct<90)', r.scorePct);
    assert(r.appropriate && r.appropriate.cefr === EXPECTED_CEFR[stage],
      'appropriate.cefr 유지', r.appropriate && r.appropriate.cefr);
    assert(r.appropriate && r.appropriate.recommended !== null,
      'appropriate.recommended 존재 (중간 버킷)');
    assert(r.baseScore + r.upperScore === r.score,
      'baseScore+upperScore=score', r.baseScore + '+' + r.upperScore);

    const uRate = r.challenge.upperCorrectRate;
    assert(uRate >= 0 && uRate <= 100, 'upperCorrectRate 범위 0~100', uRate);
    console.log(note('score=' + r.score + '/' + r.total + ' (' + r.scorePct + '%), upper=' + uRate + '%'));
  }

  // ── 케이스 C: Upper 강세 ──────────────────────────────────────────────
  console.log(C.blue + '  [C] Upper 강세 (base 40%, upper 90%)' + C.reset);
  {
    const answered = makeAnswers(qs, 0.4, 0.9);
    const r = TC.scoreAndDiagnose(stage, answered);

    assert(r.challenge.signal === 'advance',
      'signal=advance (upper≥70%)', r.challenge.upperCorrectRate + '% → ' + r.challenge.signal);
    assert(r.challenge.upperCorrectRate >= 70,
      'upperCorrectRate≥70', r.challenge.upperCorrectRate);
    console.log(note('upper=' + r.challenge.upperCorrectRate + '%, signal=' + r.challenge.signal));
  }

  // ── 케이스 D: Upper 약세 ──────────────────────────────────────────────
  console.log(C.blue + '  [D] Upper 약세 (base 70%, upper 0%)' + C.reset);
  {
    const answered = makeAnswers(qs, 0.7, 0.0);
    const r = TC.scoreAndDiagnose(stage, answered);

    assert(r.challenge.signal === 'stay',
      'signal=stay (upper=0%)', r.challenge.upperCorrectRate + '% → ' + r.challenge.signal);
    assert(r.challenge.upperCorrectRate === 0,
      'upperCorrectRate=0', r.challenge.upperCorrectRate);
    console.log(note('upper=' + r.challenge.upperCorrectRate + '%, signal=' + r.challenge.signal));
  }
}

// ── 추가: 도전 레벨 경계값 검증 ──────────────────────────────────────────
console.log(hdr('도전 레벨 경계값 (단계 3 Challenger 기준)'));
{
  const composed = TC.composeTest(3);
  const qs = composed.questions;
  const uCount = qs.filter(q => q.origin === 'upper').length;

  // upper 정확히 70% → advance
  const u70 = qs.map(q => {
    if (q.origin !== 'upper') return Object.assign({}, q, { correct: false });
    const uIdx = qs.filter(x => x.origin === 'upper').indexOf(q);
    return Object.assign({}, q, { correct: uIdx < Math.ceil(uCount * 0.7) });
  });
  const r70 = TC.scoreAndDiagnose(3, u70);
  assert(r70.challenge.signal === 'advance',
    'upper 70% → signal=advance', r70.challenge.upperCorrectRate + '%');

  // upper 39% → stay
  const u39 = qs.map(q => {
    if (q.origin !== 'upper') return Object.assign({}, q, { correct: false });
    const uIdx = qs.filter(x => x.origin === 'upper').indexOf(q);
    return Object.assign({}, q, { correct: uIdx < Math.floor(uCount * 0.39) });
  });
  const r39 = TC.scoreAndDiagnose(3, u39);
  assert(r39.challenge.signal === 'stay',
    'upper <40% → signal=stay', r39.challenge.upperCorrectRate + '%');

  // upper 40~69% → borderline
  const u55 = qs.map(q => {
    if (q.origin !== 'upper') return Object.assign({}, q, { correct: false });
    const uIdx = qs.filter(x => x.origin === 'upper').indexOf(q);
    return Object.assign({}, q, { correct: uIdx < Math.round(uCount * 0.55) });
  });
  const r55 = TC.scoreAndDiagnose(3, u55);
  assert(r55.challenge.signal === 'borderline',
    'upper ~55% → signal=borderline', r55.challenge.upperCorrectRate + '%');
}

// ── 추가: 보너스 경계값 (27/30 = 90%) ────────────────────────────────────
console.log(hdr('보너스 경계값 (단계 4 Explorer 기준)'));
{
  const composed = TC.composeTest(4);
  const qs = composed.questions;

  const at90 = qs.map((q, i) => Object.assign({}, q, { correct: i < 27 }));
  const r90  = TC.scoreAndDiagnose(4, at90);
  assert(r90.bonusEligible === true,
    '27/30(90%) → bonusEligible=true', r90.scorePct + '%');

  const at89 = qs.map((q, i) => Object.assign({}, q, { correct: i < 26 }));
  const r89  = TC.scoreAndDiagnose(4, at89);
  assert(r89.bonusEligible === false,
    '26/30(~87%) → bonusEligible=false', r89.scorePct + '%');
}

// ── 최종 결과 ─────────────────────────────────────────────────────────────
console.log(hdr('═══ 검증 결과 ═══'));
const total = PASS + FAIL;
if (FAIL === 0) {
  console.log(C.bold + C.green + '  전체 통과: ' + PASS + '/' + total + C.reset);
} else {
  console.log(C.bold + C.red + '  실패 ' + FAIL + '/' + total + C.reset);
  process.exitCode = 1;
}
console.log('');
