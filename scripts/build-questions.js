/**
 * build-questions.js
 *
 * 잉글랩 실제 지필 문항(data/source-materials/englab_item_bank.json)을
 * 앱용 포맷으로 변환한다.
 *
 * 대상: image_dependent:false 인 8종 (Challenger·Explorer·Inventor·Innovator × 1-6 / 7-12)
 * 출력:
 *   public/questions.englab.json  — 변환된 문항 (레벨 → book_range → 문항 배열)
 *   public/diagnostics.json       — 진단표 (레벨 → book_range → diagnostic_table)
 *
 * 실행: node scripts/build-questions.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── 경로 ──────────────────────────────────────────
const ROOT        = path.join(__dirname, '..');
const BANK_FILE   = path.join(ROOT, 'data', 'source-materials', 'englab_item_bank.json');
const OUT_QFILE   = path.join(ROOT, 'public', 'questions.englab.json');
const OUT_DFILE   = path.join(ROOT, 'public', 'diagnostics.json');

// ── 난이도 매핑 (level → [min, max]) ──────────────
// 문항 번호 기반으로 범위 내 선형 배분
const DIFFICULTY_RANGE = {
  Challenger: [4, 6],
  Explorer:   [6, 8],
  Inventor:   [7, 9],
  Innovator:  [8, 10],
};

function assignDifficulty(level, idxInSection, sectionSize) {
  const [min, max] = DIFFICULTY_RANGE[level] || [5, 7];
  if (sectionSize <= 1) return min;
  const t = idxInSection / (sectionSize - 1);
  return Math.round(min + t * (max - min));
}

// ── answer 변환: "a"/"b"/"c"/"d" → 0/1/2/3 ───────
const ANSWER_MAP = { a: 0, b: 1, c: 2, d: 3 };

function convertAnswer(answer) {
  if (typeof answer === 'number') return answer;
  return ANSWER_MAP[String(answer).toLowerCase().trim()] ?? null;
}

// ── 메인 변환 로직 ─────────────────────────────────
function buildQuestions() {
  const bank = JSON.parse(fs.readFileSync(BANK_FILE, 'utf8'));

  const outputByLevel = {};   // { "Challenger": { "1-6": [...], "7-12": [...] } }
  const diagnostics   = {};   // { "Challenger": { "1-6": [...] } }
  const skipped       = [];   // 스킵 항목 리스트

  let totalConverted = 0;

  const eligibleTests = bank.tests.filter(t => !t.image_dependent);
  console.log(`\n📚 변환 대상 시험지: ${eligibleTests.length}종 (image_dependent:false)\n`);

  for (const test of eligibleTests) {
    const { test_id, level, book_range, passages, questions, diagnostic_table } = test;

    // 레벨 인식
    if (!DIFFICULTY_RANGE[level]) {
      console.warn(`  ⚠️  알 수 없는 레벨 "${level}" (${test_id}) — 스킵`);
      continue;
    }

    // ── diagnostic_table 저장 ──────────────────────
    if (!diagnostics[level]) diagnostics[level] = {};
    diagnostics[level][book_range] = diagnostic_table || [];

    // ── 지문 맵 (passage_id → text) ───────────────
    const passageMap = {};
    for (const p of (passages || [])) {
      passageMap[p.id] = p.text;
    }

    // ── 섹션별 문항 인덱스 추적 (난이도 배분용) ───
    const sectionCounts  = {};  // { section: 전체 문항 수 }
    const sectionIdxMap  = {};  // { section: 현재 인덱스 }
    for (const q of questions) {
      sectionCounts[q.section] = (sectionCounts[q.section] || 0) + 1;
    }
    for (const s of Object.keys(sectionCounts)) sectionIdxMap[s] = 0;

    // ── 섹션명 정규화 (소문자 trim) ───────────────
    // 모든 대상 시험지는 이미 "vocabulary"/"grammar"/"reading"/"writing"
    const VALID_SECTIONS = new Set(['vocabulary', 'grammar', 'reading', 'writing']);

    // ── 문항 변환 ──────────────────────────────────
    const converted = [];
    const testSkips = [];

    for (const q of questions) {
      const section = (q.section || '').toLowerCase().trim();
      const idxInSec = sectionIdxMap[section] ?? 0;
      sectionIdxMap[section] = idxInSec + 1;

      // ① 공통 유효성 검사
      if (!VALID_SECTIONS.has(section)) {
        testSkips.push({ test_id, no: q.no, reason: `섹션 미인식: "${q.section}"` });
        continue;
      }
      if (!q.type) {
        testSkips.push({ test_id, no: q.no, reason: 'type 필드 없음' });
        continue;
      }

      const difficulty = assignDifficulty(level, idxInSec, sectionCounts[section] || 1);
      const id = `${test_id}-q${q.no}`;

      // ② multiple_choice 변환
      if (q.type === 'multiple_choice') {
        if (!q.options || q.options.length === 0) {
          testSkips.push({ test_id, no: q.no, reason: '보기(options) 없음' });
          continue;
        }
        if (!q.stem || q.stem.trim() === '') {
          testSkips.push({ test_id, no: q.no, reason: 'stem 비어 있음' });
          continue;
        }

        const options = q.options.map(o => o.text);
        const answerIdx = convertAnswer(q.answer);

        if (answerIdx === null || answerIdx < 0 || answerIdx >= options.length) {
          testSkips.push({ test_id, no: q.no, reason: `정답 인덱스 범위 초과 (answer="${q.answer}", options=${options.length}개)` });
          continue;
        }

        const item = {
          id,
          test_id,
          level,
          book_range,
          section,
          no: q.no,
          questionType: 'multiple_choice',
          type: section,              // byType 집계 키 (기존 questions.json 관례 유지)
          difficulty,
          question: q.stem.trim(),
          options,
          answer: answerIdx,
        };

        // reading: 지문 내재화
        if (section === 'reading' && q.passage_id) {
          const passageText = passageMap[q.passage_id];
          if (passageText) {
            item.passage = passageText;
          } else {
            testSkips.push({ test_id, no: q.no, reason: `passage_id "${q.passage_id}" 참조 실패` });
            continue;
          }
        }

        converted.push(item);

      // ③ unscramble (writing) 변환
      } else if (q.type === 'unscramble') {
        if (!q.chunks || q.chunks.length === 0) {
          testSkips.push({ test_id, no: q.no, reason: 'chunks 없음' });
          continue;
        }
        if (!q.answer || q.answer.trim() === '') {
          testSkips.push({ test_id, no: q.no, reason: 'answer(완성 문장) 없음' });
          continue;
        }

        converted.push({
          id,
          test_id,
          level,
          book_range,
          section,
          no: q.no,
          questionType: 'unscramble',
          type: 'writing',
          difficulty,
          question: q.stem ? q.stem.trim() : '다음 단어를 올바른 순서로 배열하세요.',
          words: [...q.chunks],         // chunks → words
          expected: [q.answer.trim()],  // answer → expected[0]
        });

      } else {
        // image_dependent 등 처리 불가 타입
        testSkips.push({ test_id, no: q.no, reason: `처리 불가 type: "${q.type}"` });
      }
    }

    // ── 시험지별 결과 집계 ─────────────────────────
    const secCount = {};
    for (const item of converted) {
      secCount[item.section] = (secCount[item.section] || 0) + 1;
    }

    const passCount = converted.filter(q => q.section === 'reading' && q.passage).length;
    const ansValid  = converted.every(q => {
      if (q.questionType === 'multiple_choice') return typeof q.answer === 'number' && q.answer >= 0 && q.answer < q.options.length;
      if (q.questionType === 'unscramble')      return q.expected.length > 0 && q.expected[0].length > 0;
      return false;
    });

    console.log(`✅ ${test_id}`);
    console.log(`   변환: ${converted.length}문항 | 섹션: ${JSON.stringify(secCount)}`);
    console.log(`   독해 지문 내재화: ${passCount}문항 | 정답 검증: ${ansValid ? '✓ 통과' : '✗ 실패'}`);
    if (testSkips.length > 0) {
      console.log(`   스킵: ${testSkips.length}문항`);
      testSkips.forEach(s => console.log(`     no.${s.no}: ${s.reason}`));
    }

    // ── 레벨별 그룹핑 저장 ────────────────────────
    if (!outputByLevel[level]) outputByLevel[level] = {};
    outputByLevel[level][book_range] = converted;

    totalConverted += converted.length;
    skipped.push(...testSkips);
  }

  // ── 파일 쓰기 ──────────────────────────────────
  fs.writeFileSync(OUT_QFILE, JSON.stringify(outputByLevel, null, 2), 'utf8');
  fs.writeFileSync(OUT_DFILE, JSON.stringify(diagnostics,   null, 2), 'utf8');

  // ── 최종 요약 ──────────────────────────────────
  console.log('\n──────────────────────────────────────────');
  console.log(`📊 전체 변환 결과`);
  console.log(`   총 변환 문항: ${totalConverted}개`);
  console.log(`   총 스킵 문항: ${skipped.length}개`);

  // 레벨별 요약
  for (const [lv, byRange] of Object.entries(outputByLevel)) {
    const total = Object.values(byRange).reduce((s, arr) => s + arr.length, 0);
    const ranges = Object.keys(byRange).join(', ');
    console.log(`   ${lv}: ${total}문항 (${ranges})`);
  }

  if (skipped.length > 0) {
    console.log('\n⚠️  스킵 문항 전체 목록:');
    skipped.forEach(s => console.log(`   ${s.test_id} no.${s.no} — ${s.reason}`));
  }

  console.log(`\n📁 출력 파일:`);
  console.log(`   ${OUT_QFILE}`);
  console.log(`   ${OUT_DFILE}`);
  console.log('\n완료.\n');
}

buildQuestions();
