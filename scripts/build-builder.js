/**
 * build-builder.js
 *
 * data/source-materials/englab_item_bank.json의 builder-1-8 시험지를
 * 앱용 포맷으로 변환한다.
 *
 * 출력:
 *   public/questions.builder.json  — Builder 문항 (questions.englab.json과 동일 포맷)
 *   public/diagnostics.builder.json — Builder 진단표 (diagnostics.json과 동일 포맷)
 *
 * 특이사항:
 *   - builder-1-8의 모든 문항은 image_dependent:true.
 *     → stem(질문 텍스트) + answer_note(정답 설명)는 추출,
 *       이미지 보기(options)는 이미지에 있으므로 placeholder 처리.
 *     → questionType: "picture_choice" (이미지+보기 함께 렌더링 필요)
 *     → imageFile: 순차적 이미지 파일명 (실제 문항-이미지 매핑은 수기 검수 필요)
 *   - Reading Comprehension 4문항: passage가 이미지에 있어 passage 필드 없음.
 *
 * 실행: node scripts/build-builder.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT      = path.join(__dirname, '..');
const BANK_FILE = path.join(ROOT, 'data', 'source-materials', 'englab_item_bank.json');
const OUT_Q     = path.join(ROOT, 'public', 'questions.builder.json');
const OUT_D     = path.join(ROOT, 'public', 'diagnostics.builder.json');

// Builder 난이도 범위 (Challenger 4~6 바로 아래)
const DIFF_MIN = 2;
const DIFF_MAX = 4;

// 섹션명 정규화
const SECTION_MAP = {
  'Vocabulary':            'vocabulary',
  'Grammar & Structure':   'grammar',
  'Reading Comprehension': 'reading',
  'Writing':               'writing',
};

const ANSWER_MAP = { a: 0, b: 1, c: 2, d: 3 };

function assignDifficulty(idxInSection, sectionSize) {
  if (sectionSize <= 1) return DIFF_MIN;
  const t = idxInSection / (sectionSize - 1);
  return Math.round(DIFF_MIN + t * (DIFF_MAX - DIFF_MIN));
}

function build() {
  const bank = JSON.parse(fs.readFileSync(BANK_FILE, 'utf8'));
  const test = bank.tests.find(t => t.test_id === 'builder-1-8');
  if (!test) {
    console.error('builder-1-8 not found in item bank');
    process.exit(1);
  }

  // ── 섹션별 문항 수 집계 (난이도 배분용) ──────────────────────────────────
  const secTotals = {};
  const secIdx    = {};
  for (const q of test.questions) {
    const sec = SECTION_MAP[q.section] || q.section.toLowerCase();
    secTotals[sec] = (secTotals[sec] || 0) + 1;
  }
  for (const s of Object.keys(secTotals)) secIdx[s] = 0;

  // ── 문항 변환 ─────────────────────────────────────────────────────────────
  const converted = [];
  const skipped   = [];
  let imgCounter  = 1;  // 이미지 파일 순번 (문항 no와 1:1 대응 가정 — 수기 검수 필요)

  for (const q of test.questions) {
    const section = SECTION_MAP[q.section];
    if (!section) {
      skipped.push({ no: q.no, reason: '섹션 미인식: ' + q.section });
      imgCounter++;
      continue;
    }

    const idxInSec  = secIdx[section];
    secIdx[section] = idxInSec + 1;

    const difficulty = assignDifficulty(idxInSec, secTotals[section]);
    const answerIdx  = ANSWER_MAP[(q.answer || 'a').toLowerCase().trim()] ?? 0;

    // 이미지 파일명: 순번 2자리 패딩 (문항-이미지 실제 매핑은 수기 검수 필요)
    const imageFile = 'builder-1-8_img' + String(imgCounter).padStart(2, '0') + '.png';
    imgCounter++;

    // options: 이미지에 있으므로 정답 위치 유지한 placeholder 3개
    // (실제 렌더링은 imageFile에서 담당)
    const options = ['(보기 A)', '(보기 B)', '(보기 C)'];

    converted.push({
      id:           'builder-1-8-q' + q.no,
      test_id:      'builder-1-8',
      level:        'Builder',
      book_range:   '1-8',
      section,
      no:           q.no,
      questionType: 'picture_choice',
      type:         section,
      difficulty,
      question:     (q.stem || '').trim(),
      imageFile,
      options,
      answer:       answerIdx,
      needs_review: true,
      answer_note:  (q.answer_note || '').trim(),
    });
  }

  // ── 검증 리포트 ───────────────────────────────────────────────────────────
  const secCount = {};
  for (const q of converted) secCount[q.section] = (secCount[q.section] || 0) + 1;

  console.log('\n✅ builder-1-8');
  console.log('   변환: ' + converted.length + '문항 | 섹션: ' + JSON.stringify(secCount));
  if (skipped.length > 0) {
    console.log('   스킵: ' + skipped.length + '문항');
    skipped.forEach(s => console.log('     no.' + s.no + ': ' + s.reason));
  } else {
    console.log('   스킵: 0문항');
  }
  console.log('   ⚠️  image_dependent 전 문항 — 이미지-문항 매핑은 수기 검수 필요');
  console.log('   ⚠️  imageFile은 순번 기준 placeholder (needs_review:true)');

  // ── 파일 출력 ─────────────────────────────────────────────────────────────
  const qOut = { Builder: { '1-8': converted } };
  fs.writeFileSync(OUT_Q, JSON.stringify(qOut, null, 2), 'utf8');

  const dOut = { Builder: { '1-8': test.diagnostic_table || [] } };
  fs.writeFileSync(OUT_D, JSON.stringify(dOut, null, 2), 'utf8');

  console.log('\n📁 출력 파일:');
  console.log('   ' + OUT_Q);
  console.log('   ' + OUT_D);
  console.log('\n완료.\n');
}

build();
