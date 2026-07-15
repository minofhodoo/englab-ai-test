'use strict';
/**
 * report-enhance-check.js — 결과 리포트 보강 검증
 * 통과: 모든 PASS / 실패: FAIL + 종료코드 1
 */

const fs   = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(label)       { console.log('  PASS  ' + label); pass++; }
function ng(label, why)  { console.error('  FAIL  ' + label + (why ? ' — ' + why : '')); fail++; }
function assert(cond, label, why) { cond ? ok(label) : ng(label, why); }

// ── 파일 로드 ──────────────────────────────────────────────────────────
const composerSrc = fs.readFileSync(
  path.join(__dirname, '../public/test-composer.js'), 'utf8');
const htmlSrc = fs.readFileSync(
  path.join(__dirname, '../public/test.html'), 'utf8');
const spkSrc = fs.readFileSync(
  path.join(__dirname, '../public/speaking-utils.js'), 'utf8');
const serverSrc = fs.readFileSync(
  path.join(__dirname, '../server.js'), 'utf8');

// ── 1. buildOverall 존재 및 export ──────────────────────────────────────
console.log('\n[1] buildOverall 함수');
const TC = require('../public/test-composer');
assert(typeof TC.buildOverall === 'function', 'buildOverall이 export됨');

// 점수 상 (80%)
const highResult = TC.buildOverall({
  scorePct: 85,
  sections: { vocabulary:{ total:5, pct:90 }, grammar:{ total:5, pct:40 } },
  challenge: { signal:'advance', nextStageName:'Stage 4' },
});
assert(typeof highResult === 'string' && highResult.length > 0, 'buildOverall: 상 케이스 반환값 있음');
assert(/85/.test(highResult), 'buildOverall: 상 — 점수% 포함');
assert(/높은/.test(highResult), 'buildOverall: 상 — "높은" 키워드');
assert(/어휘/.test(highResult), 'buildOverall: 상 — 강점 영역 언급');
assert(/문법/.test(highResult), 'buildOverall: 상 — 취약 영역 언급');
assert(!/Stage 4/.test(highResult), 'buildOverall: 상 — 도전 단계 미포함');

// 점수 중 (60~79%)
const midResult = TC.buildOverall({
  scorePct: 68,
  sections: { reading:{ total:5, pct:72 }, writing:{ total:5, pct:45 } },
  challenge: { signal:'borderline', nextStageName:'Stage 3' },
});
assert(/68/.test(midResult), 'buildOverall: 중 — 점수% 포함');
assert(/보완/.test(midResult), 'buildOverall: 중 — "보완" 키워드');
assert(/쓰기/.test(midResult), 'buildOverall: 중 — 취약 영역 언급');
assert(!/Stage 3/.test(midResult), 'buildOverall: 중 — 도전 단계 미포함');

// 점수 하 (<60%)
const lowResult = TC.buildOverall({
  scorePct: 42,
  sections: { phonics:{ total:5, pct:80 }, grammar:{ total:5, pct:30 } },
  challenge: { signal:'stay' },
});
assert(/42/.test(lowResult), 'buildOverall: 하 — 점수% 포함');
assert(/AI 분석 결과/.test(lowResult), 'buildOverall: 하 — "AI 분석 결과" 접두사');

// edge: 빈 입력
const emptyResult = TC.buildOverall({});
assert(typeof emptyResult === 'string', 'buildOverall: 빈 입력에도 string 반환');

// ── 2. 기본정보 헤더 (HTML) ────────────────────────────────────────────
console.log('\n[2] 기본정보 헤더 HTML');
assert(htmlSrc.includes('id="res-header"'),   '#res-header div 존재');
assert(htmlSrc.includes('id="rh-name"'),      '#rh-name 존재');
assert(htmlSrc.includes('id="rh-date"'),      '#rh-date 존재');
assert(htmlSrc.includes('id="rh-academy"'),   '#rh-academy 존재');
assert(htmlSrc.includes('res-header'),        '.res-header CSS 클래스 사용');
assert(htmlSrc.includes('toLocaleDateString'), 'showResult: 날짜 포맷팅');
assert(htmlSrc.includes('academyName'),        'showResult: academyName 사용');
assert(htmlSrc.includes('studentName'),        'showResult: studentName 사용');

// ── 3. 종합 피드백 Overall (HTML + JS) ────────────────────────────────
console.log('\n[3] 종합 피드백 (Overall)');
assert(htmlSrc.includes('id="res-overall"'),      '#res-overall 존재');
assert(htmlSrc.includes('id="res-overall-text"'), '#res-overall-text 존재');
assert(htmlSrc.includes('overall-box'),            '.overall-box CSS 클래스 사용');
assert(htmlSrc.includes('a.overall'),              'showResult: a.overall 사용');

// server.js — overall 필드 삽입
assert(serverSrc.includes('buildOverall'),         'server.js: buildOverall 호출');
assert(serverSrc.includes('assessment.overall'),   'server.js: assessment.overall 저장');

// ── 4. 스피킹 지표 — 테스트 상세(관리자)로 이동 ─────────────────────
console.log('\n[4] 스피킹 지표 (진단리포트 제거 → 테스트상세 이동)');
assert(!htmlSrc.includes('id="res-speaking"'),      'test.html: #res-speaking 제거됨 (테스트상세로 이동)');
assert(!htmlSrc.includes('id="res-spk-bars"'),      'test.html: #res-spk-bars 제거됨');
assert(!htmlSrc.includes('voiceRate'),              'test.html: voiceRate 제거됨');

const adminSrc2 = fs.readFileSync(path.join(__dirname, '../public/admin-assign.html'), 'utf8');
assert(adminSrc2.includes('openDiagReport'),         'admin-assign: openDiagReport 함수 존재');
assert(adminSrc2.includes('openDetailReport'),       'admin-assign: openDetailReport 함수 존재');
assert(adminSrc2.includes('STT'),                   'admin-assign: STT 레이블 테스트상세에 존재');
assert(!adminSrc2.includes('renderCompetitorSection'), 'admin-assign: 경쟁사 UI 제거됨');
assert(adminSrc2.includes('buildRadarSVG'),          'admin-assign: buildRadarSVG 존재 (진단리포트)');
assert(adminSrc2.includes('overall-box'),            'admin-assign: AI 종합분석 박스 존재');
assert(adminSrc2.includes('buildSpeakingFeedback'),  'admin-assign: buildSpeakingFeedback 호출');
assert(adminSrc2.includes('speaking-utils.js'),      'admin-assign: speaking-utils.js 스크립트 로드');

// 인쇄 전용 단계명 숨김 (.exam-stage)
assert(adminSrc2.includes('exam-stage'),             'admin-assign: .exam-stage 클래스 사용');
assert(adminSrc2.includes('class="exam-stage"'),     'admin-assign: res-hdr 단계 span에 exam-stage 부여');
assert(/exam-stage.*display:none/s.test(adminSrc2) || adminSrc2.includes('exam-stage { display:none'), 'admin-assign: @media print .exam-stage display:none');
// report-meta에 exam-stage span 주입 (innerHTML 사용)
assert(adminSrc2.includes('class="exam-stage"> · 단계 '), 'admin-assign: report-meta exam-stage에 구분점 포함');
// 추천 레벨(result-level-box)은 인쇄 숨김 대상이 아님
assert(adminSrc2.includes('result-level-box') && !adminSrc2.includes('result-level-box.*display:none'), 'admin-assign: 추천 레벨은 숨김 제외');

// test.html: L&S 피드백 섹션 확인
assert(htmlSrc.includes('res-spk-feedback'),         'test.html: #res-spk-feedback 존재');
assert(htmlSrc.includes('buildSpeakingFeedback'),    'test.html: buildSpeakingFeedback 호출');
assert(htmlSrc.includes('spk-fb-lbl'),               'test.html: .spk-fb-lbl CSS 존재');
assert(htmlSrc.includes('참고 지표'),                'test.html: 참고 지표 레이블 존재');

// speaking-utils: 새 필드 검증
const suSrc = fs.readFileSync(path.join(__dirname, '../public/speaking-utils.js'), 'utf8');
assert(suSrc.includes('matchRate'),                  'speaking-utils: matchRate 필드 추가됨');
assert(suSrc.includes('buildSpeakingFeedback'),      'speaking-utils: buildSpeakingFeedback export됨');
const SU2 = require('../public/speaking-utils');
assert(typeof SU2.buildSpeakingFeedback === 'function', 'speaking-utils: buildSpeakingFeedback 함수 export 확인');
const fbSample = SU2.buildSpeakingFeedback({ responseRate: 75, matchRate: 60 });
assert(fbSample && fbSample.pronunciation, 'buildSpeakingFeedback: 발음 코멘트 생성');
assert(fbSample && fbSample.fluency,       'buildSpeakingFeedback: 유창성 코멘트 생성');
assert(fbSample && fbSample.grammar,       'buildSpeakingFeedback: 문법 코멘트 생성');
assert(fbSample && fbSample.expression,    'buildSpeakingFeedback: 표현 코멘트 생성');

// speaking-utils 로직은 유지
assert(spkSrc.includes('typingRate'),                'speaking-utils: typingRate 계산 유지');
assert(spkSrc.includes("method === 'typing'"),       "speaking-utils: typing method 카운트 유지");

// buildSpeakingReport 반환값 검증 (로직 불변)
const SU = require('../public/speaking-utils');
const spkReport = SU.buildSpeakingReport(
  [{ id:'q1' }, { id:'q2' }, { id:'q3' }],
  { q1:{ text:'hello world', method:'voice' }, q2:{ text:'yes', method:'typing' }, q3:null },
);
assert(spkReport.responseRate === 33, 'buildSpeakingReport: responseRate(voice%)=33');
assert(spkReport.typingRate   === 33, 'buildSpeakingReport: typingRate=33');
assert(typeof spkReport.sttText === 'string', 'buildSpeakingReport: sttText string');

// ── 5. A4 출력 ────────────────────────────────────────────────────────
console.log('\n[5] A4 출력');
assert(htmlSrc.includes('@media print'),              '@media print 블록 존재');
assert(htmlSrc.includes('print-btn'),                 '출력 버튼 .print-btn 존재');
assert(htmlSrc.includes('window.print()'),            '출력 버튼 window.print() 연결');
assert(htmlSrc.includes('display:none !important'),   'print: 버튼/네비 숨김 규칙');
assert(htmlSrc.includes('print-color-adjust'),        'print: 컬러 강제 출력 설정');
assert(htmlSrc.includes('box-shadow:none'),           'print: box-shadow 제거');
assert(htmlSrc.includes('@page'),                     'print: @page A4 사이즈 규칙');
assert(htmlSrc.includes('grid-template-columns'),     'print: 2단 그리드 grid-template-columns');
assert(htmlSrc.includes('page-break-inside:avoid'),   'print: page-break-inside:avoid 규칙');

// server.js — academyName 반환
console.log('\n[6] server.js academyName 반환');
assert(serverSrc.includes('academyName'),             'server.js: code-check에 academyName 포함');
assert(serverSrc.includes('getAcademy'),              'server.js: getAcademy 호출');

// ── 7. AI 리포트 컴포넌트 & 레이더 차트 ──────────────────────────────
console.log('\n[7] AI 리포트 컴포넌트 & 레이더 차트');
assert(htmlSrc.includes('ai-badge'),                    '.ai-badge CSS/HTML 존재');
assert(htmlSrc.includes('AI 기반 진단 리포트'),          'AI 기반 진단 리포트 배지 텍스트');
assert(htmlSrc.includes('AI 종합 분석'),                'AI 종합 분석 섹션 제목');
assert(htmlSrc.includes('AI 영역별 성취도'),            'AI 영역별 성취도 제목 (오른쪽 컬럼)');
assert(htmlSrc.includes('AI 영역별 세부 평가'),          'AI 영역별 세부 평가 제목 (하단)');
assert(htmlSrc.includes('id="res-radar"'),              '#res-radar 레이더 컨테이너 존재');
assert(htmlSrc.includes('buildRadarSVG'),               'buildRadarSVG 함수 존재');
assert(htmlSrc.includes('report-grid'),                 '.report-grid 그리드 컨테이너 존재');
assert(htmlSrc.includes('id="res-sections-ai"'),        '#res-sections-ai 존재');
assert(htmlSrc.includes('id="res-sections-detail"'),    '#res-sections-detail 존재');
assert(htmlSrc.includes('id="res-diag-wrap"'),          '#res-diag-wrap 존재');
assert(/AI 분석 결과/.test(highResult), 'buildOverall: 상 — "AI 분석 결과" 접두사');
assert(/AI 분석 결과/.test(midResult),  'buildOverall: 중 — "AI 분석 결과" 접두사');
assert(/AI 분석 결과/.test(lowResult),  'buildOverall: 하 — "AI 분석 결과" 접두사');

// ── 결과 ──────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────');
console.log('PASS: ' + pass + '  FAIL: ' + fail);
if (fail > 0) { console.error('검증 실패. 위 FAIL 항목을 수정하세요.'); process.exit(1); }
else          { console.log('모든 검증 통과!'); }
