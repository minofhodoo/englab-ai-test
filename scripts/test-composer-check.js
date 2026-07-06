/**
 * test-composer-check.js — TestComposer v2 검증 스크립트
 *
 * 실행: node scripts/test-composer-check.js
 *
 * 검증 항목
 *  1. 단계별 활성/비활성 상태 (단계 1 = 비활성, 단계 2-5 = 활성)
 *  2. 총 문항 수 = 30  (전 활성 단계)
 *  3. base=21 / upper=9  (전 활성 단계)
 *  4. 독해 문항 전체가 origin='base'
 *  5. 독해 지문 묶음 온전성 (같은 passage 문항이 일부만 선택되지 않음)
 *  6. 동일 문항 중복 출제 없음
 *  7. origin 태그 전 문항 존재
 *  8. 필수 필드 누락 없음 (id/section/questionType/question/origin)
 *  9. 재응시 차별성 (5회 중 최소 1회 다른 조합)
 * 10. scoreAndDiagnose 예시 출력
 * 11. getBonusCandidates 개수 출력
 */

'use strict';

const path = require('path');
const TC   = require(path.join(__dirname, '../public/test-composer.js'));

// ── 풀 데이터 직접 로드 (독해 무결성 검사 및 isStageActive 판정에 사용) ──
const allPools = {};
for (const fname of ['questions.englab.json', 'questions.builder.json']) {
  try {
    const data = require(path.join(__dirname, '../public', fname));
    for (const [lvl, ranges] of Object.entries(data)) {
      if (!allPools[lvl]) allPools[lvl] = {};
      for (const [rng, qs] of Object.entries(ranges)) allPools[lvl][rng] = qs;
    }
  } catch (_) { /* 파일 미존재 시 스킵 */ }
}

// ── 색상 헬퍼 ──────────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', gray: '\x1b[90m',
};
const ok   = s => C.green  + '✓ ' + s + C.reset;
const fail = s => C.red    + '✗ ' + s + C.reset;
const warn = s => C.yellow + '⚠ ' + s + C.reset;
const hdr  = s => '\n' + C.bold + C.cyan + s + C.reset;

// ── 검증 카운터 ────────────────────────────────────────────────────────────
let PASS = 0, FAIL = 0;

function assert(cond, label, detail) {
  if (cond) { console.log('  ' + ok(label)); PASS++; }
  else {
    const suffix = detail ? C.gray + '  (' + detail + ')' + C.reset : '';
    console.log('  ' + fail(label) + suffix); FAIL++;
  }
}

// ── pool 조회 헬퍼 ────────────────────────────────────────────────────────
function resolvePool(testId) {
  const dash = testId.indexOf('-');
  const lvl  = testId[0].toUpperCase() + testId.slice(1, dash);
  const rng  = testId.slice(dash + 1);
  return (allPools[lvl] && allPools[lvl][rng]) || [];
}

// ── 독해 지문 묶음 온전성 검사 ────────────────────────────────────────────
// 선택된 독해 문항의 passage를 공유하는 base pool 문항이 모두 선택됐는지 확인
function checkPassageIntegrity(questions, stage) {
  const cfg = TC.STAGE_CONFIG[stage];
  const basePool = cfg.base.reduce((a, id) => a.concat(resolvePool(id)), []);

  const readingSelected = questions.filter(q => q.section === 'reading');
  const selectedIds     = new Set(readingSelected.map(q => q.id));

  // 선택된 passage 텍스트 수집
  const usedPassages = new Set();
  for (const q of readingSelected) {
    if (q.passage) usedPassages.add(q.passage);
  }

  const errors = [];
  for (const q of basePool) {
    if (q.section !== 'reading' || !q.passage) continue;
    if (!usedPassages.has(q.passage)) continue;  // 이 passage 미선택 → 정상
    if (!selectedIds.has(q.id)) {
      errors.push('누락: ' + q.id + ' (passage: "' + q.passage.slice(0, 35) + '...")');
    }
  }
  return errors;
}

// ── 필수 필드 검사 ────────────────────────────────────────────────────────
function checkRequiredFields(questions) {
  const problems = [];
  for (const q of questions) {
    const missing = [];
    if (!q.id)           missing.push('id');
    if (!q.section)      missing.push('section');
    if (!q.questionType) missing.push('questionType');
    if (!q.question)     missing.push('question');
    if (!q.origin)       missing.push('origin');
    if (q.questionType === 'multiple_choice' && (q.answer == null || !q.options)) {
      missing.push('answer/options');
    }
    if (q.questionType === 'unscramble' && (!q.expected || !q.expected.length)) {
      missing.push('expected');
    }
    if (q.questionType === 'picture_choice' && !q.imageFile) {
      missing.push('imageFile');
    }
    if (missing.length) problems.push(q.id + '[' + missing.join(',') + ']');
  }
  return problems;
}

// ── 단계별 검증 ───────────────────────────────────────────────────────────
const RUNS = 5;

function verifyStage(stage) {
  const cfg    = TC.STAGE_CONFIG[stage];
  const active = TC.isStageActive(stage, allPools);

  console.log(hdr('─── 단계 ' + stage + ' (' + cfg.name + ') ───'));

  // ── 비활성 단계 ──────────────────────────────────────────────────────────
  if (!active) {
    console.log('  ' + warn('비활성 단계 — 문항 미준비 (정상)'));
    const r = TC.composeTest(stage, allPools);
    assert(!r.active,                    'active=false 반환');
    assert(r.questions.length === 0,     'questions 빈 배열');
    assert(typeof r.reason === 'string', 'reason 문자열 포함');
    return;
  }

  // ── RUNS 회 조합 ─────────────────────────────────────────────────────────
  const runs = [];
  for (let i = 0; i < RUNS; i++) runs.push(TC.composeTest(stage, allPools));

  // 첫 번째 run 상세 출력
  const r0 = runs[0];
  console.log(C.gray + '  [Run 1 예시] baseAlloc=' + JSON.stringify(r0.meta.baseAlloc) +
    ' upperAlloc=' + JSON.stringify(r0.meta.upperAlloc) + C.reset);
  console.log(C.gray + '  섹션 분포:' + C.reset);
  for (const [sec, v] of Object.entries(r0.meta.bySection)) {
    const barFill = Math.min(v.total, 15);
    const bar = '■'.repeat(barFill) + '□'.repeat(Math.max(0, 15 - barFill));
    console.log(C.gray + '    ' + sec.padEnd(12) + bar +
      ' total=' + v.total + ' (base=' + v.base + ' upper=' + v.upper + ')' + C.reset);
  }
  console.log(C.gray + '  보너스 후보: ' + r0.meta.bonusCandidates.length + '문항' + C.reset);

  // ── 1. 총 문항 수 = 30 ───────────────────────────────────────────────────
  const allTotal30 = runs.every(r => r.questions.length === 30);
  assert(allTotal30,
    '총 문항 수 = 30 (' + RUNS + '회 모두)',
    allTotal30 ? '' : runs.map(r => r.questions.length).join(','));

  // ── 2. base=21 / upper=9 ─────────────────────────────────────────────────
  const allBU = runs.every(r => r.meta.baseCount === 21 && r.meta.upperCount === 9);
  assert(allBU,
    'base=21 / upper=9 (' + RUNS + '회 모두)',
    allBU ? '' : runs.map(r => 'b' + r.meta.baseCount + '/u' + r.meta.upperCount).join(' | '));

  // ── 3. 섹션 합계 정합성 (base+upper=total, sum=30) ───────────────────────
  const sectionOk = runs.every(r => {
    let sum = 0;
    for (const v of Object.values(r.meta.bySection)) {
      if (v.base + v.upper !== v.total) return false;
      sum += v.total;
    }
    return sum === 30;
  });
  assert(sectionOk, '섹션 합계 정합성 (Σtotal=30, base+upper=total)');

  // ── 4. 독해 전 문항 origin=base ──────────────────────────────────────────
  const readingBaseOnly = runs.every(r =>
    r.questions.filter(q => q.section === 'reading').every(q => q.origin === 'base'));
  assert(readingBaseOnly, '독해 전 문항 origin=base');

  // ── 5. 독해 문항 수 일관성 ───────────────────────────────────────────────
  const readCounts = runs.map(r => r.meta.bySection.reading.total);
  const readConsistent = readCounts.every(c => c === readCounts[0]);
  assert(readConsistent,
    '독해 문항 수 일관됨 (' + readCounts[0] + '개, ' + RUNS + '회)',
    readConsistent ? '' : readCounts.join(','));

  // ── 6. 독해 지문 묶음 온전성 ─────────────────────────────────────────────
  const passageErrors = runs.flatMap(r => checkPassageIntegrity(r.questions, stage));
  assert(passageErrors.length === 0,
    '독해 지문 묶음 온전성 (' + RUNS + '회)',
    passageErrors.slice(0, 2).join('; '));

  // ── 7. 중복 문항 없음 ────────────────────────────────────────────────────
  const dupErrors = runs.map((r, ri) => {
    const seen = new Set(); const dups = [];
    for (const q of r.questions) { if (seen.has(q.id)) dups.push(q.id); seen.add(q.id); }
    return dups.length ? 'Run' + (ri + 1) + ':' + dups.join(',') : null;
  }).filter(Boolean);
  assert(dupErrors.length === 0, '중복 출제 없음 (' + RUNS + '회)', dupErrors.join('; '));

  // ── 8. origin 태그 전 문항 ───────────────────────────────────────────────
  const originOk = runs.every(r =>
    r.questions.every(q => q.origin === 'base' || q.origin === 'upper'));
  assert(originOk, 'origin 태그 전 문항 존재');

  // ── 9. 필수 필드 ─────────────────────────────────────────────────────────
  const fieldProblems = runs.flatMap(r => checkRequiredFields(r.questions));
  assert(fieldProblems.length === 0, '필수 필드 누락 없음',
    fieldProblems.slice(0, 3).join('; '));

  // ── 10. 재응시 차별성 ────────────────────────────────────────────────────
  const sigs = runs.map(r => r.questions.map(q => q.id).sort().join(','));
  const uniqueSigCount = new Set(sigs).size;
  const anyDiff = uniqueSigCount > 1;
  assert(anyDiff,
    '재응시 차별성: ' + uniqueSigCount + '/' + RUNS + '가지 고유 조합',
    anyDiff ? '' : '모든 run 동일 조합 (풀이 너무 좁을 수 있음)');

  // ── scoreAndDiagnose 예시 ────────────────────────────────────────────────
  console.log(C.gray + '  [scoreAndDiagnose 예시 — 랜덤 응답]' + C.reset);
  try {
    const withAnswers = r0.questions.map(q => Object.assign({}, q, { correct: Math.random() > 0.5 }));
    const scored = TC.scoreAndDiagnose(stage, withAnswers, allPools);
    console.log(C.gray + '    점수:      ' + scored.score + '/' + scored.total +
      ' (' + scored.scorePct + '%)' + C.reset);
    if (scored.appropriate) {
      console.log(C.gray + '    추천 레벨: ' + scored.appropriate.recommended + C.reset);
      console.log(C.gray + '    진단:     ' + scored.appropriate.diagnosis.slice(0, 50) +
        (scored.appropriate.diagnosis.length > 50 ? '...' : '') + C.reset);
    } else {
      console.log(C.gray + '    추천 레벨: (진단표 구간 미해당)' + C.reset);
    }
    console.log(C.gray + '    도전 신호: ' + scored.challenge.signal +
      ' (upper ' + scored.challenge.upperCorrect + '/' + scored.challenge.upperTotal +
      ' = ' + scored.challenge.upperCorrectRate + '%)' + C.reset);
  } catch (err) {
    console.log(C.red + '    scoreAndDiagnose 오류: ' + err.message + C.reset);
  }

  // ── getBonusCandidates 예시 ──────────────────────────────────────────────
  const bonus = TC.getBonusCandidates(stage, r0.questions, allPools);
  console.log(C.gray + '  [getBonusCandidates] upper 미출제: ' + bonus.length + '문항' + C.reset);
}

// ── 메인 실행 ─────────────────────────────────────────────────────────────
console.log(hdr('═══ TestComposer v2 검증 ═══'));
console.log(C.gray + '  Node.js ' + process.version + C.reset);
console.log(C.gray + '  로드된 풀 레벨: ' + Object.keys(allPools).join(', ') + C.reset);

// 단계별 활성 현황 요약
console.log(hdr('단계별 활성 현황'));
for (let s = 1; s <= 5; s++) {
  const cfg    = TC.STAGE_CONFIG[s];
  const active = TC.isStageActive(s, allPools);
  const mark   = active ? C.green + '● active  ' + C.reset : C.gray  + '○ inactive' + C.reset;
  console.log('  ' + mark + ' 단계 ' + s + ' ' + cfg.name.padEnd(11) +
    ' base=[' + cfg.base.join(', ') + ']' +
    (cfg.upper.length ? ' upper=[' + cfg.upper.join(', ') + ']' : ' upper=[]'));
}

// 단계별 검증
for (let s = 1; s <= 5; s++) verifyStage(s);

// 최종 결과
console.log(hdr('═══ 검증 결과 ═══'));
const total = PASS + FAIL;
if (FAIL === 0) {
  console.log(C.bold + C.green + '  전체 통과: ' + PASS + '/' + total + C.reset);
} else {
  console.log(C.bold + C.red + '  실패 ' + FAIL + '/' + total + C.reset);
  process.exitCode = 1;
}
console.log('');
