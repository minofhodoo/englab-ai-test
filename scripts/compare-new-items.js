'use strict';
/**
 * compare-new-items.js
 * englab_items_NEW_20260720.json vs questions.englab.json 차이 보고
 * ── 읽기 전용. 데이터 수정 없음 ──────────────────────────────────────────
 */

const fs   = require('fs');
const path = require('path');

const newPath = path.join(__dirname, '../englab_items_NEW_20260720.json');
const curPath = path.join(__dirname, '../public/questions.englab.json');

if (!fs.existsSync(newPath)) { console.error('ERROR: englab_items_NEW_20260720.json 없음'); process.exit(1); }
if (!fs.existsSync(curPath)) { console.error('ERROR: questions.englab.json 없음');          process.exit(1); }

const newData = JSON.parse(fs.readFileSync(newPath, 'utf8'));
const curData = JSON.parse(fs.readFileSync(curPath, 'utf8'));

// ── 세트 매핑 ─────────────────────────────────────────────────────────────
//   NEW 세트명          → questions.englab.json 의 [level][range]
const SET_MAP = [
  { id: 'challenger-1-6',  level: 'Challenger', range: '1-6'  },
  { id: 'challenger-7-12', level: 'Challenger', range: '7-12' },
  { id: 'explorer-7-12',   level: 'Explorer',   range: '7-12' },
  { id: 'inventor-1-6',    level: 'Inventor',   range: '1-6'  },
];

// a/b/c → 0/1/2
function ai(ans) { return { a: 0, b: 1, c: 2 }[String(ans).toLowerCase()]; }

// 공백 정규화
function norm(s) { return String(s == null ? '' : s).trim().replace(/\s+/g, ' '); }

// 배열 정규화 (정렬 후 비교)
function normArr(arr) { return (arr || []).map(norm).sort().join('|||'); }

// ── [0] 매핑 규칙 출력 ────────────────────────────────────────────────────
const HR = '═'.repeat(70);
const hr = '─'.repeat(70);

console.log(HR);
console.log('[0] 매핑 규칙 확인 (먼저 검토해 주세요)');
console.log(HR);
console.log('NEW 세트 ID             → questions.englab.json 경로       현재 문항 수');
console.log(hr);
for (const { id, level, range } of SET_MAP) {
  const pool = ((curData[level] || {})[range] || []);
  console.log(`${id.padEnd(24)} → [${level}][${range}]`.padEnd(52) + `${pool.length}문항`);
}
console.log();
console.log('필드 매핑:');
console.log('  NEW.no            ↔  current.no          (번호로 1:1 매핑)');
console.log('  NEW.q             ↔  current.question    (문제 지문)');
console.log('  NEW.opts[0..2]    ↔  current.options[0..2]');
console.log('  NEW.ans (a/b/c)   ↔  current.answer (0/1/2)  [MC/reading]');
console.log('  NEW.passage       ↔  current.passage          [reading, 직접 있는 것만]');
console.log('  NEW.ans (문장)    ↔  current.expected[0]      [writing]');
console.log('  NEW.chunks        ↔  current.words            [writing D&D]');
console.log('  passageRef 항목의 passage 비교는 건너뜀 (레포 구조가 다를 수 있음)');
console.log();

// ── 비교 수행 ─────────────────────────────────────────────────────────────
const diffs         = [];   // { set, no, field, cur, new_ }
const missingInCur  = [];   // { set, no }
const missingInNew  = [];   // { set, no }
const flagItems     = [];   // { set, no, type, note, curAns, curAnsText, newAns, newAnsText }

for (const { id, level, range } of SET_MAP) {
  const newItems = ((newData[id] || {}).items || []);
  const curPool  = ((curData[level] || {})[range] || []);

  // no → currentQuestion 맵
  const curByNo = {};
  for (const q of curPool) curByNo[q.no] = q;

  // NEW에만 있는 번호
  const curNos = new Set(curPool.map(q => q.no));
  for (const item of newItems) {
    if (!curNos.has(item.no)) missingInCur.push({ set: id, no: item.no });
  }

  // 레포에만 있는 번호
  const newNos = new Set(newItems.map(i => i.no));
  for (const q of curPool) {
    if (!newNos.has(q.no)) missingInNew.push({ set: id, no: q.no });
  }

  // BLOCKER / FLAG 수집
  for (const item of newItems) {
    const type = item.BLOCKER ? 'BLOCKER' : item.FLAG ? 'FLAG' : null;
    if (!type) continue;
    const curQ = curByNo[item.no];
    const isWriting = item.chunks !== undefined;
    let curAns = '—', curAnsText = '—', newAns = '—', newAnsText = '—';
    if (curQ) {
      if (isWriting) {
        curAns = '—'; curAnsText = norm((curQ.expected || [])[0]);
        newAns = '—'; newAnsText = norm(item.ans);
      } else {
        curAns     = curQ.answer;
        curAnsText = (curQ.options || [])[curAns] || '?';
        newAns     = ai(item.ans);
        newAnsText = (item.opts || [])[newAns] || '?';
      }
    }
    flagItems.push({ set: id, no: item.no, type,
      note: item.BLOCKER || item.FLAG,
      curAns, curAnsText, newAns, newAnsText });
  }

  // 필드별 비교
  for (const newItem of newItems) {
    const curQ = curByNo[newItem.no];
    if (!curQ) continue;

    const isWriting = newItem.chunks !== undefined;

    if (isWriting) {
      // ── writing ────────────────────────────────────────────────────
      const nAns = norm(newItem.ans);
      const cAns = norm((curQ.expected || [])[0]);
      if (nAns !== cAns) {
        diffs.push({ set: id, no: newItem.no, field: 'writing.ans(정답문장)', cur: cAns, new_: nAns });
      }

      // chunks vs words (정렬 비교 — 순서는 D&D에서 의미없음)
      const nChunks = normArr(newItem.chunks);
      const cWords  = normArr(curQ.words);
      if (nChunks !== cWords) {
        diffs.push({ set: id, no: newItem.no, field: 'writing.chunks(D&D조각)',
          cur:  (curQ.words    || []).join(' | '),
          new_: (newItem.chunks || []).join(' | ') });
      }

    } else {
      // ── MC / reading ───────────────────────────────────────────────

      // q vs question
      const nQ = norm(newItem.q);
      const cQ = norm(curQ.question);
      if (nQ !== cQ) {
        diffs.push({ set: id, no: newItem.no, field: 'q(문제지문)', cur: cQ, new_: nQ });
      }

      // opts vs options (3개)
      const nOpts = newItem.opts || [];
      const cOpts = curQ.options || [];
      for (let i = 0; i < 3; i++) {
        const nO = norm(nOpts[i]); const cO = norm(cOpts[i]);
        if (nO !== cO) {
          diffs.push({ set: id, no: newItem.no, field: `opts[${i}](${['a','b','c'][i]}보기)`, cur: cO, new_: nO });
        }
      }

      // ans vs answer
      const nIdx = ai(newItem.ans);
      if (nIdx !== undefined && nIdx !== curQ.answer) {
        const cIdx = curQ.answer;
        diffs.push({ set: id, no: newItem.no, field: 'ans(정답)',
          cur:  `${cIdx} → "${norm(cOpts[cIdx])}"`,
          new_: `${nIdx} → "${norm(nOpts[nIdx])}"` });
      }

      // passage (직접 passage 필드가 있는 항목만 비교)
      if (newItem.passage !== undefined) {
        const nP = norm(newItem.passage);
        const cP = norm(curQ.passage);
        if (nP !== cP) {
          const trunc = s => s.length > 60 ? s.slice(0, 60) + '…' : s;
          diffs.push({ set: id, no: newItem.no, field: 'passage(리딩지문)',
            cur: trunc(cP), new_: trunc(nP) });
        }
      }
    }
  }
}

// ── [1] 차이 테이블 ────────────────────────────────────────────────────────
console.log(HR);
console.log(`[1] 차이 항목 — ${diffs.length}건  (데이터 수정 없음)`);
console.log(HR);

if (diffs.length === 0) {
  console.log('  차이 없음');
} else {
  const W = [22, 3, 22, 38, 38];
  const hRow = ['세트', 'No', '필드', '현재값 (repo)', 'NEW값'];
  console.log(hRow.map((h, i) => h.padEnd(W[i])).join(' │ '));
  console.log(W.map(w => '─'.repeat(w)).join('─┼─'));
  for (const d of diffs) {
    const row = [d.set, String(d.no), d.field, d.cur, d.new_];
    console.log(row.map((v, i) => String(v).padEnd(W[i])).join(' │ '));
  }
}
console.log();

// ── [2] 누락 문항 ──────────────────────────────────────────────────────────
console.log(HR);
console.log('[2] 누락 문항');
console.log(HR);
if (!missingInCur.length && !missingInNew.length) {
  console.log('  누락 없음 — NEW/레포 모두 세트당 30문항 일치');
} else {
  if (missingInCur.length) {
    console.log('▲ NEW에는 있으나 레포(questions.englab.json)에 없는 문항:');
    missingInCur.forEach(m => console.log(`    ${m.set}  Q${m.no}`));
  }
  if (missingInNew.length) {
    console.log('▽ 레포에는 있으나 NEW에 없는 문항:');
    missingInNew.forEach(m => console.log(`    ${m.set}  Q${m.no}`));
  }
}
console.log();

// ── [3] BLOCKER / FLAG ─────────────────────────────────────────────────────
console.log(HR);
console.log('[3] BLOCKER / FLAG 항목 (팀 확인 필요)');
console.log(HR);
if (!flagItems.length) {
  console.log('  없음');
} else {
  for (const b of flagItems) {
    const marker = b.type === 'BLOCKER' ? '🚨 BLOCKER' : '⚠️  FLAG   ';
    console.log(`${marker}  ${b.set}  Q${b.no}`);
    console.log(`  레포 현재 정답 : answer=${b.curAns} → "${b.curAnsText}"`);
    console.log(`  NEW  정답      : ans index=${b.newAns} → "${b.newAnsText}"`);
    console.log(`  메모           : ${b.note}`);
    console.log();
  }
}

console.log(HR);
console.log('비교 완료. 데이터 수정 없음.');
console.log(HR);
