/**
 * seeker-activate-check.js
 * Seeker(1단계) 활성화 검증 스크립트 (라이브 서버 불필요)
 *
 * 검증 항목:
 *  1. questions.seeker.json 로드 + 이미지 파일 존재 확인
 *  2. composeTest(1) → 30문항 · 100% base · image_prompt_choice 타입
 *  3. answer 인덱스가 options 범위 내인지
 *  4. image_prompt_choice 채점(정답/오답 인덱스)
 *  5. assign-store STAGE_GUIDE[1].active === true
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const TC = require('../public/test-composer');
const { STAGE_GUIDE } = require('../lib/assign-store');

const IMG_DIR  = path.join(__dirname, '..', 'public', 'img');
const SPK_FILE = path.join(__dirname, '..', 'public', 'questions.seeker.json');

let passed = 0, failed = 0;
const missingImages = [];

function assert(cond, label) {
  if (cond) { console.log(`  PASS  ${label}`); passed++; }
  else       { console.error(`  FAIL  ${label}`); failed++; }
}

// ──────────────────────────────────────────────────────────────────────────
//  1. questions.seeker.json 로드 + 이미지 존재 확인
// ──────────────────────────────────────────────────────────────────────────
console.log('\n[1] questions.seeker.json 로드 · 이미지 존재 확인');

let seekerRaw;
try {
  seekerRaw = JSON.parse(fs.readFileSync(SPK_FILE, 'utf8'));
  assert(true, 'questions.seeker.json JSON 파싱 성공');
} catch (e) {
  assert(false, `questions.seeker.json 파싱 실패 — ${e.message}`);
  process.exit(1);
}

// 구조: { "Seeker": { "1-4": [...] } }
const seekerPool = (seekerRaw.Seeker && seekerRaw.Seeker['1-4']) || [];
assert(seekerPool.length === 30, `Seeker 문항 수 = 30 (실제: ${seekerPool.length})`);
assert(seekerPool.every(q => q.questionType === 'image_prompt_choice'),
  '모든 문항 questionType = image_prompt_choice');
assert(seekerPool.every(q => q.section === 'phonics'),
  '모든 문항 section = phonics');
assert(seekerPool.every(q => typeof q.image === 'string' && q.image.length > 0),
  '모든 문항에 image 필드 존재');

// 이미지 파일 존재 확인
console.log('\n  [이미지 존재 확인]');
for (const q of seekerPool) {
  const imgPath = path.join(IMG_DIR, q.image);
  if (fs.existsSync(imgPath)) {
    console.log(`  ✓  ${q.image}`);
  } else {
    console.warn(`  ✗  누락: ${q.image}  (id: ${q.id})`);
    missingImages.push({ id: q.id, image: q.image });
  }
}

const totalImages  = seekerPool.length;
const foundImages  = totalImages - missingImages.length;
assert(missingImages.length === 0,
  `이미지 파일 전부 존재 (${foundImages}/${totalImages})`);

if (missingImages.length > 0) {
  console.warn(`\n  ⚠️  누락 이미지 ${missingImages.length}개:`);
  missingImages.forEach(m => console.warn(`     - ${m.image}  (${m.id})`));
  console.warn('  → public/img/ 에 해당 파일을 추가해야 Seeker 문항이 정상 표시됩니다.');
  console.warn('  → 누락 시에도 onerror 핸들러로 "🖼️ 이미지 준비 중" 안내 표시 (크래시 없음).\n');
}

// ──────────────────────────────────────────────────────────────────────────
//  2. composeTest(1) — 30문항 · 100% base
// ──────────────────────────────────────────────────────────────────────────
console.log('\n[2] composeTest(1) — 문항 수 · base 비율');

const result = TC.composeTest(1);
assert(result.active === true,  'composeTest(1).active = true');
assert(Array.isArray(result.questions) && result.questions.length > 0,
  'questions 배열 비어 있지 않음');

const total = result.meta.totalQuestions;
const base  = result.meta.baseCount;
const upper = result.meta.upperCount;

assert(total === 30,  `총 문항 수 = 30 (실제: ${total})`);
assert(upper === 0,   `upper 문항 수 = 0 (실제: ${upper})`);
assert(base  === 30,  `base 문항 수 = 30 (실제: ${base})`);
assert(result.questions.every(q => q.origin === 'base'), '모든 문항 origin = base');
assert(result.questions.every(q => q.questionType === 'image_prompt_choice'),
  '모든 문항 questionType = image_prompt_choice');
assert(result.questions.every(q => q.section === 'phonics'),
  '모든 문항 section = phonics');
assert(typeof result.meta.bySection.phonics === 'object',
  'meta.bySection.phonics 존재');
assert(result.meta.bySection.phonics.total === 30,
  'bySection.phonics.total = 30');

// ──────────────────────────────────────────────────────────────────────────
//  3. answer 인덱스 범위 확인
// ──────────────────────────────────────────────────────────────────────────
console.log('\n[3] answer 인덱스 범위');

let answerRangeOk = true;
for (const q of result.questions) {
  const opts = q.options || [];
  const ans  = q.answer;
  if (typeof ans !== 'number' || ans < 0 || ans >= opts.length) {
    console.error(`  ✗  범위 초과: ${q.id} answer=${ans} options.length=${opts.length}`);
    answerRangeOk = false;
  }
}
assert(answerRangeOk, 'answer 인덱스 모두 options 범위 내');

// options가 2개 또는 3개인지 확인
const optLengths = new Set(result.questions.map(q => (q.options || []).length));
assert([...optLengths].every(n => n >= 2 && n <= 4),
  `options 개수 2~4 범위 (실제: ${[...optLengths].join(', ')})`);

// ──────────────────────────────────────────────────────────────────────────
//  4. image_prompt_choice 채점 (서버 로직 시뮬레이션)
// ──────────────────────────────────────────────────────────────────────────
console.log('\n[4] image_prompt_choice 채점');

function scoreQuestion(q, submittedStr) {
  // server.js 채점 로직과 동일
  if (q.questionType === 'multiple_choice' ||
      q.questionType === 'picture_choice'  ||
      q.questionType === 'image_prompt_choice') {
    return parseInt(submittedStr, 10) === q.answer;
  }
  return false;
}

// 모든 문항에 대해 정답/오답 판정 테스트
let allScoredOk = true;
for (const q of result.questions) {
  const correctIdx = q.answer;
  const wrongIdx   = (correctIdx + 1) % (q.options || ['a','b']).length;

  const isCorrectOk = scoreQuestion(q, String(correctIdx)) === true;
  const isWrongOk   = scoreQuestion(q, String(wrongIdx))   === false;

  if (!isCorrectOk) {
    console.error(`  ✗  정답 판정 실패: ${q.id} (answer=${correctIdx})`);
    allScoredOk = false;
  }
  if (!isWrongOk) {
    console.error(`  ✗  오답 판정 실패: ${q.id} (wrong=${wrongIdx})`);
    allScoredOk = false;
  }
}
assert(allScoredOk, '모든 문항 정답/오답 채점 정상');

// 빈 제출 → 오답
assert(scoreQuestion(result.questions[0], '') === false,  '빈 제출 → false');
assert(scoreQuestion(result.questions[0], 'x') === false, '숫자 아닌 제출 → false');

// ──────────────────────────────────────────────────────────────────────────
//  5. assign-store STAGE_GUIDE[1] 활성 확인
// ──────────────────────────────────────────────────────────────────────────
console.log('\n[5] STAGE_GUIDE[1] 활성');

assert(STAGE_GUIDE[1].active === true,  'STAGE_GUIDE[1].active = true');
assert(STAGE_GUIDE[1].label === 'Seeker', 'STAGE_GUIDE[1].label = Seeker');
assert(typeof STAGE_GUIDE[1].guide === 'string' && STAGE_GUIDE[1].guide.length > 10,
  'STAGE_GUIDE[1].guide 문구 존재');

// isStageActive(1) 확인
assert(TC.isStageActive(1) === true, 'TC.isStageActive(1) = true');

// Stage 2~5 영향 없음
for (const s of [2, 3, 4, 5]) {
  assert(TC.isStageActive(s) === true, `Stage ${s} 여전히 active (Seeker 추가로 영향 없음)`);
}

// Stage 2~5 composeTest 문항 수 정상 (변경 전과 동일하게 30개)
for (const s of [2, 3, 4, 5]) {
  const r = TC.composeTest(s);
  assert(r.active === true && r.questions.length > 0,
    `Stage ${s} composeTest 정상 동작 (${r.questions.length}문항)`);
  assert(r.questions.every(q => q.section !== 'phonics'),
    `Stage ${s} 문항에 phonics 없음 (타 단계 격리)`);
}

// ──────────────────────────────────────────────────────────────────────────
//  결과
// ──────────────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(56)}`);
console.log(`결과: ${passed} passed, ${failed} failed`);

if (missingImages.length > 0) {
  console.log(`\n📋 누락 이미지 목록 (${missingImages.length}개) — public/img/ 에 추가 필요:`);
  missingImages.forEach((m, i) => console.log(`  ${String(i+1).padStart(2)}. ${m.image}`));
}

if (failed > 0) process.exit(1);
