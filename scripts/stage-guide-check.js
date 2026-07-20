'use strict';
/**
 * stage-guide-check.js — 단계별 학습 수준 문구 정합성 검사
 *
 * 검사 항목:
 *  [1] stage-guide.js 모듈 로드 및 6단계 키 존재
 *  [2] 6단계 문구 값 정확성 (최종 확정본)
 *  [3] test.html이 stage-guide.js를 로드하고 StageGuide.STAGE_GUIDE_MAP을 참조하는지
 *  [4] test.html confirm 화면 구성요소 존재 (로고·타이틀·시작버튼 등)
 *  [5] test.html에 레벨명·단계번호 직접 노출 없음
 *  [6] 공용 모듈 밖에 구 문구 잔존 여부 (하드코딩 탐지)
 */

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const HR = '═'.repeat(60);

function ok(label)      { console.log('  PASS  ' + label); pass++; }
function ng(label, why) { console.error('  FAIL  ' + label + (why ? ' — ' + why : '')); fail++; }
function assert(cond, label, why) { cond ? ok(label) : ng(label, why); }

// ── 정답 상수 (이 스크립트가 유일한 검증 기준) ─────────────────────────────
const EXPECTED = {
  1: '알파벳과 파닉스를 배우고 있어요.',
  2: '쉬운 단어와 짧은 문장을 읽을 수 있어요.',
  3: '기본 문장을 이해하고 영어로 쓸 수 있어요.',
  4: '영어 지문을 읽고 내용을 이해할 수 있어요.',
  5: '영어로 자신의 생각을 말하고 글로 표현할 수 있어요.',
  6: '영어로 자신의 생각을 말하고 글로 표현할 수 있어요.',
};
const LEVEL_NAMES = { 1:'Seeker', 2:'Builder', 3:'Challenger', 4:'Explorer', 5:'Inventor', 6:'Innovator' };

// ── [1] 모듈 로드 ─────────────────────────────────────────────────────────
console.log('\n[1] stage-guide.js 모듈 로드');
const sgPath = path.join(ROOT, 'public', 'stage-guide.js');
assert(fs.existsSync(sgPath), 'stage-guide.js 파일 존재');

let SG;
try {
  SG = require(sgPath);
  assert(SG && typeof SG === 'object', 'require() 반환값 객체');
  assert(typeof SG.STAGE_GUIDE_MAP === 'object', 'STAGE_GUIDE_MAP 내보내기');
} catch (e) {
  ng('stage-guide.js require 실패', e.message);
  SG = null;
}

// ── [2] 6단계 문구 값 검증 ──────────────────────────────────────────────
console.log('\n[2] 6단계 문구 정확성');
if (SG && SG.STAGE_GUIDE_MAP) {
  const map = SG.STAGE_GUIDE_MAP;
  for (let stage = 1; stage <= 6; stage++) {
    const got = map[stage];
    const exp = EXPECTED[stage];
    assert(got === exp,
      `Stage ${stage} (${LEVEL_NAMES[stage]}) 문구`,
      got ? `"${got}" ≠ "${exp}"` : '값 없음');
  }
  assert(Object.keys(map).length === 6, 'STAGE_GUIDE_MAP 키 수 = 6');
} else {
  for (let s = 1; s <= 6; s++) ng(`Stage ${s} 문구`, '모듈 로드 실패로 건너뜀');
  ng('STAGE_GUIDE_MAP 키 수', '모듈 로드 실패로 건너뜀');
}

// ── [3] test.html 모듈 참조 ──────────────────────────────────────────────
console.log('\n[3] test.html → stage-guide.js 참조');
const htmlPath = path.join(ROOT, 'public', 'test.html');
const HTML = fs.readFileSync(htmlPath, 'utf8');

assert(HTML.includes('stage-guide.js'),           'test.html: <script src="/stage-guide.js"> 존재');
assert(HTML.includes('StageGuide.STAGE_GUIDE_MAP'), 'test.html: StageGuide.STAGE_GUIDE_MAP 참조');

// ── [4] confirm 화면 구성요소 ────────────────────────────────────────────
console.log('\n[4] confirm 화면 UI 요소');
assert(HTML.includes('confirm-logo-img'),   'confirm: 로고 이미지 엘리먼트');
assert(HTML.includes('AI ONLINE LEVEL TEST'), 'confirm: 타이틀 문구');
assert(HTML.includes('약 15~20분 소요'),      'confirm: 소요 시간 뱃지');
assert(HTML.includes('confirm-student-name'), 'confirm: 학생명 표시 엘리먼트');
assert(HTML.includes('현재 학습 수준'),        'confirm: 학습 수준 라벨');
assert(HTML.includes('btn-confirm-start'),   'confirm: 시작 버튼 클래스');
assert(HTML.includes('시험 시작하기'),        'confirm: 시작 버튼 텍스트');
assert(HTML.includes('sda-logo.jpg'),        'confirm: 로고 경로 /img/sda-logo.jpg');
// onerror가 src보다 먼저 나오는지 확인
const onerrorIdx = HTML.indexOf('logo.onerror');
const srcIdx     = HTML.indexOf("logo.src = '/img/sda-logo.jpg'");
assert(onerrorIdx > -1 && srcIdx > -1 && onerrorIdx < srcIdx,
  'confirm: logo onerror 등록이 src 지정보다 앞에 위치');

// ── [5] 레벨명·단계번호 미노출 ───────────────────────────────────────────
console.log('\n[5] 레벨명·단계번호 학생 화면 미노출');
assert(!HTML.includes('data.stageName'),         'confirm-name에 stageName 미노출');
assert(!HTML.includes('단계 ${data.stage}'),     '단계번호 문자열 미노출');
assert(!HTML.includes('confirm-stage'),          '구 confirm-stage 엘리먼트 제거됨');

// ── [6] 구 문구 하드코딩 잔존 탐지 ──────────────────────────────────────
console.log('\n[6] 구 문구 하드코딩 잔존 없음');
const OLD_TEXTS = [
  '기본 문장을 읽고 쓸 수 있어요',          // 구 Stage 3
  '말하거나 쓸 수 있어요',                  // 구 Stage 5/6
];
const filesToCheck = [
  path.join(ROOT, 'public', 'test.html'),
  path.join(ROOT, 'server.js'),
  path.join(ROOT, 'public', 'admin-assign.html'),
];
for (const fpath of filesToCheck) {
  const src = fs.readFileSync(fpath, 'utf8');
  const rel = path.relative(ROOT, fpath);
  for (const old of OLD_TEXTS) {
    assert(!src.includes(old), `${rel}: 구 문구 없음 — "${old.slice(0,20)}…"`);
  }
}

// ── 결과 ──────────────────────────────────────────────────────────────────
console.log('\n' + HR);
if (fail === 0) {
  console.log(`PASS: ${pass}  FAIL: 0  — 모든 문구 정합성 통과`);
} else {
  console.log(`PASS: ${pass}  FAIL: ${fail}`);
  process.exit(1);
}
