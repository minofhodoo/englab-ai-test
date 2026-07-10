/**
 * builder-render-check.js
 * Builder(stage 2) 렌더링 분기 검증 (서버 불필요)
 *
 * 검증 항목:
 *  1. composeTest(2) 활성 확인
 *  2. questions.builder.json 30문항 questionType 분류
 *  3. 섹션·questionType 매핑 (vocabulary→picture_choice, grammar/reading→multiple_choice, writing→fillin)
 *  4. picture_choice 이미지 파일 실제 존재 확인 (public/img/)
 *  5. reading passage 필드 존재 확인
 *  6. test.html 렌더링 분기 소스 확인 (picture_choice/imageOptions, multiple_choice, fillin)
 *  7. fillin → renderChoices (D&D 아님) 확인
 *  8. Builder writing에 unscramble 없음 확인
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT   = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const IMG_DIR = path.join(PUBLIC, 'img');

let passed = 0, failed = 0;
const failures = [];

function assert(cond, label) {
  if (cond) { console.log(`  PASS  ${label}`); passed++; }
  else       { console.error(`  FAIL  ${label}`); failures.push(label); failed++; }
}

// ── 1. composeTest(2) 활성 확인 ──────────────────────────────────────────────
console.log('\n[Check 1] composeTest(2) 활성');
const TC = require('../public/test-composer');
const result = TC.composeTest(2);
assert(result.active === true, 'composeTest(2) active:true');
assert(Array.isArray(result.questions) && result.questions.length > 0, 'composeTest(2) 문항 존재');

// ── 2. questions.builder.json 구조 확인 ──────────────────────────────────────
console.log('\n[Check 2] questions.builder.json 구조');
const builderData = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'questions.builder.json'), 'utf8'));
const allQs = builderData['Builder']['1-8'];
assert(Array.isArray(allQs), 'Builder["1-8"] 배열 존재');
assert(allQs.length === 30, `총 30문항 (실제: ${allQs.length})`);

const byType = {};
allQs.forEach(q => { byType[q.questionType] = (byType[q.questionType] || 0) + 1; });
assert((byType['picture_choice']  || 0) === 5,  `picture_choice 5문항 (실제: ${byType['picture_choice'] || 0})`);
assert((byType['multiple_choice'] || 0) === 14, `multiple_choice 14문항 (grammar10+reading4) (실제: ${byType['multiple_choice'] || 0})`);
assert((byType['fillin']          || 0) === 11, `fillin 11문항 (실제: ${byType['fillin'] || 0})`);
assert((byType['unscramble']      || 0) === 0,  'unscramble 0문항 (Builder에 D&D 없음)');

// ── 3. 섹션·questionType 매핑 ─────────────────────────────────────────────────
console.log('\n[Check 3] 섹션·questionType 매핑');
const vocabQs   = allQs.filter(q => q.section === 'vocabulary');
const grammarQs = allQs.filter(q => q.section === 'grammar');
const readingQs = allQs.filter(q => q.section === 'reading');
const writingQs = allQs.filter(q => q.section === 'writing');

assert(vocabQs.length   === 5,  `vocabulary 5문항 (실제: ${vocabQs.length})`);
assert(grammarQs.length === 10, `grammar 10문항 (실제: ${grammarQs.length})`);
assert(readingQs.length === 4,  `reading 4문항 (실제: ${readingQs.length})`);
assert(writingQs.length === 11, `writing 11문항 (실제: ${writingQs.length})`);

assert(vocabQs.every(q   => q.questionType === 'picture_choice'),  'vocabulary   → picture_choice');
assert(grammarQs.every(q => q.questionType === 'multiple_choice'), 'grammar      → multiple_choice');
assert(readingQs.every(q => q.questionType === 'multiple_choice'), 'reading      → multiple_choice');
assert(writingQs.every(q => q.questionType === 'fillin'),          'writing      → fillin (D&D 아님)');

// ── 4. picture_choice 이미지 파일 존재 ───────────────────────────────────────
console.log('\n[Check 4] picture_choice 이미지 파일 존재');
const imgFiles = new Set(fs.readdirSync(IMG_DIR));
let allImgOk = true;

for (const q of vocabQs) {
  assert(q.imageOptions === true, `Q${q.no} imageOptions:true`);
  assert(Array.isArray(q.options) && q.options.length === 3, `Q${q.no} options 배열 3개`);
  for (const f of (q.options || [])) {
    const ok = imgFiles.has(f);
    if (!ok) allImgOk = false;
    assert(ok, `Q${q.no} 이미지 파일 존재: ${f}`);
  }
}
assert(allImgOk, 'picture_choice 전체 이미지(15개) 파일 확인');

// ── 5. reading passage 필드 ────────────────────────────────────────────────────
console.log('\n[Check 5] reading passage 필드');
assert(
  readingQs.every(q => typeof q.passage === 'string' && q.passage.length > 0),
  'reading 4문항 모두 passage 필드 있음'
);
assert(
  readingQs.every(q => typeof q.passage_title === 'string'),
  'reading 4문항 모두 passage_title 있음'
);

// ── 6. test.html 렌더링 분기 소스 확인 ───────────────────────────────────────
console.log('\n[Check 6] test.html 렌더링 분기 소스');
const testHtml = fs.readFileSync(path.join(PUBLIC, 'test.html'), 'utf8');

assert(
  testHtml.includes("q.questionType === 'picture_choice'"),
  "test.html: picture_choice 분기 존재"
);
assert(
  testHtml.includes('q.imageOptions'),
  "test.html: renderPictureChoice에 imageOptions 분기 존재"
);
assert(
  testHtml.includes("q.questionType === 'multiple_choice'"),
  "test.html: multiple_choice 분기 존재"
);
assert(
  testHtml.includes("q.questionType === 'fillin'"),
  "test.html: fillin 분기 존재"
);
assert(
  testHtml.includes("q.questionType === 'image_prompt_choice'"),
  "test.html: image_prompt_choice (Seeker) 분기 존재(하위호환)"
);
assert(
  testHtml.includes("q.questionType === 'unscramble'"),
  "test.html: unscramble 분기 존재(하위호환)"
);

// ── 7. fillin → renderChoices 확인 ───────────────────────────────────────────
console.log('\n[Check 7] fillin → renderChoices (D&D 아님)');
const fillinIdx = testHtml.indexOf("questionType === 'fillin'");
assert(fillinIdx >= 0, "test.html: fillin 분기 인덱스 발견");
if (fillinIdx >= 0) {
  const snippet = testHtml.slice(fillinIdx, fillinIdx + 200);
  assert(snippet.includes('renderChoices'),   'fillin 분기 → renderChoices 호출');
  assert(!snippet.includes('renderUnscramble'), 'fillin 분기 → renderUnscramble 호출 없음');
}

// ── 8. Builder writing → fillin (unscramble 없음) 재확인 ─────────────────────
console.log('\n[Check 8] Builder writing D&D 없음');
assert(
  writingQs.every(q => q.questionType !== 'unscramble'),
  'writing 문항에 unscramble(D&D) 없음'
);
assert(
  writingQs.every(q => q.questionType === 'fillin'),
  'writing 문항 전부 fillin'
);
// fillin ko_hint 존재
assert(
  writingQs.every(q => typeof q.ko_hint === 'string' && q.ko_hint.length > 0),
  'writing 11문항 모두 ko_hint 있음'
);

// ── 결과 ─────────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(56)}`);
console.log(`결과: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.error('\n실패 항목:');
  failures.forEach(f => console.error(`  - ${f}`));
}
if (failed > 0) process.exit(1);
