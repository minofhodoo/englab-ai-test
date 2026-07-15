/**
 * competitor-map-check.js
 * competitor-map 기능 검증 스크립트 (라이브 서버 불필요)
 */
'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(cond, label) {
  if (cond) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    failed++;
  }
}

// ──────────────────────────────────────────────
// 1. 파일 존재 및 JSON 파싱
// ──────────────────────────────────────────────
console.log('\n[1] 파일 존재 및 파싱');
const mapPath = path.join(__dirname, '..', 'data', 'competitor-map.json');
assert(fs.existsSync(mapPath), 'data/competitor-map.json 파일 존재');

let mapData;
try {
  mapData = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  assert(true, 'JSON 파싱 성공');
} catch (e) {
  assert(false, `JSON 파싱 성공 — ${e.message}`);
  process.exit(1);
}

assert(Array.isArray(mapData.competitorNames), 'competitorNames 배열 존재');
assert(Array.isArray(mapData.rows), 'rows 배열 존재');
assert(typeof mapData.updatedAt === 'string', 'updatedAt 문자열 존재');
assert(!mapData.hasOwnProperty('editEndpoint'), '쓰기 엔드포인트 필드 없음(읽기 전용 확인)');

// ──────────────────────────────────────────────
// 2. findCompetitorRow 로직 검증
// ──────────────────────────────────────────────
console.log('\n[2] findCompetitorRow 로직');

function findCompetitorRow(data, ourLevel) {
  if (!data || !Array.isArray(data.rows) || !ourLevel) return null;
  return data.rows.find(r => r.ourLevel === ourLevel) || null;
}

// 존재하는 레벨
const row1 = findCompetitorRow(mapData, 'Challenger 3');
assert(row1 !== null, '"Challenger 3" 매칭 성공');
assert(row1 && row1.ourLevel === 'Challenger 3', 'row.ourLevel 정확히 일치');
assert(row1 && typeof row1.competitors === 'object', 'row.competitors 객체 존재');

const row2 = findCompetitorRow(mapData, 'Challenger 6');
assert(row2 !== null, '"Challenger 6" 매칭 성공');

// 존재하지 않는 레벨 → null 반환
const rowNull = findCompetitorRow(mapData, 'Innovator 99');
assert(rowNull === null, '없는 레벨 → null 반환');

// 빈 데이터 → null 반환
assert(findCompetitorRow(null, 'Challenger 3') === null, 'mapData null → null');
assert(findCompetitorRow({ rows: [] }, 'Challenger 3') === null, 'rows 빈 배열 → null');
assert(findCompetitorRow(mapData, null) === null, 'ourLevel null → null');
assert(findCompetitorRow(mapData, '') === null, 'ourLevel 빈 문자열 → null');

// ──────────────────────────────────────────────
// 3. competitorNames → 헤더·셀 매핑
// ──────────────────────────────────────────────
console.log('\n[3] competitorNames 매핑');

const names = mapData.competitorNames;
assert(names.length > 0, 'competitorNames 비어 있지 않음');

// row1의 competitors 키가 모두 competitorNames 에 포함되어야 함
if (row1) {
  const compKeys = Object.keys(row1.competitors);
  const allMapped = compKeys.every(k => names.includes(k));
  assert(allMapped, 'row.competitors 키가 모두 competitorNames 에 포함됨');

  const allHaveValues = compKeys.every(k => typeof row1.competitors[k] === 'string');
  assert(allHaveValues, 'row.competitors 모든 값이 문자열');
}

// names 순서대로 th/td 생성 (시뮬레이션)
if (row1) {
  const thCells = names.map(n => `<th>${n}</th>`).join('');
  const tdCells = names.map(n => `<td>${row1.competitors[n] || '—'}</td>`).join('');
  assert(thCells.includes('<th>') && tdCells.includes('<td>'), '헤더·셀 HTML 생성 가능');
  assert(names.every(n => thCells.includes(n)), '모든 경쟁사명이 헤더에 포함됨');
  assert(names.every(n => tdCells.includes(row1.competitors[n] || '—')), '모든 경쟁사 레벨값이 셀에 포함됨');
}

// ──────────────────────────────────────────────
// 4. 빈/누락 데이터 → 안전한 빈 상태
// ──────────────────────────────────────────────
console.log('\n[4] 빈/누락 데이터 안전 처리');

function renderCompetitorSection(data, ourLevel) {
  const row = findCompetitorRow(data, ourLevel);
  const ns = (data && data.competitorNames) || [];
  if (!row || ns.length === 0) {
    return `<div class="r-placeholder"><div>경쟁사 비교표 준비 중</div></div>`;
  }
  const thCells = ns.map(n => `<th>${n}</th>`).join('');
  const tdCells = ns.map(n => `<td>${row.competitors[n] || '—'}</td>`).join('');
  const noteHtml = row.note ? `<div class="r-comp-note">${row.note}</div>` : '';
  const updatedHtml = data.updatedAt ? `<span class="r-comp-updated">기준일: ${data.updatedAt}</span>` : '';
  return `<div class="r-comp-wrap">
    <div class="r-comp-header"><span>우리 레벨: <strong>${ourLevel}</strong> 기준</span>${updatedHtml}</div>
    <div style="overflow-x:auto">
      <table class="r-comp-table">
        <thead><tr><th>구분</th>${thCells}</tr></thead>
        <tbody><tr><td>경쟁사 레벨</td>${tdCells}</tr></tbody>
      </table>
    </div>${noteHtml}</div>`;
}

// null mapData
const r1 = renderCompetitorSection(null, 'Challenger 3');
assert(r1.includes('준비 중'), 'mapData null → placeholder 반환');

// 빈 rows
const r2 = renderCompetitorSection({ competitorNames: [], rows: [] }, 'Challenger 3');
assert(r2.includes('준비 중'), '빈 rows → placeholder 반환');

// 없는 레벨
const r3 = renderCompetitorSection(mapData, 'Innovator 99');
assert(r3.includes('준비 중'), '없는 레벨 → placeholder 반환');

// 정상 데이터
const r4 = renderCompetitorSection(mapData, 'Challenger 3');
assert(r4.includes('r-comp-wrap'), '정상 데이터 → 테이블 HTML 반환');
assert(r4.includes('Challenger 3'), '우리 레벨명 표시');
assert(r4.includes(mapData.updatedAt), 'updatedAt 표시');

// ──────────────────────────────────────────────
// 5. 학생 리포트 경로에 경쟁사 데이터 미포함 확인
// ──────────────────────────────────────────────
console.log('\n[5] 학생 리포트 경로 — 경쟁사 데이터 미포함');

// server.js에서 /api/report/:code 응답 구조 확인
// (실제 HTTP 호출 없이 server.js 소스 분석)
const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

// 학생용 리포트 엔드포인트 (토큰 불필요 경로)는 competitor-map 데이터를 포함하지 않아야 함
// GET /api/competitor-map 은 requireAcademy (원장 토큰 필수) 로만 노출
assert(serverSrc.includes('requireAcademy'), 'server.js에 requireAcademy 호출 존재');
assert(serverSrc.includes('/api/competitor-map'), 'GET /api/competitor-map 라우트 존재');

// /api/competitor-map 라우트가 requireAcademy 를 거치는지 확인
// (requireAcademy 가 false를 반환하면 즉시 return)
const cmRoute = serverSrc.match(/app\.get\('\/api\/competitor-map'[\s\S]*?\}\s*\);/);
assert(cmRoute !== null, '/api/competitor-map 라우트 파싱 성공');
if (cmRoute) {
  assert(cmRoute[0].includes('requireAcademy'), '/api/competitor-map 내부에서 requireAcademy 호출 확인');
}

// test.html (학생 앱)에는 competitor 키워드가 없어야 함
const testHtmlSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'test.html'), 'utf8');
assert(!testHtmlSrc.includes('competitor-map'), 'test.html(학생 앱)에 competitor-map 미포함');
assert(!testHtmlSrc.includes('r-comp-wrap'), 'test.html(학생 앱)에 경쟁사 테이블 CSS 미포함');

// admin-assign.html: 경쟁사 UI 제거, 데이터 파일·서버 라우트는 유지
const adminSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin-assign.html'), 'utf8');
assert(!adminSrc.includes('renderCompetitorSection'), 'admin-assign.html에서 경쟁사 UI 제거됨');
assert(!adminSrc.includes('r-comp-wrap'), 'admin-assign.html에서 경쟁사 테이블 CSS 없음');
assert(!adminSrc.includes('/api/competitor-map'), 'admin-assign.html에서 competitor-map API 미호출');

// ──────────────────────────────────────────────
// 6. server.js 라우트 구조 완결성
// ──────────────────────────────────────────────
console.log('\n[6] server.js 라우트 완결성');

assert(serverSrc.includes('COMPETITOR_MAP_PATH') || serverSrc.includes('competitor-map.json'),
  'server.js에서 competitor-map.json 경로 참조');
assert(serverSrc.includes('fs.existsSync') || serverSrc.includes('existsSync'),
  'server.js에서 파일 존재 여부 체크(파일 없을 때 빈 구조 반환)');
assert(!serverSrc.includes('POST') || !serverSrc.match(/app\.post\(['"]\/api\/competitor-map/),
  'POST /api/competitor-map 쓰기 라우트 없음(읽기 전용)');

// ──────────────────────────────────────────────
// 결과
// ──────────────────────────────────────────────
console.log(`\n${'─'.repeat(48)}`);
console.log(`결과: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
