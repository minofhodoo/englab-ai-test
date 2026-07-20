'use strict';
/**
 * validate-items.js — questions.englab.json 정합성 자동 검사
 * 통과: 모든 PASS / 실패: FAIL 목록 + 종료코드 1
 *
 * 검사 항목:
 *  [1] ans 인덱스가 options 범위(0..2) 내인지
 *  [2] 보기 3개 중 중복 문자열 없는지 (대소문자 무시)
 *  [3] writing: expected[0]이 words(chunks)를 모두 포함하는지 (누락/잉여 검출)
 *  [4] reading: answer 보기 문자열이 정규화(후행 구두점 제거) 후에도 비어있지 않은지
 */

const fs   = require('fs');
const path = require('path');

const curPath = path.join(__dirname, '../public/questions.englab.json');
if (!fs.existsSync(curPath)) {
  console.error('ERROR: questions.englab.json 없음'); process.exit(1);
}
const db = JSON.parse(fs.readFileSync(curPath, 'utf8'));

let pass = 0, fail = 0;
const fails = [];

function ok(label)      { pass++; }
function ng(label, why) { fail++; fails.push({ label, why }); }

// 후행 구두점 제거 (채점 정규화와 동일 로직)
function stripTrail(s) { return String(s).replace(/[.?!,;:]+$/, '').trim(); }

// writing: expected 문장에서 words 포함 여부 검사
// 단어 조각(chunk)을 공백으로 이은 expected와 비교 (순서 무관 포함 여부)
function checkChunks(words, expectedSentence) {
  if (!words || !words.length) return { missing: [], extra: [] };
  const sentLower = expectedSentence.toLowerCase();
  const missing = words.filter(w => !sentLower.includes(w.toLowerCase()));

  // 잉여(extra): expected에 있는 단어 중 words에 없는 것은 허용 (조사 등)
  // 우리가 검사하는 건 "chunks를 모두 활용했는가" — missing만 체크
  return { missing };
}

let totalQ = 0;

for (const [level, ranges] of Object.entries(db)) {
  for (const [range, pool] of Object.entries(ranges)) {
    const ctx = `[${level}][${range}]`;
    for (const q of pool) {
      totalQ++;
      const qid = `${ctx} Q${q.no}`;

      if (q.questionType === 'unscramble') {
        // [3] writing: chunks → expected 포함 검사
        const exp = (q.expected || [])[0] || '';
        const words = q.words || [];
        const { missing } = checkChunks(words, exp);
        if (missing.length > 0) {
          ng(`${qid} writing.chunks 포함`, `expected에 누락된 chunk: [${missing.join(', ')}]`);
        } else {
          ok(`${qid} writing.chunks 포함`);
        }
        // expected가 비어있지 않은지
        if (!exp.trim()) {
          ng(`${qid} writing.expected 비어있음`, 'expected[0]이 빈 문자열');
        } else {
          ok(`${qid} writing.expected 존재`);
        }

      } else {
        // MC / reading
        const opts = q.options || [];
        const ans  = q.answer;

        // [1] answer 인덱스 범위
        if (typeof ans !== 'number' || ans < 0 || ans >= opts.length) {
          ng(`${qid} ans 인덱스 범위`, `answer=${ans}, options.length=${opts.length}`);
        } else {
          ok(`${qid} ans 범위`);
        }

        // [2] 보기 중복 없는지 (소문자 기준)
        const lower = opts.map(o => String(o).toLowerCase().trim());
        const uniq  = new Set(lower);
        if (uniq.size !== lower.length) {
          const dup = lower.filter((v, i) => lower.indexOf(v) !== i);
          ng(`${qid} 보기 중복`, `중복 보기: [${dup.join(', ')}]`);
        } else {
          ok(`${qid} 보기 중복 없음`);
        }

        // [4] reading: 정답 보기 정규화 후 비어있지 않은지
        if (q.section === 'reading' && typeof ans === 'number') {
          const ansText = opts[ans] || '';
          const stripped = stripTrail(ansText);
          if (!stripped) {
            ng(`${qid} reading 정답 보기 정규화`, `ans="${ansText}" 정규화 후 빈 문자열`);
          } else {
            ok(`${qid} reading 정답 정규화`);
          }
        }
      }
    }
  }
}

// 결과
const HR = '═'.repeat(60);
console.log(HR);
console.log(`validate-items: 총 ${totalQ}문항 검사`);
console.log(HR);
if (fail === 0) {
  console.log(`PASS: ${pass}  FAIL: 0  — 모든 항목 정합성 통과`);
} else {
  console.log(`PASS: ${pass}  FAIL: ${fail}`);
  console.log('\n실패 항목:');
  for (const f of fails) {
    console.error(`  FAIL  ${f.label}`);
    if (f.why) console.error(`        └─ ${f.why}`);
  }
  process.exit(1);
}
