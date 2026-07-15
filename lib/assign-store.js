/**
 * lib/assign-store.js — 배정 플로우 데이터 계층
 *
 * 사용법:
 *   const { createStore } = require('./lib/assign-store');
 *   const store = createStore({ dataDir, academiesFile });
 *
 * 모든 파일 쓰기는 tmp-then-rename 원자적 저장으로 수행한다.
 */
'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

// ── 단계 가이드 (원장용) ──────────────────────────────────────────────────
const STAGE_GUIDE = {
  1: { label: 'Seeker',     active: true,
       guide: '알파벳·기초 파닉스 단계. 알파벳 문자 인식, 초성·종성·단모음·이중자음 파닉스를 익히기 시작한 학생. 그림을 보고 알맞은 글자/단어를 고르는 형태로 출제됩니다.' },
  2: { label: 'Builder',    active: true,
       guide: '기초 단어는 알지만 문장이 서툰 학생. 간단한 생활 표현을 익히기 시작한 수준.' },
  3: { label: 'Challenger', active: true,
       guide: '짧은 문장을 읽고 쓸 수 있으며 일상 주제로 간단한 대화가 가능한 학생.' },
  4: { label: 'Explorer',   active: true,
       guide: '복합 문장 구성이 가능하고 다양한 주제의 지문을 읽고 이해할 수 있는 학생.' },
  5: { label: 'Inventor',   active: true,
       guide: '고급 어휘·복잡한 구문을 이해하며 논리적으로 글을 쓰고 말할 수 있는 학생.' },
};
const ACTIVE_STAGES = [2, 3, 4, 5];

// ── 원자적 JSON 쓰기 ──────────────────────────────────────────────────────
function writeJSONAtomic(file, data) {
  const tmp = file + '.tmp.' + process.pid + '.' + Date.now();
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8') || '[]'); }
  catch { return []; }
}

function ensureFile(file, init) {
  if (!fs.existsSync(file)) writeJSONAtomic(file, init);
}

// ── 토큰 (HMAC-sha256, 24h 만료, stateless) ─────────────────────────────
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;

function makeToken(academyId, secret) {
  const ts  = Date.now();
  const sig = crypto.createHmac('sha256', secret)
    .update(String(academyId) + ':' + ts).digest('hex').slice(0, 24);
  return Buffer.from(String(academyId) + ':' + ts + ':' + sig).toString('base64url');
}

function parseToken(token, secret) {
  try {
    const decoded  = Buffer.from(token, 'base64url').toString();
    const lastCol  = decoded.lastIndexOf(':');
    const secCol   = decoded.lastIndexOf(':', lastCol - 1);
    const sig      = decoded.slice(lastCol + 1);
    const ts       = decoded.slice(secCol + 1, lastCol);
    const acadId   = decoded.slice(0, secCol);
    const expected = crypto.createHmac('sha256', secret)
      .update(acadId + ':' + ts).digest('hex').slice(0, 24);
    if (sig !== expected) return null;
    if (Date.now() - parseInt(ts, 10) > TOKEN_EXPIRY_MS) return null;
    return { academyId: parseInt(acadId, 10) };
  } catch { return null; }
}

// ── 비밀번호 해시 (sha256 + 고정 salt) ───────────────────────────────────
function hashPw(pw) {
  return crypto.createHash('sha256').update('englab2024:' + pw).digest('hex');
}

// ── 접근 코드 (8자 hex) ───────────────────────────────────────────────────
function makeAccessCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

// ─────────────────────────────────────────────────────────────────────────
//  createStore
// ─────────────────────────────────────────────────────────────────────────
function createStore({ dataDir, academiesFile, tokenSecret } = {}) {
  const SECRET = tokenSecret || process.env.TOKEN_SECRET || 'englab-token-secret-2024';

  const ACADEMIES_FILE   = academiesFile || path.join(dataDir, 'academies.json');
  const STUDENTS_FILE    = path.join(dataDir, 'students.json');
  const ASSIGNMENTS_FILE = path.join(dataDir, 'assignments.json');

  // 파일 초기화
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  ensureFile(STUDENTS_FILE,    []);
  ensureFile(ASSIGNMENTS_FILE, []);
  if (!fs.existsSync(ACADEMIES_FILE)) ensureFile(ACADEMIES_FILE, []);

  // ── 학원 인증 ──────────────────────────────────────────────────────────
  function loginAcademy(academyId, password) {
    const academics = readJSON(ACADEMIES_FILE);
    const ac = academics.find(a => a.id === parseInt(academyId, 10));
    if (!ac) throw new Error('학원을 찾을 수 없습니다.');

    if (ac.adminPasswordHash) {
      if (hashPw(password) !== ac.adminPasswordHash)
        throw new Error('비밀번호가 틀렸습니다.');
    } else {
      // 비밀번호 미설정 → 글로벌 ADMIN_PASSWORD 환경변수로 확인
      const fallback = process.env.ADMIN_PASSWORD;
      if (!fallback) throw new Error('서버 설정 오류: ADMIN_PASSWORD 환경변수가 설정되지 않았습니다.');
      if (password !== fallback) throw new Error('비밀번호가 틀렸습니다.');
    }
    const token = makeToken(ac.id, SECRET);
    return { token, academy: { id: ac.id, name: ac.name } };
  }

  function verifyToken(token) {
    return parseToken(token, SECRET);
  }

  function getAcademy(academyId) {
    return readJSON(ACADEMIES_FILE).find(a => a.id === parseInt(academyId, 10)) || null;
  }

  // ── 학생 CRUD ─────────────────────────────────────────────────────────
  function getStudents(academyId) {
    return readJSON(STUDENTS_FILE)
      .filter(s => s.academy === parseInt(academyId, 10));
  }

  function createStudent({ academyId, name, email, createdBy }) {
    name  = (name  || '').trim();
    email = (email || '').trim();
    if (!name)  throw new Error('학생 이름은 필수입니다.');
    if (!email) throw new Error('이메일은 필수입니다.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new Error('올바른 이메일 형식이 아닙니다.');

    const students = readJSON(STUDENTS_FILE);

    const student = {
      id:        Date.now(),
      academy:   parseInt(academyId, 10),
      name,
      email,
      createdAt: new Date().toISOString(),
      createdBy: createdBy || 'admin',
    };
    students.push(student);
    writeJSONAtomic(STUDENTS_FILE, students);
    return student;
  }

  function deleteStudent(academyId, studentId) {
    const before = readJSON(STUDENTS_FILE);
    const after  = before.filter(
      s => !(s.academy === parseInt(academyId, 10) && s.id === parseInt(studentId, 10))
    );
    if (after.length === before.length) throw new Error('학생을 찾을 수 없습니다.');
    writeJSONAtomic(STUDENTS_FILE, after);
    return { ok: true };
  }

  // ── 배정 CRUD ─────────────────────────────────────────────────────────
  function getAssignments(academyId) {
    return readJSON(ASSIGNMENTS_FILE)
      .filter(a => a.academy === parseInt(academyId, 10))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  function createAssignment({ academyId, studentId, studentName, studentEmail, stage, createdBy }) {
    stage = parseInt(stage, 10);
    if (!STAGE_GUIDE[stage])          throw new Error('유효하지 않은 단계입니다.');
    if (!STAGE_GUIDE[stage].active)   throw new Error(`단계 ${stage}(${STAGE_GUIDE[stage].label})는 현재 비활성입니다.`);
    if (!(studentName || '').trim())  throw new Error('학생 이름은 필수입니다.');
    if (!(studentEmail || '').trim()) throw new Error('이메일은 필수입니다.');

    const assignment = {
      id:           Date.now(),
      academy:      parseInt(academyId, 10),
      studentId:    studentId ? parseInt(studentId, 10) : null,
      studentName:  studentName.trim(),
      studentEmail: studentEmail.trim(),
      stage,
      stageName:    STAGE_GUIDE[stage].label,
      status:       'assigned',
      accessCode:   makeAccessCode(),
      guideShown:   false,
      createdAt:    new Date().toISOString(),
      createdBy:    createdBy || 'admin',
      quiz:         null,   // composeTest 결과 (서버 내부용)
      answers:      null,   // 학생 제출 답변
      score:        null,
      completedAt:  null,
    };
    const list = readJSON(ASSIGNMENTS_FILE);
    list.push(assignment);
    writeJSONAtomic(ASSIGNMENTS_FILE, list);
    return assignment;
  }

  function getAssignmentByCode(code) {
    return readJSON(ASSIGNMENTS_FILE).find(a => a.accessCode === code) || null;
  }

  // 시험 시작: 최초 호출 시 quiz(composed questions + correct answers) 저장
  function startAssignment(code, quiz) {
    const list = readJSON(ASSIGNMENTS_FILE);
    const idx  = list.findIndex(a => a.accessCode === code);
    if (idx < 0) throw new Error('배정 코드를 찾을 수 없습니다.');
    if (list[idx].status === 'done') throw new Error('이미 완료된 시험입니다.');
    if (list[idx].status !== 'in_progress') {
      list[idx] = Object.assign({}, list[idx], {
        status:    'in_progress',
        quiz:      quiz || list[idx].quiz,
        startedAt: new Date().toISOString(),
      });
    } else if (quiz) {
      list[idx].quiz = quiz; // 재전달된 quiz가 있으면 갱신
    }
    writeJSONAtomic(ASSIGNMENTS_FILE, list);
    return list[idx];
  }

  function submitAssignment(code, { answers, score, assessment, questionDetails, speakingDetails }) {
    const list = readJSON(ASSIGNMENTS_FILE);
    const idx  = list.findIndex(a => a.accessCode === code);
    if (idx < 0) throw new Error('배정 코드를 찾을 수 없습니다.');
    if (list[idx].status === 'done') throw new Error('이미 완료된 시험입니다.');
    list[idx] = Object.assign({}, list[idx], {
      status:      'done',
      answers:     answers     || [],
      score:       score       ?? null,
      assessment:  assessment  || null,
      completedAt: new Date().toISOString(),
      ...(questionDetails !== undefined ? { questionDetails } : {}),
      ...(speakingDetails !== undefined ? { speakingDetails } : {}),
    });
    writeJSONAtomic(ASSIGNMENTS_FILE, list);
    return list[idx];
  }

  return {
    // 인증
    loginAcademy, verifyToken, getAcademy,
    // 학생
    getStudents, createStudent, deleteStudent,
    // 배정
    getAssignments, createAssignment, getAssignmentByCode,
    startAssignment, submitAssignment,
    // 유틸 (check script 용)
    writeJSONAtomic, readJSON,
    STAGE_GUIDE, ACTIVE_STAGES,
    FILES: { STUDENTS_FILE, ASSIGNMENTS_FILE, ACADEMIES_FILE },
  };
}

module.exports = {
  createStore, STAGE_GUIDE, ACTIVE_STAGES,
  writeJSONAtomic,
  hashPw,
  readJSON: (f) => {
    try { return JSON.parse(fs.readFileSync(f, 'utf8') || '[]'); } catch { return []; }
  },
};
