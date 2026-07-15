/**
 * test-composer.js — 5단계 70:30 출제 조합 엔진 v2
 *
 * API
 *   composeTest(stage, pools?, diag?)  → { stage, stageName, active, questions, meta }
 *   scoreAndDiagnose(stage, answeredQs, pools?, diag?)
 *     answeredQs = composeTest().questions 에 .correct:boolean 을 추가한 배열
 *     → { score, total, scorePct, appropriate, challenge }
 *   getBonusCandidates(stage, composedQs, pools?)  → upper 미출제 문항 배열
 *   isStageActive(stage, pools?)  → boolean
 *
 * 브라우저에서는 pools/diag 를 두 번째·세 번째 인수로 직접 전달.
 * Node.js 에서는 생략 시 public/ 디렉터리의 JSON 파일을 자동 로드.
 */
'use strict';

// ── 단계 설정 ─────────────────────────────────────────────────────────────
const STAGE_CONFIG = {
  1: { name: 'Seeker',
       base:  ['seeker-1-4'],
       upper: [] },
  2: { name: 'Builder',
       base:  ['builder-1-8'],
       upper: ['challenger-1-6'] },
  3: { name: 'Challenger',
       base:  ['challenger-1-6'],
       upper: ['challenger-7-12'] },
  4: { name: 'Explorer',
       base:  ['explorer-1-6'],
       upper: ['explorer-7-12'] },
  5: { name: 'Inventor',
       base:  ['inventor-1-6', 'inventor-7-12'],
       upper: ['innovator-1-6', 'innovator-7-12'] },
};

const NON_READING    = ['vocabulary', 'grammar', 'writing'];
const READING_TARGET = 5;

// ── Fisher–Yates 셔플 (새 배열 반환) ─────────────────────────────────────
function shuffleFY(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

// ── test_id → 문항 배열 ──────────────────────────────────────────────────
// "challenger-1-6" → pools["Challenger"]["1-6"]
function getPool(testId, pools) {
  const dash = testId.indexOf('-');
  if (dash < 0 || !pools) return [];
  const level = testId[0].toUpperCase() + testId.slice(1, dash);
  const range = testId.slice(dash + 1);
  return (pools[level] && pools[level][range]) || [];
}

// ── 비독해 섹션 비례 배분 (최대-나머지법) ────────────────────────────────
function proportionalAlloc(pool, sections, total) {
  const avail = {};
  let   poolNR = 0;
  for (const s of sections) {
    avail[s] = pool.filter(q => q.section === s).length;
    poolNR  += avail[s];
  }
  const zero = {};
  sections.forEach(s => { zero[s] = 0; });
  if (poolNR === 0 || total === 0) return zero;

  const raws = {}; const floors = {}; let fsum = 0;
  for (const s of sections) {
    raws[s]   = (avail[s] / poolNR) * total;
    floors[s] = Math.floor(raws[s]);
    fsum     += floors[s];
  }

  const alloc = Object.assign({}, floors);
  let rem = total - fsum;

  // 나머지를 소수점 내림차순으로 배분 (동점은 이름 오름차순으로 안정 정렬)
  const order = sections.slice().sort(
    (a, b) => (raws[b] - floors[b]) - (raws[a] - floors[a]) || a.localeCompare(b)
  );
  for (const s of order) {
    if (rem <= 0) break;
    if (alloc[s] < avail[s]) { alloc[s]++; rem--; }
  }
  // 풀 캡으로 남은 자리 처리
  for (const s of sections) {
    if (rem <= 0) break;
    if (alloc[s] < avail[s]) { alloc[s]++; rem--; }
  }
  return alloc;
}

// ── 섹션별 평면 선택 ─────────────────────────────────────────────────────
function pickFlat(pool, section, n, origin) {
  const cands  = pool.filter(q => q.section === section);
  const picked = shuffleFY(cands).slice(0, n);
  if (picked.length < n) {
    // eslint-disable-next-line no-console
    console.warn('[TC] ' + section + '(' + origin + ') 풀 부족: 요청=' + n + ' 가용=' + cands.length);
  }
  return picked.map(q => Object.assign({}, q, { origin }));
}

// ── 독해 선택: passage 묶음 무결성 보장 ──────────────────────────────────
// 방법: 백트래킹으로 총 문항 수 == target 인 지문 그룹 조합 전체를 구한 뒤
//       무작위로 하나 선택. 정확한 조합이 없으면 greedy fallback.
function pickReading(basePool, target) {
  const pool = basePool.filter(q => q.section === 'reading');
  if (pool.length === 0) return [];

  // passage 없는 독해(Builder 등): 그냥 최대 target 개 선택
  if (!pool.some(q => q.passage)) {
    return shuffleFY(pool)
      .slice(0, target)
      .map(q => Object.assign({}, q, { origin: 'base' }));
  }

  // passage 텍스트 기준 그룹화 → 그룹 순서 FY 셔플(다양성 확보)
  const pMap = new Map();
  const lone = [];
  for (const q of pool) {
    if (q.passage) {
      if (!pMap.has(q.passage)) pMap.set(q.passage, []);
      pMap.get(q.passage).push(q);
    } else {
      lone.push(q);
    }
  }
  const groups = shuffleFY([...pMap.values()]);

  // 백트래킹: sum(group.length) == target 인 인덱스 조합 열거
  const valid = [];
  (function bt(start, rem, combo) {
    if (rem === 0) { valid.push(combo.slice()); return; }
    for (let i = start; i < groups.length; i++) {
      if (groups[i].length <= rem) {
        combo.push(i);
        bt(i + 1, rem - groups[i].length, combo);
        combo.pop();
      }
    }
  })(0, target, []);

  let selected;
  if (valid.length > 0) {
    // 유효 조합 중 무작위 선택 → 재응시 다양성
    const chosen = valid[Math.floor(Math.random() * valid.length)];
    selected = chosen.flatMap(gi => groups[gi]);
  } else {
    // greedy (target 미달 허용)
    selected = [];
    const used = new Set();
    let changed = true;
    while (changed && selected.length < target) {
      changed = false;
      for (let i = 0; i < groups.length; i++) {
        if (used.has(i)) continue;
        if (selected.length + groups[i].length <= target) {
          selected.push(...groups[i]); used.add(i); changed = true;
        }
      }
    }
    if (selected.length < target && lone.length) {
      selected.push(...shuffleFY(lone).slice(0, target - selected.length));
    }
    if (selected.length < target) {
      // eslint-disable-next-line no-console
      console.warn('[TC] reading 목표 ' + target + '개 달성 불가 (선택: ' + selected.length + '개)');
    }
  }
  return selected.map(q => Object.assign({}, q, { origin: 'base' }));
}

// ── 데이터 로더 (Node.js 자동 로드) ──────────────────────────────────────
let _pools = null;
let _diag  = null;

function _tryLoad(filename) {
  try { return require(require('path').join(__dirname, filename)); }
  catch (_) { return null; }
}

function _loadPools() {
  if (_pools) return _pools;
  _pools = {};
  for (const f of ['questions.englab.json', 'questions.builder.json', 'questions.seeker.json']) {
    const data = _tryLoad(f);
    if (!data) continue;
    for (const [lvl, ranges] of Object.entries(data)) {
      if (!_pools[lvl]) _pools[lvl] = {};
      for (const [rng, qs] of Object.entries(ranges)) _pools[lvl][rng] = qs;
    }
  }
  return _pools;
}

function _loadDiag() {
  if (_diag) return _diag;
  _diag = {};
  for (const f of ['diagnostics.json', 'diagnostics.builder.json']) {
    const data = _tryLoad(f);
    if (!data) continue;
    for (const [lvl, ranges] of Object.entries(data)) {
      if (!_diag[lvl]) _diag[lvl] = {};
      for (const [rng, tbl] of Object.entries(ranges)) _diag[lvl][rng] = tbl;
    }
  }
  return _diag;
}

function _rp(v) { return v || (typeof require !== 'undefined' ? _loadPools() : null); }
function _rd(v) { return v || (typeof require !== 'undefined' ? _loadDiag()  : null); }

// ── 공개 API ─────────────────────────────────────────────────────────────

function isStageActive(stage, pools) {
  const p = _rp(pools);
  const c = STAGE_CONFIG[stage];
  return !!(c && p && c.base.some(id => getPool(id, p).length > 0));
}

function composeTest(stage, pools, diag) {
  const p = _rp(pools);
  const c = STAGE_CONFIG[stage];
  if (!c) throw new Error('[TC] 알 수 없는 단계: ' + stage);

  if (!isStageActive(stage, p)) {
    return {
      stage, stageName: c.name, active: false,
      reason: '단계 ' + stage + '(' + c.name + ') — base 문항 미준비',
      questions: [], meta: null,
    };
  }

  const basePool  = c.base.reduce( (a, id) => a.concat(getPool(id, p)), []);
  const upperPool = c.upper.reduce((a, id) => a.concat(getPool(id, p)), []);
  const hasUpper  = upperPool.length > 0;

  // 1. 독해: base에서만, 지문 묶음 유지
  const readingQs     = pickReading(basePool, READING_TARGET);
  const actualReading = readingQs.length;

  // 2. 비독해 비례 배분
  const baseNR  = 21 - actualReading;
  const upperNR = hasUpper ? 9 : 0;

  const baseAlloc  = proportionalAlloc(basePool, NON_READING, baseNR);
  const upperAlloc = (() => {
    if (!hasUpper) { const z = {}; NON_READING.forEach(s => { z[s] = 0; }); return z; }
    return proportionalAlloc(upperPool, NON_READING, upperNR);
  })();

  // 3. 비독해 문항 수집
  const nonQs = [];
  for (const sec of NON_READING) {
    nonQs.push(...pickFlat(basePool, sec, baseAlloc[sec], 'base'));
    if (hasUpper) nonQs.push(...pickFlat(upperPool, sec, upperAlloc[sec], 'upper'));
  }

  // 표준 섹션(어휘·문법·독해·쓰기)이 없는 풀(phonics 등) — 전체 base pool 셔플 반환
  if (readingQs.length === 0 && nonQs.length === 0) {
    const allQs = shuffleFY(basePool).map(q => Object.assign({}, q, { origin: 'base' }));
    const sectCount = {};
    allQs.forEach(q => { sectCount[q.section] = (sectCount[q.section] || 0) + 1; });
    const bySect = {};
    Object.entries(sectCount).forEach(([s, cnt]) => { bySect[s] = { total: cnt, base: cnt, upper: 0 }; });
    return {
      stage, stageName: c.name, active: true, questions: allQs,
      meta: {
        totalQuestions: allQs.length,
        baseCount: allQs.length, upperCount: 0,
        bySection: bySect,
        baseAlloc: {}, upperAlloc: {}, bonusCandidates: [],
      },
    };
  }

  // 4. 최종 순서: 어휘 → 문법 → 독해 → 쓰기
  const vocab   = nonQs.filter(q => q.section === 'vocabulary');
  const grammar = nonQs.filter(q => q.section === 'grammar');
  const writing = nonQs.filter(q => q.section === 'writing');
  const questions = [...vocab, ...grammar, ...readingQs, ...writing];

  const baseCount  = questions.filter(q => q.origin === 'base').length;
  const upperCount = questions.filter(q => q.origin === 'upper').length;

  const bySection = {};
  for (const sec of ['vocabulary', 'grammar', 'reading', 'writing']) {
    const sq = questions.filter(q => q.section === sec);
    bySection[sec] = {
      total: sq.length,
      base:  sq.filter(q => q.origin === 'base').length,
      upper: sq.filter(q => q.origin === 'upper').length,
    };
  }

  const selectedIds     = new Set(questions.map(q => q.id));
  const bonusCandidates = upperPool.filter(q => !selectedIds.has(q.id));

  return {
    stage, stageName: c.name, active: true, questions,
    meta: {
      totalQuestions: questions.length,
      baseCount, upperCount, bySection,
      baseAlloc, upperAlloc, bonusCandidates,
    },
  };
}

/**
 * 채점 + 진단
 * @param {number}   stage
 * @param {Object[]} answeredQs  composeTest().questions 에 .correct:boolean 추가
 * @param {Object=}  pools
 * @param {Object=}  diag
 * @returns {{
 *   stage, stageName, score, total, scorePct,
 *   baseScore, baseTotal, upperScore, upperTotal,
 *   sections: {vocabulary,grammar,reading,writing},
 *   appropriate: {level,recommended,diagnosis,cefr},
 *   challenge: {upperCorrectRate,upperCorrect,upperTotal,signal,nextStage,nextStageName,nextCefr},
 *   bonusEligible, speaking: {responseRate,sttText}
 * }}
 */
function scoreAndDiagnose(stage, answeredQs, pools, diag) {
  const d = _rd(diag);
  const c = STAGE_CONFIG[stage];
  if (!c) throw new Error('[TC] 알 수 없는 단계: ' + stage);

  const total    = answeredQs.length;
  const correct  = answeredQs.filter(a => a.correct).length;
  const scorePct = total > 0 ? Math.round((correct / total) * 100) : 0;

  // ── 1. base / upper 분리 점수 ─────────────────────────────────────────
  const baseQs   = answeredQs.filter(a => a.origin === 'base');
  const upperQs  = answeredQs.filter(a => a.origin === 'upper');
  const baseScore  = baseQs.filter(a => a.correct).length;
  const upperScore = upperQs.filter(a => a.correct).length;
  const baseTotal  = baseQs.length;
  const upperTotal = upperQs.length;

  // ── 2. 섹션별 점수 (phonics 포함 — Seeker 단계 집계용) ───────────────
  const sections = {};
  for (const sec of ['vocabulary', 'grammar', 'reading', 'writing', 'phonics']) {
    const sq = answeredQs.filter(a => a.section === sec);
    const sc = sq.filter(a => a.correct).length;
    sections[sec] = {
      correct: sc,
      total:   sq.length,
      pct:     sq.length > 0 ? Math.round((sc / sq.length) * 100) : 0,
    };
  }

  // ── 3. 적정 레벨 (diagnostics 구간 매칭, 총점 기준) ───────────────────
  const baseId   = c.base[0];
  const dash     = baseId.indexOf('-');
  const levelKey = baseId[0].toUpperCase() + baseId.slice(1, dash);
  const range    = baseId.slice(dash + 1);
  const table    = (d && d[levelKey] && d[levelKey][range]) || [];
  const matched  = table.find(r => correct >= r.score_min && correct <= r.score_max) || null;

  // ── 4. CEFR 매핑 (각 단계의 대략적 수준) ─────────────────────────────
  const CEFR_MAP = { 1: 'Pre-A1', 2: 'A1', 3: 'A1~A2', 4: 'A2~B1', 5: 'B1~B2' };
  const NEXT_MAP = {
    1: { stage: 2,    name: 'Builder',    cefr: 'A1' },
    2: { stage: 3,    name: 'Challenger', cefr: 'A1~A2' },
    3: { stage: 4,    name: 'Explorer',   cefr: 'A2~B1' },
    4: { stage: 5,    name: 'Inventor',   cefr: 'B1~B2' },
    5: { stage: null, name: 'Innovator',  cefr: 'B2~C1' },
  };
  const stageCefr = CEFR_MAP[stage] || '';
  const nextInfo  = NEXT_MAP[stage]  || null;

  // ── 5. 도전 레벨 신호 (upper 정답률 기준) ─────────────────────────────
  const uRate  = upperTotal > 0 ? Math.round((upperScore / upperTotal) * 100) : 0;
  const signal = uRate >= 70 ? 'advance' : uRate >= 40 ? 'borderline' : 'stay';

  // ── 6. 보너스 자격 (총점 90%+) ────────────────────────────────────────
  const bonusEligible = scorePct >= 90;

  // ── 7. 스피킹 placeholder (이후 단계에서 채움) ───────────────────────
  const speaking = { responseRate: null, sttText: null };

  return {
    stage, stageName: c.name,
    score: correct, total, scorePct,
    baseScore, baseTotal,
    upperScore, upperTotal,
    sections,
    appropriate: matched
      ? { level: levelKey, recommended: matched.recommended,
          diagnosis: matched.diagnosis, cefr: stageCefr }
      : { level: levelKey, recommended: null, diagnosis: null, cefr: stageCefr },
    challenge: {
      upperCorrectRate: uRate,
      upperCorrect:     upperScore,
      upperTotal,
      signal,
      nextStage:     nextInfo ? nextInfo.stage : null,
      nextStageName: nextInfo ? nextInfo.name  : null,
      nextCefr:      nextInfo ? nextInfo.cefr  : null,
    },
    bonusEligible,
    speaking,
  };
}

/** 90%+ 보너스 후보: upper 풀 중 미출제 문항 */
function getBonusCandidates(stage, composedQs, pools) {
  const p = _rp(pools);
  const c = STAGE_CONFIG[stage];
  if (!c || c.upper.length === 0) return [];
  const upperPool   = c.upper.reduce((a, id) => a.concat(getPool(id, p)), []);
  const selectedIds = new Set((composedQs || []).map(q => q.id));
  return upperPool.filter(q => !selectedIds.has(q.id));
}

/**
 * 종합 피드백 생성 — 총점/영역/도전레벨 조합 → 한국어 2~4문장 템플릿
 * @param {object} assessment scoreAndDiagnose() 반환 객체
 * @returns {string}
 */
function buildOverall(assessment) {
  const SEC_KR = { vocabulary:'어휘', grammar:'문법', reading:'독해', writing:'쓰기', phonics:'파닉스' };
  const { scorePct = 0, sections = {} } = assessment || {};
  const sent = [];

  // 1. 총점 구간
  if (scorePct >= 80)
    sent.push('AI 분석 결과, 전체 ' + scorePct + '%의 높은 정답률을 기록했습니다. 현재 학습 단계의 핵심 내용을 안정적으로 습득하고 있는 것으로 분석됩니다.');
  else if (scorePct >= 60)
    sent.push('AI 분석 결과, 전체 ' + scorePct + '%의 정답률을 기록했습니다. 기본 개념은 갖추고 있으며, 취약 영역의 보완이 이루어지면 실력 향상이 가속될 것입니다.');
  else
    sent.push('AI 분석 결과, 전체 ' + scorePct + '%의 정답률을 기록했습니다. 기초 개념을 단계적으로 다져 나가면 안정적인 성장을 이룰 수 있습니다.');

  // 2. 강한·약한 영역
  const secs = Object.entries(sections).filter(function(e) { return e[1].total > 0; });
  if (secs.length >= 2) {
    secs.sort(function(a, b) { return b[1].pct - a[1].pct; });
    const sk = secs[0][0], sv = secs[0][1];
    const wk = secs[secs.length - 1][0], wv = secs[secs.length - 1][1];
    if (sv.pct >= 70) sent.push((SEC_KR[sk] || sk) + ' 영역에서 강점이 두드러집니다. 이 성취를 바탕으로 다른 영역까지 균형 있게 발전시켜 나가는 것이 중요합니다.');
    if (wk !== sk && wv.pct < 60)
      sent.push('반면 ' + (SEC_KR[wk] || wk) + ' 영역은 보완이 필요한 것으로 분석됩니다. 집중 학습을 통해 전체 성적 향상으로 이어질 것입니다.');
  }

  return sent.join(' ');
}

// ── 내보내기 ──────────────────────────────────────────────────────────────
const _exp = { composeTest, isStageActive, scoreAndDiagnose, getBonusCandidates, buildOverall, STAGE_CONFIG };
if (typeof module !== 'undefined' && module.exports) module.exports = _exp;
else if (typeof window !== 'undefined') window.TestComposer = _exp;
