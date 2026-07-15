'use strict';
/**
 * question-detail-check.js — 문항별 상세 기능 검증
 * 통과: 모든 PASS / 실패: FAIL + 종료코드 1
 */

const fs   = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(label)      { console.log('  PASS  ' + label); pass++; }
function ng(label, why) { console.error('  FAIL  ' + label + (why ? ' — ' + why : '')); fail++; }
function assert(cond, label, why) { cond ? ok(label) : ng(label, why); }

const serverSrc    = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
const adminSrc     = fs.readFileSync(path.join(__dirname, '../public/admin-assign.html'), 'utf8');
const storeSrc     = fs.readFileSync(path.join(__dirname, '../lib/assign-store.js'), 'utf8');
const testHtmlSrc  = fs.readFileSync(path.join(__dirname, '../public/test.html'), 'utf8');

// ── 1. assign-store.js — submitAssignment 시그니처 ────────────────────────
console.log('\n[1] assign-store: questionDetails·speakingDetails 저장');
assert(storeSrc.includes('questionDetails'), 'assign-store: questionDetails 파라미터 수용');
assert(storeSrc.includes('speakingDetails'), 'assign-store: speakingDetails 파라미터 수용');
assert(storeSrc.includes('questionDetails !== undefined'), 'assign-store: questionDetails undefined 체크');
assert(storeSrc.includes('speakingDetails !== undefined'), 'assign-store: speakingDetails undefined 체크');

// ── 2. server.js — 문항별 상세 빌드 ──────────────────────────────────────
console.log('\n[2] server.js: questionDetails 빌드 및 저장');
assert(serverSrc.includes('const questionDetails = scored.map'), 'server.js: questionDetails 빌드');
assert(serverSrc.includes('questionType: q.questionType'),       'server.js: questionType 포함');
assert(serverSrc.includes('section:      q.section'),            'server.js: section 포함');
assert(serverSrc.includes('stem:         q.stem'),               'server.js: stem 포함');
assert(serverSrc.includes('passage:      q.passage'),            'server.js: passage 포함');
assert(serverSrc.includes('options:      q.options'),            'server.js: options 포함');
assert(serverSrc.includes('imageFile:    q.imageFile'),          'server.js: imageFile 포함');
assert(serverSrc.includes('imageOptions: q.imageOptions'),       'server.js: imageOptions 포함');
assert(serverSrc.includes('answer:       q.answer'),             'server.js: answer(정답) 포함');
assert(serverSrc.includes('expected:     q.expected'),           'server.js: expected 포함');
assert(serverSrc.includes('submitted:    q.submitted'),          'server.js: submitted(학생답) 포함');
assert(serverSrc.includes('correct:      q.correct'),            'server.js: correct 포함');

console.log('\n[3] server.js: speakingDetails 빌드 및 저장');
assert(serverSrc.includes('let speakingDetails = null'),         'server.js: speakingDetails 초기화');
assert(serverSrc.includes('speakingDetails = spkData.questions.map'), 'server.js: speakingDetails 빌드');
assert(serverSrc.includes("spkData.answers[q.id]"),              'server.js: 스피킹 답변 매핑');
assert(serverSrc.includes('questionDetails,') && serverSrc.includes('speakingDetails,') &&
  serverSrc.indexOf('speakingDetails,') > serverSrc.indexOf('questionDetails,'),
  'server.js: store 저장 시 두 필드 전달');

// 학생 리포트 엔드포인트에 questionDetails 미포함 검증
console.log('\n[4] 학생 리포트 엔드포인트 — questionDetails 미노출');
// 학생 endpoint는 studentName/stage/stageName/completedAt/assessment만 반환
assert(!serverSrc.match(/res\.json\(\{[\s\S]{0,200}questionDetails[\s\S]{0,50}studentName/),
  '학생 리포트: questionDetails 미포함 (학생 노출 금지)');

// ── 5. admin-assign.html — renderDetailHtml ───────────────────────────────
console.log('\n[5] admin-assign.html: renderDetailHtml 문항별 상세 렌더링');
assert(adminSrc.includes('data.questionDetails'),         'renderDetailHtml: questionDetails 사용');
assert(adminSrc.includes('data.speakingDetails'),         'renderDetailHtml: speakingDetails 사용');
assert(adminSrc.includes('q-detail-list'),                'renderDetailHtml: #q-detail-list 렌더링');
assert(adminSrc.includes('q-detail-filter'),              'renderDetailHtml: 필터 버튼 렌더링');
assert(adminSrc.includes('filterQItems'),                 'renderDetailHtml: filterQItems 호출');
assert(adminSrc.includes('오답만'),                       'renderDetailHtml: "오답만" 필터 옵션');
assert(adminSrc.includes('data-correct='),                'renderDetailHtml: data-correct 속성');
assert(adminSrc.includes('q-wrong'),                      'renderDetailHtml: q-wrong 클래스');
assert(adminSrc.includes('q-opt-student-wrong'),          'renderDetailHtml: 학생 오답 강조 클래스');
assert(adminSrc.includes('q-opt-correct'),                'renderDetailHtml: 정답 강조 클래스');
assert(adminSrc.includes('q-opt-student-right'),          'renderDetailHtml: 학생 정답 클래스');
assert(adminSrc.includes('renderTextOpts'),               'renderDetailHtml: 텍스트 선택지 렌더 함수');
assert(adminSrc.includes('renderPicOpts'),                'renderDetailHtml: 그림 선택지 렌더 함수');
assert(adminSrc.includes('renderUnscramble'),             'renderDetailHtml: 문장배열 렌더 함수');
assert(adminSrc.includes('renderSpkItem'),                'renderDetailHtml: 스피킹 렌더 함수');
assert(adminSrc.includes('q-compare-val q-student-wrong'),'renderDetailHtml: unscramble 오답 강조');
assert(adminSrc.includes('q-compare-val q-correct-val'),  'renderDetailHtml: unscramble 정답 표시');
assert(adminSrc.includes('q-spk-method'),                 'renderDetailHtml: 스피킹 응답방법 표시');
assert(adminSrc.includes('무응답'),                       'renderDetailHtml: 무응답 처리');
assert(adminSrc.includes('문항 상세 데이터 없음'),        'renderDetailHtml: 구 데이터 fallback 문구');
assert(adminSrc.includes('/img/'),                         'renderDetailHtml: 이미지 경로 /img/ 접두사');

// ── 6. filterQItems 함수 ─────────────────────────────────────────────────
console.log('\n[6] filterQItems 전역 함수');
assert(adminSrc.includes('function filterQItems(mode)'),  'filterQItems 함수 정의');
assert(adminSrc.includes("dataset.correct === 'false'"),  'filterQItems: data-correct=false 필터 조건');
assert(adminSrc.includes("mode === 'wrong'"),             "filterQItems: 'wrong' 모드 처리");
assert(adminSrc.includes('el.style.display'),             'filterQItems: display 토글');

// ── 7. CSS 클래스 정의 확인 ──────────────────────────────────────────────
console.log('\n[7] CSS 클래스 정의');
assert(adminSrc.includes('.q-item {'),        'CSS: .q-item');
assert(adminSrc.includes('.q-item.q-wrong {'),'CSS: .q-item.q-wrong (오답 강조)');
assert(adminSrc.includes('.q-num {'),         'CSS: .q-num');
assert(adminSrc.includes('.q-sec-badge {'),   'CSS: .q-sec-badge');
assert(adminSrc.includes('.q-opt {'),         'CSS: .q-opt');
assert(adminSrc.includes('.q-pic-opt {'),     'CSS: .q-pic-opt');
assert(adminSrc.includes('.q-compare {'),     'CSS: .q-compare (unscramble)');
assert(adminSrc.includes('.q-stt-text {'),    'CSS: .q-stt-text (스피킹)');
assert(adminSrc.includes('.q-detail-filter {'),'CSS: .q-detail-filter');

// ── 8. 진단 리포트엔 문항별 상세 없음 ────────────────────────────────────
console.log('\n[8] 진단 리포트: 문항별 상세 미포함');
// renderDiagnosticHtml 안에 q-detail-list가 없어야 함
const diagFnMatch = adminSrc.match(/function renderDiagnosticHtml[\s\S]+?(?=\nfunction |\n\/\*\*)/);
if (diagFnMatch) {
  const diagFn = diagFnMatch[0];
  assert(!diagFn.includes('q-detail-list'),  '진단 리포트 함수: #q-detail-list 없음');
  assert(!diagFn.includes('questionDetails'),'진단 리포트 함수: questionDetails 없음');
} else {
  ng('진단 리포트 함수 파싱 실패');
}

// ── 9. 학생 화면(test.html) — questionDetails 미노출 ─────────────────────
console.log('\n[9] 학생 화면(test.html): questionDetails 미노출');
assert(!testHtmlSrc.includes('questionDetails'), 'test.html: questionDetails 없음');
assert(!testHtmlSrc.includes('q-detail-list'),   'test.html: q-detail-list 없음');

// ── 10. assign-store 실제 동작 ────────────────────────────────────────────
console.log('\n[10] assign-store: submitAssignment 확장 파라미터 동작');
const os   = require('os');
const storeModule = require('../lib/assign-store');

const TMP  = path.join(os.tmpdir(), 'qd-check-' + Date.now());
fs.mkdirSync(TMP, { recursive: true });
// 임시 데이터 파일 생성
fs.writeFileSync(path.join(TMP, 'academies.json'), JSON.stringify([
  { id:'a1', name:'테스트원', code:'TST', passwordHash:'$2b$10$abcdefghijklmnopqrstuuVGiPkCuFH4a2L9N0mH2JWLrq3EiYvNK' }
]));
fs.writeFileSync(path.join(TMP, 'students.json'), JSON.stringify([]));
const testCode = 'QDCHK1';
fs.writeFileSync(path.join(TMP, 'assignments.json'), JSON.stringify([{
  accessCode: testCode, academyId:'a1', studentName:'테스터', stage:2, stageName:'Starter',
  status:'in_progress', quiz:{ questions:[{ id:'q1', questionType:'multiple_choice', answer:1 }] },
  answers:[], score:null, assessment:null, completedAt:null,
}]));

// store 생성 (DATA_DIR 주입)
const storeA = storeModule.createStore({ dataDir: TMP });
const sampleQD = [{ id:'q1', questionType:'multiple_choice', section:'vocabulary', stem:'Pick cat',
                    options:['dog','cat','bird'], answer:1, submitted:0, correct:false }];
const sampleSD = [{ id:'s1', stem:'Say hello', answer:{ text:'hello', method:'voice' } }];

const result = storeA.submitAssignment(testCode, {
  answers:         [{ questionId:'q1', answer:0 }],
  score:           0,
  assessment:      { score:0, total:1, scorePct:0 },
  questionDetails: sampleQD,
  speakingDetails: sampleSD,
});

assert(result.status === 'done',           'submitAssignment: status=done');
assert(Array.isArray(result.questionDetails) && result.questionDetails.length === 1,
  'submitAssignment: questionDetails 저장됨');
assert(result.questionDetails[0].id === 'q1',    'submitAssignment: questionDetails[0].id 정확');
assert(result.questionDetails[0].correct === false, 'submitAssignment: questionDetails[0].correct 정확');
assert(Array.isArray(result.speakingDetails) && result.speakingDetails.length === 1,
  'submitAssignment: speakingDetails 저장됨');
assert(result.speakingDetails[0].answer.method === 'voice',
  'submitAssignment: speakingDetails[0].answer.method 정확');

// questionDetails/speakingDetails 없이 호출해도 기존 동작 유지
const testCode2 = 'QDCHK2';
const list2 = JSON.parse(fs.readFileSync(path.join(TMP, 'assignments.json'), 'utf8'));
list2.push({ accessCode:testCode2, academyId:'a1', studentName:'테스터2', stage:2, stageName:'Starter',
             status:'in_progress', quiz:null, answers:[], score:null, assessment:null, completedAt:null });
fs.writeFileSync(path.join(TMP, 'assignments.json'), JSON.stringify(list2));
const result2 = storeA.submitAssignment(testCode2, { answers:[], score:10, assessment:{ score:10 } });
assert(result2.status === 'done',                'submitAssignment(기존 호출): status=done');
assert(result2.questionDetails === undefined,    'submitAssignment(기존 호출): questionDetails 없음');
assert(result2.speakingDetails === undefined,    'submitAssignment(기존 호출): speakingDetails 없음');

// ── 결과 ──────────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────');
console.log('PASS: ' + pass + '  FAIL: ' + fail);
if (fail > 0) { console.error('검증 실패. 위 FAIL 항목을 수정하세요.'); process.exit(1); }
else          { console.log('모든 검증 통과!'); }
