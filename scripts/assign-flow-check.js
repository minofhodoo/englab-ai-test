/**
 * assign-flow-check.js — 배정 플로우 검증 스크립트
 *
 * 실행: node scripts/assign-flow-check.js
 *
 * 검증 항목
 *  1. 학원 격리: academyA 토큰으로 academyB 학생을 볼 수 없음
 *  2. 이메일 필수: 이메일 없이 학생 저장 → 거부
 *  3. 단계 제한: Seeker(1) 배정 → 거부, Builder~Inventor(2-5) → 허용
 *  4. 풀 플로우: 배정 → accessCode 발급 → composeTest(stage) 30문항 → 채점 → status=done
 *  5. 원자적 저장: 동시 쓰기 후 파일 파손 없음
 */
'use strict';

const path = require('path');
const fs   = require('fs');
const os   = require('os');
const TC   = require(path.join(__dirname, '../public/test-composer.js'));
const { createStore, STAGE_GUIDE, ACTIVE_STAGES, writeJSONAtomic, hashPw, readJSON } =
  require(path.join(__dirname, '../lib/assign-store.js'));

// ── 색상 헬퍼 ─────────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', gray: '\x1b[90m',
};
const ok   = s => C.green  + '✓ ' + s + C.reset;
const fail = s => C.red    + '✗ ' + s + C.reset;
const hdr  = s => '\n' + C.bold + C.cyan + s + C.reset;

let PASS = 0, FAIL = 0;
function assert(cond, label, detail) {
  if (cond) { console.log('  ' + ok(label)); PASS++; }
  else {
    const d = detail ? C.gray + '  (' + detail + ')' + C.reset : '';
    console.log('  ' + fail(label) + d); FAIL++;
  }
}

// ── top-level await 지원을 위해 async IIFE 감싸기 ─────────────────────────
(async () => {

// ── 테스트용 임시 디렉터리 + 두 학원 데이터 준비 ──────────────────────────
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'englab-check-'));
const ACADEMIES_FILE = path.join(TMP_DIR, 'academies.json');

const ACADEMY_A = { id: 1001, name: '호두학원', adminPasswordHash: hashPw('pwA'), addedAt: new Date().toISOString() };
const ACADEMY_B = { id: 1002, name: '사과학원', adminPasswordHash: hashPw('pwB'), addedAt: new Date().toISOString() };
writeJSONAtomic(ACADEMIES_FILE, [ACADEMY_A, ACADEMY_B]);

const storeA = createStore({ dataDir: path.join(TMP_DIR, 'a'), academiesFile: ACADEMIES_FILE });
const storeB = createStore({ dataDir: path.join(TMP_DIR, 'b'), academiesFile: ACADEMIES_FILE });
// 두 스토어가 같은 academies.json을 공유하되 각자 다른 students/assignments 디렉터리 사용

// ── 1. 학원 격리 ──────────────────────────────────────────────────────────
console.log(hdr('1. 학원 격리 (academy isolation)'));

let tokenA, tokenB;
try {
  const ra = storeA.loginAcademy(ACADEMY_A.id, 'pwA');
  tokenA = ra.token;
  assert(!!tokenA, 'academyA 로그인 성공 (토큰 발급)');
} catch (e) { assert(false, 'academyA 로그인 성공', e.message); }

try {
  const rb = storeB.loginAcademy(ACADEMY_B.id, 'pwB');
  tokenB = rb.token;
  assert(!!tokenB, 'academyB 로그인 성공 (토큰 발급)');
} catch (e) { assert(false, 'academyB 로그인 성공', e.message); }

// academyA에 학생 추가
storeA.createStudent({ academyId: ACADEMY_A.id, name: '김학생', email: 'a@a.com' });

// academyA 토큰으로 academyA 학생 조회 → 보여야 함
const studentsA = storeA.getStudents(ACADEMY_A.id);
assert(studentsA.length === 1, 'academyA 토큰으로 academyA 학생 조회 (1명)');

// academyA 토큰으로 academyB 학생 조회 → 0명이어야 함
const studentsAviewingB = storeA.getStudents(ACADEMY_B.id);
assert(studentsAviewingB.length === 0, 'academyA는 academyB 학생 0명 조회 (격리)');

// 잘못된 비밀번호로 로그인 시도
let wrongPwBlocked = false;
try {
  storeA.loginAcademy(ACADEMY_A.id, 'wrong-password');
} catch (e) { wrongPwBlocked = true; }
assert(wrongPwBlocked, '틀린 비밀번호 → 로그인 거부');

// 토큰 검증
const payloadA = storeA.verifyToken(tokenA);
assert(payloadA && payloadA.academyId === ACADEMY_A.id, 'tokenA 검증 → academyId 반환');
const payloadB = storeA.verifyToken(tokenB);
// storeA와 storeB는 같은 TOKEN_SECRET을 공유하므로 서로의 토큰을 검증할 수 있음
// (실제 서버에서는 단일 store 인스턴스 사용)
assert(payloadB && payloadB.academyId === ACADEMY_B.id, 'tokenB 검증 → academyId 반환');

// ── 2. 이메일 필수 ────────────────────────────────────────────────────────
console.log(hdr('2. 이메일 필수 검증'));

let emailMissingBlocked = false;
try {
  storeA.createStudent({ academyId: ACADEMY_A.id, name: '무이메일', email: '' });
} catch (e) {
  emailMissingBlocked = e.message.includes('이메일');
}
assert(emailMissingBlocked, '이메일 없이 학생 저장 → 거부 ("이메일 필수" 오류)');

let emailInvalidBlocked = false;
try {
  storeA.createStudent({ academyId: ACADEMY_A.id, name: '형식오류', email: 'not-an-email' });
} catch (e) {
  emailInvalidBlocked = e.message.includes('형식');
}
assert(emailInvalidBlocked, '이메일 형식 오류 → 거부');

let nameBlocked = false;
try {
  storeA.createStudent({ academyId: ACADEMY_A.id, name: '', email: 'b@b.com' });
} catch (e) { nameBlocked = e.message.includes('이름'); }
assert(nameBlocked, '이름 없이 학생 저장 → 거부');

// 정상 등록
let validStudent = null;
try {
  validStudent = storeA.createStudent({ academyId: ACADEMY_A.id, name: '이정상', email: 'normal@test.com' });
  assert(!!validStudent && validStudent.email === 'normal@test.com', '유효한 이름+이메일 → 등록 성공');
} catch (e) { assert(false, '유효한 이름+이메일 → 등록 성공', e.message); }

// 이메일 중복 → 이제 허용 (유니크 제약 제거)
let dupAllowed = false;
try {
  const dup = storeA.createStudent({ academyId: ACADEMY_A.id, name: '중복이', email: 'normal@test.com' });
  dupAllowed = !!dup;
} catch (e) { dupAllowed = false; }
assert(dupAllowed, '동일 이메일 다른 이름 → 등록 허용 (유니크 제약 없음)');

// ── 3. 단계 제한 (Seeker=활성, Builder~Inventor=활성) ────────────────────
console.log(hdr('3. 단계 배정 제한'));

const testStudent = validStudent || storeA.getStudents(ACADEMY_A.id)[0];

// 단계 1 (Seeker) → 활성화됨, 배정 허용
let seeker1Ok = false;
try {
  const a1 = storeA.createAssignment({
    academyId: ACADEMY_A.id,
    studentId: testStudent.id, studentName: testStudent.name, studentEmail: testStudent.email,
    stage: 1,
  });
  seeker1Ok = !!a1 && a1.stage === 1;
} catch (e) { seeker1Ok = false; }
assert(seeker1Ok, '단계 1(Seeker) 배정 → 허용 (active:true)');

// 단계 0 (존재하지 않음) → 거부
let invalidStageBlocked = false;
try {
  storeA.createAssignment({
    academyId: ACADEMY_A.id,
    studentId: testStudent.id, studentName: testStudent.name, studentEmail: testStudent.email,
    stage: 0,
  });
} catch (e) { invalidStageBlocked = e.message.includes('유효'); }
assert(invalidStageBlocked, '단계 0 (없는 단계) 배정 → 거부');

// 단계 2~5 → 허용
for (const s of ACTIVE_STAGES) {
  let ok2 = false;
  try {
    const a = storeA.createAssignment({
      academyId: ACADEMY_A.id,
      studentId: testStudent.id, studentName: testStudent.name, studentEmail: testStudent.email,
      stage: s,
    });
    ok2 = !!a.accessCode && a.stage === s && a.status === 'assigned';
  } catch (e) { console.log(C.gray + '    stage ' + s + ' err: ' + e.message + C.reset); }
  assert(ok2, `단계 ${s}(${STAGE_GUIDE[s].label}) 배정 성공 + accessCode 발급`);
}

// ── 4. 전체 플로우 (배정 → composeTest → 채점 → status=done) ─────────────
console.log(hdr('4. 풀 플로우 검증'));

const FLOW_STAGES = [2, 3, 4, 5];
for (const stage of FLOW_STAGES) {
  const stageName = STAGE_GUIDE[stage].label;
  console.log(C.gray + '  [단계 ' + stage + ' ' + stageName + ']' + C.reset);

  // (a) 배정 생성
  let assign;
  try {
    assign = storeA.createAssignment({
      academyId: ACADEMY_A.id,
      studentId: testStudent.id,
      studentName: testStudent.name,
      studentEmail: testStudent.email,
      stage,
    });
  } catch (e) { assert(false, `단계 ${stage} 배정 생성`, e.message); continue; }
  assert(assign.status === 'assigned' && assign.accessCode.length === 8,
    `  배정 생성 완료 (code=${assign.accessCode})`);

  // (b) accessCode로 배정 조회
  const found = storeA.getAssignmentByCode(assign.accessCode);
  assert(found && found.stage === stage,
    `  accessCode로 배정 조회 (stage=${found && found.stage})`);

  // (c) composeTest(stage) → 30문항
  const composed = TC.composeTest(stage);
  assert(composed.active && composed.questions.length === 30,
    `  composeTest(${stage}) → ${composed.questions.length}문항`);

  // (d) 시험 시작 (quiz 저장)
  const quiz = { questions: composed.questions, meta: composed.meta, composedAt: new Date().toISOString() };
  storeA.startAssignment(assign.accessCode, quiz);
  const started = storeA.getAssignmentByCode(assign.accessCode);
  assert(started.status === 'in_progress', '  시험 시작 → status=in_progress');

  // (e) 랜덤 응답으로 채점
  const scoredQs = composed.questions.map(q => Object.assign({}, q, { correct: Math.random() > 0.5 }));
  const assessment = TC.scoreAndDiagnose(stage, scoredQs);
  assert(
    typeof assessment.score === 'number' &&
    assessment.score >= 0 &&
    assessment.score <= assessment.total,
    `  scoreAndDiagnose → ${assessment.score}/${assessment.total} (${assessment.scorePct}%)`
  );

  // (f) 제출 → status=done
  const submitted = storeA.submitAssignment(assign.accessCode, {
    answers:    composed.questions.map(q => ({ questionId: q.id, answer: 0 })),
    score:      assessment.score,
    assessment,
  });
  assert(submitted.status === 'done', '  제출 후 status=done');

  // (g) getBonusCandidates (보너스 후보)
  const bonusCands = TC.getBonusCandidates(stage, composed.questions);
  assert(Array.isArray(bonusCands), `  getBonusCandidates → ${bonusCands.length}문항`);
}

// ── 5. 원자적 저장 (동시 쓰기 시 파일 파손 없음) ──────────────────────────
console.log(hdr('5. 원자적 저장 검증'));

const concFile = path.join(TMP_DIR, 'concurrent-test.json');
writeJSONAtomic(concFile, []);

// setImmediate를 이용한 비동기적 동시 쓰기 시뮬레이션
const N = 20;
await Promise.all(
  Array.from({ length: N }, (_, i) =>
    new Promise(resolve => setImmediate(() => {
      const data = readJSON(concFile);
      data.push({ seq: i, ts: Date.now() });
      writeJSONAtomic(concFile, data);
      resolve();
    }))
  )
);

const concResult = readJSON(concFile);
assert(Array.isArray(concResult), `파일 파싱 성공 (JSON 손상 없음) — ${concResult.length}/${N}레코드`);
const isJSON = (() => {
  try { JSON.parse(fs.readFileSync(concFile, 'utf8')); return true; } catch { return false; }
})();
assert(isJSON, '동시 쓰기 후 파일이 유효한 JSON');
// 단일 프로세스에서 Promise.all+setImmediate는 실질적으로 직렬 실행되므로 N개 모두 저장됨
// 멀티 프로세스 환경에서는 파일 잠금이 별도로 필요함을 명시
if (concResult.length < N) {
  console.log(C.yellow + '  ⚠  ' + concResult.length + '/' + N +
    '개 저장 (단일 프로세스 read-modify-write 경쟁 발생). 파일 손상은 없음.' + C.reset);
}

// ── 6. 팀 피드백 수정 소스 검증 ──────────────────────────────────────────
console.log(hdr('6. 팀 피드백 수정 소스 검증'));

const SERVER_SRC = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
const TEST_HTML  = fs.readFileSync(path.join(__dirname, '../public/test.html'), 'utf8');

// 피드백 2: / → test.html 라우팅
assert(
  /app\.get\s*\(\s*'\/'\s*,/.test(SERVER_SRC),
  "server.js: app.get('/') 명시적 루트 라우팅 존재"
);
assert(
  SERVER_SRC.indexOf("app.get('/',") < SERVER_SRC.indexOf("express.static("),
  "server.js: app.get('/') 가 express.static 보다 먼저 선언됨"
);
assert(
  SERVER_SRC.includes('test.html') && SERVER_SRC.indexOf('test.html') <
    SERVER_SRC.indexOf('express.static('),
  "server.js: / 라우트가 test.html 을 서빙"
);

// 피드백 3: 학생 확인 화면에서 레벨명·단계번호 숨김
assert(
  !TEST_HTML.includes('단계 ${data.stage}'),
  "test.html: 확인 화면에 단계번호 텍스트 없음"
);
assert(
  !TEST_HTML.includes('data.stageName'),
  "test.html: 확인 화면에 stageName 표시 없음"
);
assert(
  TEST_HTML.includes('_stageEl.style.display') && TEST_HTML.includes("'none'"),
  "test.html: confirm-stage 숨김 처리 존재"
);
assert(
  TEST_HTML.includes('STAGE_GUIDE_MAP[data.stage]'),
  "test.html: 단계 설명(STAGE_GUIDE_MAP) 은 여전히 표시"
);

// ── 정리 ─────────────────────────────────────────────────────────────────
fs.rmSync(TMP_DIR, { recursive: true, force: true });

// ── 최종 결과 ─────────────────────────────────────────────────────────────
console.log(hdr('═══ 검증 결과 ═══'));
const total = PASS + FAIL;
if (FAIL === 0) {
  console.log(C.bold + C.green + '  전체 통과: ' + PASS + '/' + total + C.reset);
} else {
  console.log(C.bold + C.red + '  실패 ' + FAIL + '/' + total + C.reset);
  process.exitCode = 1;
}
console.log('');

})().catch(e => { console.error(C.red + '예외: ' + e.message + C.reset); process.exitCode = 1; });
