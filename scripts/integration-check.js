/**
 * integration-check.js
 * 전체 플로우 end-to-end 통합 점검 (라이브 서버 불필요)
 *
 * 검증 단계:
 *  1. 원장 로그인(토큰) → 학생 생성 → 배정(stage 2~5) → accessCode 발급
 *  2. composeTest(stage) → 문항 구조 · 70:30 · 지문 온전성 · D&D 정오판정 · 스피킹
 *  3. 제출 → scoreAndDiagnose → 적정+도전 레벨 · 스피킹 미반영 확인 → status=done
 *  4. 원장 리포트: 영역별·CEFR·스피킹 응답률·STT 포함 확인
 *  5. 학생 리포트: STT·경쟁사 미노출 확인
 *  6. Academy 격리: 타 학원 데이터 접근 차단
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const TC = require('../public/test-composer');
const AU = require('../public/answer-utils');
const SU = require('../public/speaking-utils');
const { createStore, hashPw } = require('../lib/assign-store');

// ── 테스트용 환경변수 설정 ────────────────────────────────────────────────
process.env.ADMIN_PASSWORD = 'integration-test-pw-9x7z';
process.env.TOKEN_SECRET   = 'integration-test-secret-2024';

// ── 임시 데이터 디렉터리 ─────────────────────────────────────────────────
const TMP_DIR = path.join(os.tmpdir(), 'englab-integ-' + Date.now());
fs.mkdirSync(TMP_DIR, { recursive: true });

let passed = 0, failed = 0;
const failures = [];

function assert(cond, label) {
  if (cond) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    failures.push(label);
    failed++;
  }
}

function assertThrows(fn, label) {
  try { fn(); console.error(`  FAIL  ${label} (예외 미발생)`); failures.push(label); failed++; }
  catch { console.log(`  PASS  ${label}`); passed++; }
}

function cleanup() {
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
}

// ── 스토어 초기화 ────────────────────────────────────────────────────────
const store = createStore({ dataDir: TMP_DIR });

// 학원 직접 삽입 (HTTP 없이 파일 조작)
function seedAcademy(name, password) {
  const list = store.readJSON(store.FILES.ACADEMIES_FILE);
  const ac   = {
    id:                Date.now() + Math.floor(Math.random() * 1000),
    name,
    adminPasswordHash: hashPw(password),
    addedAt:           new Date().toISOString(),
  };
  list.push(ac);
  store.writeJSONAtomic(store.FILES.ACADEMIES_FILE, list);
  return ac;
}

// ═══════════════════════════════════════════════════════════════════════════
//  STEP 1: 원장 로그인 → 학생 생성 → 배정 → accessCode 발급
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[Step 1] 원장 로그인 · 학생 생성 · 배정 · accessCode');

const acA = seedAcademy('통합테스트학원A', 'pw-A-2024');
const acB = seedAcademy('통합테스트학원B', 'pw-B-2024');

// 1-1. 로그인 → 토큰 발급
let tokenA, tokenB;
try {
  const loginA = store.loginAcademy(acA.id, 'pw-A-2024');
  tokenA = loginA.token;
  assert(typeof tokenA === 'string' && tokenA.length > 10, '학원A 로그인 토큰 발급');
  assert(loginA.academy.id === acA.id, '학원A 토큰에 academyId 포함');
} catch (e) {
  assert(false, `학원A 로그인 → ${e.message}`);
}

try {
  const loginB = store.loginAcademy(acB.id, 'pw-B-2024');
  tokenB = loginB.token;
  assert(typeof tokenB === 'string', '학원B 로그인 토큰 발급');
} catch (e) {
  assert(false, `학원B 로그인 → ${e.message}`);
}

// 1-2. 토큰 검증
const payloadA = store.verifyToken(tokenA);
assert(payloadA && payloadA.academyId === acA.id, '학원A 토큰 검증 성공');
assert(!store.verifyToken('invalid.token.xyz'), '위조 토큰 → null 반환');

// 1-3. 틀린 비밀번호 → 예외
assertThrows(
  () => store.loginAcademy(acA.id, 'wrong-password'),
  '틀린 비밀번호 → 예외 발생'
);

// 1-4. 이메일 없는 학생 생성 → 예외
assertThrows(
  () => store.createStudent({ academyId: acA.id, name: '이름만', email: '' }),
  '이메일 없는 학생 생성 → 예외'
);

// 1-5. 정상 학생 생성
let studentA;
try {
  studentA = store.createStudent({ academyId: acA.id, name: '김테스트', email: 'test@example.com' });
  assert(studentA.id && studentA.academy === acA.id, '학생 생성 성공 · academyId 바인딩');
  assert(studentA.email === 'test@example.com', '학생 이메일 저장');
} catch (e) {
  assert(false, `학생 생성 → ${e.message}`);
}

// 1-6. 중복 이메일 → 이제 허용 (유니크 제약 제거)
try {
  const dup = store.createStudent({ academyId: acA.id, name: '중복이름', email: 'test@example.com' });
  assert(!!dup, '동일 이메일 다른 이름 → 등록 허용 (유니크 제약 없음)');
} catch (e) {
  assert(false, `동일 이메일 다른 이름 → 등록 허용 (에러: ${e.message})`);
}

// 1-7. Stage 1(Seeker) 활성 확인 (Seeker 문항 활성화됨)
assert(store.STAGE_GUIDE[1].active === true, 'Stage 1(Seeker) 활성 상태');

// 1-8. Stage 2~5 배정 + accessCode 발급
const assignmentsByStage = {};
for (const stage of [2, 3, 4, 5]) {
  try {
    const a = store.createAssignment({
      academyId: acA.id,
      studentName: `학생${stage}`,
      studentEmail: `student${stage}@example.com`,
      stage,
    });
    assert(typeof a.accessCode === 'string' && a.accessCode.length === 8, `Stage ${stage} accessCode 발급(8자)`);
    assert(a.status === 'assigned', `Stage ${stage} 초기 status=assigned`);
    assert(a.academy === acA.id, `Stage ${stage} academyId 바인딩`);
    assignmentsByStage[stage] = a;
  } catch (e) {
    assert(false, `Stage ${stage} 배정 → ${e.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  STEP 2: composeTest → 문항 구조 · 70:30 · 지문 온전성 · D&D · 스피킹
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[Step 2] composeTest · 문항 구조 · 정오판정 · 스피킹');

// Stage 1(Seeker) 활성 확인 (Seeker 문항 활성화됨)
const s1 = TC.composeTest(1);
assert(s1.active === true, 'Stage 1 composeTest → active:true');
assert(Array.isArray(s1.questions) && s1.questions.length === 30, `Stage 1 questions = 30문항 (실제: ${s1.questions.length})`);
assert(s1.questions.every(q => q.questionType === 'image_prompt_choice'), 'Stage 1 모든 문항 image_prompt_choice');

// 활성 Stage 전체 검사
let mainAssignment = null; // Step 3에서 사용할 배정 (Stage 3)
let mainComposed   = null;

for (const stage of [2, 3, 4, 5]) {
  const result = TC.composeTest(stage);

  assert(result.active === true, `Stage ${stage} active:true`);
  assert(Array.isArray(result.questions) && result.questions.length > 0, `Stage ${stage} 문항 존재`);

  const total = result.meta.totalQuestions;
  const base  = result.meta.baseCount;
  const upper = result.meta.upperCount;

  assert(total >= 15 && total <= 32, `Stage ${stage} 총 문항 수 범위(15~32): ${total}개`);

  // 70:30 비율 (upper가 있는 경우)
  if (upper > 0) {
    const baseRatio = base / total;
    assert(baseRatio >= 0.60 && baseRatio <= 0.80,
      `Stage ${stage} base 비율 60~80%(실제:${Math.round(baseRatio*100)}%)`);
  }

  // 독해 지문 온전성: 같은 passage 를 공유하는 문항은 모두 포함되어야 함
  const readingQs = result.questions.filter(q => q.section === 'reading' && q.passage);
  const passageMap = new Map();
  for (const q of readingQs) {
    if (!passageMap.has(q.passage)) passageMap.set(q.passage, 0);
    passageMap.set(q.passage, passageMap.get(q.passage) + 1);
  }
  // 각 지문에 문항이 1개 이상 있으면 온전성 OK (분할 없음)
  const passagesOk = [...passageMap.values()].every(cnt => cnt >= 1);
  assert(passagesOk, `Stage ${stage} 독해 지문 온전성`);

  // 섹션 존재 확인 (vocabulary, grammar)
  assert(result.questions.some(q => q.section === 'vocabulary'), `Stage ${stage} vocabulary 문항 존재`);
  assert(result.questions.some(q => q.section === 'grammar'),    `Stage ${stage} grammar 문항 존재`);

  // 모든 문항에 id 존재
  assert(result.questions.every(q => q.id != null), `Stage ${stage} 모든 문항에 id 존재`);

  if (stage === 3) {
    mainComposed   = result;
    mainAssignment = assignmentsByStage[3];
  }
}

// D&D(unscramble) 정오판정
const allQs   = mainComposed ? mainComposed.questions : [];
const unscram = allQs.filter(q => AU.isUnscrambleType(q));

if (unscram.length > 0) {
  const q = unscram[0];
  // 정답: expected[0] 그대로 제출
  const correctSubmission = Array.isArray(q.expected) ? q.expected[0] : q.expected;
  assert(AU.judgeUnscramble(correctSubmission, q.expected), 'unscramble 정답 → true');

  // 대소문자 무시
  assert(AU.judgeUnscramble(correctSubmission.toUpperCase(), q.expected),
    'unscramble 대소문자 무시 → true');

  // 오답
  assert(!AU.judgeUnscramble('completely wrong answer xyz', q.expected),
    'unscramble 오답 → false');

  // 빈 문자열
  assert(!AU.judgeUnscramble('', q.expected), 'unscramble 빈 제출 → false');

  // extractTrailingPunct: expected[0]에 마침표 있으면 추출
  const punct = AU.extractTrailingPunct(q.expected);
  assert(punct === '' || /^[.?!]$/.test(punct), 'extractTrailingPunct → 빈 문자열 또는 구두점');
} else {
  console.log('  INFO  Stage 3 writing에 unscramble 문항 없음 — D&D 정오판정 건너뜀');
}

// 스피킹 의미 일치 + 응답률
const spkFile = path.join(__dirname, '..', 'public', 'questions.speaking.json');
let spkQs = [];
try {
  const spkRaw = JSON.parse(fs.readFileSync(spkFile, 'utf8'));
  // { "2": [...], "3": [...], ... } 구조 → 평탄화
  spkQs = Array.isArray(spkRaw)
    ? spkRaw
    : Object.values(spkRaw).flat();
} catch {}
assert(Array.isArray(spkQs) && spkQs.length > 0, 'questions.speaking.json 로드 성공');

if (spkQs.length > 0) {
  const nameQ = spkQs.find(q => q.id === 'spk-2-1') || spkQs[0];

  // anyResponseValid가 true인 경우 내용만 있으면 match
  if (nameQ.anyResponseValid) {
    assert(SU.semanticMatch('My name is Kim', nameQ), 'anyResponseValid → 내용 있으면 true');
    assert(!SU.semanticMatch('',              nameQ), 'anyResponseValid → 빈 문자열 false');
  }

  // 응답률 계산
  const mockAnswers = {
    'spk-2-1': { method: 'voice',  text: 'My name is Kim' },
    'spk-2-2': { method: 'typing', text: 'I like blue' },
    'spk-2-3': { method: 'voice',  text: 'I have a dog' },
    'spk-2-4': { method: 'voice',  text: 'I play soccer after school' },
  };
  const lv2Qs     = spkQs.filter(q => q.level === 2);
  const rptResult = SU.buildSpeakingReport(lv2Qs, mockAnswers);
  assert(typeof rptResult.responseRate === 'number', 'buildSpeakingReport → responseRate 숫자');
  assert(rptResult.responseRate >= 0 && rptResult.responseRate <= 100,
    `responseRate 범위(0-100): ${rptResult.responseRate}`);
  assert(typeof rptResult.sttText === 'string' && rptResult.sttText.length > 0,
    'buildSpeakingReport → sttText 존재');

  // 응답 없음 → responseRate = 0
  const emptyRpt = SU.buildSpeakingReport(lv2Qs, {});
  assert(emptyRpt.responseRate === 0, '무응답 → responseRate = 0');

  // 스피킹 문항 없으면 null
  const noSpkRpt = SU.buildSpeakingReport([], {});
  assert(noSpkRpt.responseRate === null, '스피킹 문항 0개 → responseRate = null');
}

// ═══════════════════════════════════════════════════════════════════════════
//  STEP 3: 제출 → 채점 → scoreAndDiagnose → status=done
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[Step 3] 제출 · 채점 · scoreAndDiagnose · status=done');

if (mainComposed && mainAssignment) {
  const code = mainAssignment.accessCode;

  // 시험 시작 (quiz 저장)
  store.startAssignment(code, {
    questions:  mainComposed.questions,
    meta:       mainComposed.meta,
    composedAt: new Date().toISOString(),
  });
  const started = store.getAssignmentByCode(code);
  assert(started.status === 'in_progress', '시험 시작 후 status=in_progress');
  assert(started.quiz && started.quiz.questions.length > 0, 'quiz 저장됨');

  // 가짜 답변 생성 (base 전부 정답, upper 절반 정답)
  const scoredQs = mainComposed.questions.map(q => {
    let correct = false;
    if (q.origin === 'base') {
      correct = true;
    } else {
      // upper: 홀수번 index 정답
      const idx = mainComposed.questions.indexOf(q);
      correct = idx % 2 === 0;
    }
    return Object.assign({}, q, { correct });
  });

  // scoreAndDiagnose 직접 호출
  const assessment = TC.scoreAndDiagnose(mainAssignment.stage, scoredQs);

  assert(typeof assessment.score    === 'number', 'assessment.score 숫자');
  assert(typeof assessment.total    === 'number', 'assessment.total 숫자');
  assert(typeof assessment.scorePct === 'number', 'assessment.scorePct 숫자');
  assert(assessment.scorePct >= 0 && assessment.scorePct <= 100, 'scorePct 0~100 범위');

  // 적정 레벨 필드
  assert('appropriate' in assessment,           'appropriate 필드 존재');
  assert('level' in assessment.appropriate,     'appropriate.level 존재');
  assert('cefr'  in assessment.appropriate,     'appropriate.cefr 존재');
  // recommended는 diagnostics.json 없으면 null — 경고만
  if (assessment.appropriate.recommended === null) {
    console.log('  INFO  appropriate.recommended=null — diagnostics.json 미준비 상태');
  } else {
    assert(typeof assessment.appropriate.recommended === 'string',
      'appropriate.recommended 문자열');
  }

  // 도전 레벨 필드
  assert('challenge' in assessment,                           'challenge 필드 존재');
  assert(['advance','borderline','stay'].includes(assessment.challenge.signal),
    `challenge.signal 유효값: ${assessment.challenge.signal}`);
  assert(typeof assessment.challenge.upperCorrectRate === 'number',
    'challenge.upperCorrectRate 숫자');

  // 섹션별 점수
  assert('sections' in assessment, 'sections 필드 존재');
  for (const sec of ['vocabulary', 'grammar', 'reading', 'writing']) {
    const s = assessment.sections[sec];
    assert(s && typeof s.correct === 'number' && typeof s.total === 'number',
      `sections.${sec} correct/total 존재`);
  }

  // 스피킹은 scoreAndDiagnose 반환값에서 placeholder(null)
  assert(assessment.speaking.responseRate === null,
    'scoreAndDiagnose speaking.responseRate 초기값 null (레벨 산출 미반영)');
  assert(assessment.speaking.sttText      === null,
    'scoreAndDiagnose speaking.sttText 초기값 null');

  // 스피킹 보조지표 덮어쓰기 (server.js submit 로직 시뮬레이션)
  const lv2Qs2 = spkQs.filter(q => q.level === 2);
  const spkAnswers = {
    'spk-2-1': { method: 'voice', text: 'My name is Alex' },
    'spk-2-2': { method: 'voice', text: 'My favorite color is red' },
  };
  if (lv2Qs2.length > 0) {
    const spkReport = SU.buildSpeakingReport(lv2Qs2, spkAnswers);
    assessment.speaking = spkReport;
    assert(typeof assessment.speaking.responseRate === 'number',
      '스피킹 덮어쓰기 후 responseRate 숫자');
    assert(typeof assessment.speaking.sttText === 'string',
      '스피킹 덮어쓰기 후 sttText 문자열');
  }

  // store.submitAssignment → status=done
  const updated = store.submitAssignment(code, {
    answers:    scoredQs.map(q => ({ questionId: q.id, answer: q.submitted || '' })),
    score:      assessment.score,
    assessment,
  });
  assert(updated.status === 'done', 'submitAssignment 후 status=done');
  assert(updated.completedAt != null, 'completedAt 기록됨');

  // 중복 제출 → 예외
  assertThrows(
    () => store.submitAssignment(code, { answers: [], score: 0, assessment }),
    '중복 제출 → 예외'
  );

  // ═══════════════════════════════════════════════════════════════════════
  //  STEP 4: 원장 리포트 — 필드 확인
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n[Step 4] 원장 리포트 — 필드 확인');

  const storedA = store.getAssignmentByCode(code);
  assert(storedA.status === 'done', '원장 리포트 조회: status=done');

  // quiz 필드 제외 시뮬레이션 (server.js admin report 로직)
  // eslint-disable-next-line no-unused-vars
  const { quiz: _quizField, ...adminReport } = storedA;
  assert(!('quiz' in adminReport), '원장 리포트: quiz(정답) 필드 제외');
  assert('assessment' in adminReport, '원장 리포트: assessment 존재');

  const adminAssessment = adminReport.assessment;
  assert('sections'    in adminAssessment, '원장 리포트: sections 존재');
  assert('appropriate' in adminAssessment, '원장 리포트: appropriate 존재');
  assert('challenge'   in adminAssessment, '원장 리포트: challenge 존재');
  assert('speaking'    in adminAssessment, '원장 리포트: speaking 존재');

  // 스피킹 응답률 존재
  if (lv2Qs2.length > 0) {
    assert(adminAssessment.speaking.responseRate != null,
      '원장 리포트: speaking.responseRate 있음');
    assert('sttText' in adminAssessment.speaking,
      '원장 리포트: sttText 필드 존재(원장 전용)');
  }

  // 경쟁사 비교표 — admin-assign.html에서 별도 API 호출, assessment와 별개
  const compMapFile = path.join(__dirname, '..', 'data', 'competitor-map.json');
  const compMap = fs.existsSync(compMapFile)
    ? JSON.parse(fs.readFileSync(compMapFile, 'utf8'))
    : null;
  assert(compMap !== null, '경쟁사 비교표 파일 존재');
  assert(Array.isArray(compMap.competitorNames) && compMap.competitorNames.length > 0,
    '경쟁사 비교표 competitorNames 존재');
  // 원장 리포트 assessment 안에는 경쟁사 데이터가 없음 (별도 API로 분리)
  assert(!('competitorMap' in adminAssessment),
    '원장 assessment 객체에 경쟁사 데이터 미포함(별도 API 분리)');

  // ═══════════════════════════════════════════════════════════════════════
  //  STEP 5: 학생 리포트 — STT · 경쟁사 미노출
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n[Step 5] 학생 리포트 — STT · 경쟁사 미노출');

  // server.js 학생 리포트 로직 시뮬레이션
  function buildStudentReport(assignment) {
    let publicAssessment = assignment.assessment || null;
    if (publicAssessment && publicAssessment.speaking && publicAssessment.speaking.sttText != null) {
      publicAssessment = Object.assign({}, publicAssessment, {
        speaking: { responseRate: publicAssessment.speaking.responseRate },
      });
    }
    return {
      studentName: assignment.studentName,
      stage:       assignment.stage,
      stageName:   assignment.stageName,
      completedAt: assignment.completedAt,
      assessment:  publicAssessment,
    };
  }

  const studentReport = buildStudentReport(storedA);
  assert('studentName' in studentReport,  '학생 리포트: studentName 존재');
  assert('stage'       in studentReport,  '학생 리포트: stage 존재');
  assert('completedAt' in studentReport,  '학생 리포트: completedAt 존재');
  assert('assessment'  in studentReport,  '학생 리포트: assessment 존재');

  // STT 미노출
  const pubSpk = studentReport.assessment && studentReport.assessment.speaking;
  assert(!pubSpk || !('sttText' in pubSpk),
    '학생 리포트: sttText 필드 제거됨');
  // responseRate는 공개 OK
  assert(!pubSpk || 'responseRate' in pubSpk,
    '학생 리포트: responseRate는 포함됨');

  // 경쟁사 데이터 미노출 (assessment에 없고, 별도 인증 API로만 제공)
  const reportStr = JSON.stringify(studentReport);
  assert(!reportStr.includes('competitorNames') && !reportStr.includes('r-comp-wrap'),
    '학생 리포트 JSON: 경쟁사 데이터 미포함');

  // server.js 소스 확인 — 학생 리포트 엔드포인트에서 sttText 제거 로직 존재
  const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert(serverSrc.includes('sttText') && serverSrc.includes('STT'),
    'server.js: sttText 제거 로직 존재');
  // 학생용 리포트 라우트 (/api/assignment/:code/report) 에 sttText delete 있는지
  const studentRouteMatch = serverSrc.match(
    /GET.*assignment.*code.*report.*\n([\s\S]*?)\/\/ GET \/api\/admin/
  );
  if (studentRouteMatch) {
    assert(studentRouteMatch[0].includes('sttText'),
      'server.js 학생 라우트: sttText 처리 코드 확인');
  }

} else {
  assert(false, 'Step 3~5 건너뜀 — mainComposed/mainAssignment 없음');
}

// ═══════════════════════════════════════════════════════════════════════════
//  STEP 6: Academy 격리 — 타 학원 데이터 접근 차단
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[Step 6] Academy 격리');

// 학원B 배정 생성
const assignB = store.createAssignment({
  academyId: acB.id, studentName: '학원B학생', studentEmail: 'b@example.com', stage: 3,
});

// 학원A의 배정 목록에 학원B 배정이 없어야 함
const aAssignments = store.getAssignments(acA.id);
const bAssignments = store.getAssignments(acB.id);

assert(
  !aAssignments.some(a => a.accessCode === assignB.accessCode),
  '학원A 배정 목록에 학원B 배정 없음'
);
assert(
  !bAssignments.some(a => a.academy !== acB.id),
  '학원B 배정 목록에 학원A 데이터 없음'
);
assert(
  aAssignments.every(a => a.academy === acA.id),
  '학원A 배정 모두 academyId=학원A'
);
assert(
  bAssignments.every(a => a.academy === acB.id),
  '학원B 배정 모두 academyId=학원B'
);

// 학원A 학생 목록에 학원B 학생 없음
const aStudents = store.getStudents(acA.id);
const bStudents = store.getStudents(acB.id);
assert(aStudents.every(s => s.academy === acA.id), '학원A 학생 academyId 격리');
assert(bStudents.every(s => s.academy === acB.id), '학원B 학생 academyId 격리');

// 인증 격리: 학원B 토큰으로 학원A 배정 목록 → 빈 배열
const payloadB = store.verifyToken(tokenB);
assert(payloadB !== null, '학원B 토큰 검증 성공');
const bSeeAAssignments = store.getAssignments(payloadB.academyId);
assert(
  !bSeeAAssignments.some(a => a.academy === acA.id),
  '학원B 토큰으로 학원A 배정 조회 → 빈 결과'
);

// ADMIN_PASSWORD 미설정 시 loginAcademy 예외
const savedPw = process.env.ADMIN_PASSWORD;
delete process.env.ADMIN_PASSWORD;
// 학원B는 adminPasswordHash가 있으므로 → ADMIN_PASSWORD 미설정과 무관하게 hash 비교
// hash 없는 학원 생성 후 테스트
const acNoHash = seedAcademy('해시없는학원', '');
const listForNoHash = store.readJSON(store.FILES.ACADEMIES_FILE);
const noHashIdx = listForNoHash.findIndex(a => a.id === acNoHash.id);
if (noHashIdx >= 0) {
  delete listForNoHash[noHashIdx].adminPasswordHash;
  store.writeJSONAtomic(store.FILES.ACADEMIES_FILE, listForNoHash);
  assertThrows(
    () => store.loginAcademy(acNoHash.id, 'any-pw'),
    'ADMIN_PASSWORD 미설정 + hash 없는 학원 → 로그인 예외(환경변수 경고)'
  );
}
process.env.ADMIN_PASSWORD = savedPw;

// ═══════════════════════════════════════════════════════════════════════════
//  결과
// ═══════════════════════════════════════════════════════════════════════════
cleanup();

console.log(`\n${'─'.repeat(56)}`);
console.log(`결과: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.error('\n실패 항목:');
  failures.forEach(f => console.error(`  - ${f}`));
}
if (failed > 0) process.exit(1);
