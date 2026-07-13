/**
 * speaking-fix-check.js — Listen & Speak 버그 수정 검증 (서버 불필요)
 *
 * 검증 항목:
 *  1. Bug 1: 대문자 강제 없음 — CSS text-transform:none + autocapitalize 속성
 *  2. Bug 2: STT 미지원 시 배너 노출 + 마이크 버튼 숨김 + 폴백 자동 포커스
 *  3. Bug 2: STT 오류(not-allowed, audio-capture) 시 폴백 하이라이트 + 포커스
 *  4. Bug 2: toggleRecording에 fbInput 인자 전달 + !SR 가드 메시지
 *  5. 타이핑 폴백으로 답변 완료 → calcResponseRate 0% (음성 없음)
 *  6. 음성/타이핑 혼합 응답률 계산 (음성 응답만 계산, formula 불변)
 *  7. buildSpeakingReport: 타이핑 답변은 [타이핑] 태그로 기록
 *  8. 기존 speaking-check.js calcResponseRate 케이스 회귀 없음
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT    = path.join(__dirname, '..');
const HTML    = fs.readFileSync(path.join(ROOT, 'public', 'test.html'), 'utf8');
const { calcResponseRate, buildSpeakingReport } =
  require(path.join(ROOT, 'public', 'speaking-utils.js'));

let PASS = 0, FAIL = 0;
const failures = [];

function assert(cond, label, got) {
  if (cond) {
    console.log('  PASS  ' + label);
    PASS++;
  } else {
    const suffix = got !== undefined ? ' (got: ' + JSON.stringify(got) + ')' : '';
    console.error('  FAIL  ' + label + suffix);
    failures.push(label);
    FAIL++;
  }
}

const hdr = s => '\n[' + s + ']';

// ── 1. Bug 1: CSS — text-transform 오버라이드 ────────────────────────────────
console.log(hdr('1. CSS: 대문자 강제 없음'));

// 전역 input[type=text] 에는 여전히 uppercase (코드 입력 필드용)
assert(
  HTML.includes('input[type=text]') && HTML.includes('text-transform:uppercase'),
  '전역 input[type=text] 에 text-transform:uppercase 존재 (코드 입력 필드 의도적 유지)'
);

// .spk-fallback-input 에 text-transform:none 오버라이드
const fallbackCssMatch = HTML.match(/\.spk-fallback-input\s*\{[^}]+\}/);
assert(
  fallbackCssMatch && fallbackCssMatch[0].includes('text-transform:none'),
  '.spk-fallback-input CSS에 text-transform:none 존재'
);
assert(
  fallbackCssMatch && fallbackCssMatch[0].includes('text-align:left'),
  '.spk-fallback-input CSS에 text-align:left 존재'
);
assert(
  fallbackCssMatch && fallbackCssMatch[0].includes('letter-spacing:normal'),
  '.spk-fallback-input CSS에 letter-spacing:normal 존재'
);

// ── 2. Bug 1: JS — autocapitalize / autocorrect 속성 ────────────────────────
console.log(hdr('2. JS: autocapitalize / autocorrect 속성'));

assert(
  HTML.includes("fbInput.autocapitalize = 'none'"),
  "fbInput.autocapitalize = 'none' 설정"
);
assert(
  HTML.includes("fbInput.autocorrect    = 'off'") || HTML.includes("fbInput.autocorrect = 'off'"),
  "fbInput.autocorrect = 'off' 설정"
);
assert(
  HTML.includes('fbInput.spellcheck     = false') || HTML.includes('fbInput.spellcheck = false'),
  'fbInput.spellcheck = false 설정'
);

// ── 3. Bug 2: CSS — 새 클래스 존재 ──────────────────────────────────────────
console.log(hdr('3. CSS: 새 클래스 존재'));

assert(
  HTML.includes('.spk-no-sr-banner'),
  'CSS: .spk-no-sr-banner 정의 존재'
);
assert(
  HTML.includes('.spk-fallback-input.highlight'),
  'CSS: .spk-fallback-input.highlight 정의 존재'
);

// ── 4. Bug 2: JS — 마이크 버튼 숨김 (disabled 아님) ─────────────────────────
console.log(hdr('4. JS: !_hasSR 시 마이크 버튼 숨김'));

assert(
  HTML.includes("if (!_hasSR) recBtn.style.display = 'none'"),
  "!_hasSR 시 recBtn.style.display = 'none' (버튼 숨김)"
);
// disabled 방식 제거됐는지 확인 (renderSpeakingQuestion 안에 recBtn.disabled = !_hasSR 없어야)
const renderFnStart = HTML.indexOf('function renderSpeakingQuestion');
const renderFnEnd   = HTML.indexOf('\nfunction ', renderFnStart + 1);
const renderFnSrc   = HTML.slice(renderFnStart, renderFnEnd > 0 ? renderFnEnd : renderFnStart + 3000);
assert(
  !renderFnSrc.includes('recBtn.disabled = !_hasSR'),
  'renderSpeakingQuestion: recBtn.disabled = !_hasSR 제거됨'
);

// ── 5. Bug 2: JS — STT 미지원 배너 생성 코드 ────────────────────────────────
console.log(hdr('5. JS: STT 미지원 배너'));

assert(
  HTML.includes('spk-no-sr-banner') && HTML.includes('card.insertBefore(banner'),
  'STT 미지원 시 banner 생성 + insertBefore 존재'
);
assert(
  HTML.includes('이 브라우저는 음성 인식을 지원하지 않아요'),
  'STT 미지원 배너 안내 문구 존재'
);
assert(
  HTML.includes('fbInput.focus()') && HTML.includes('setTimeout'),
  '미지원 시 fbInput 자동 포커스(setTimeout) 존재'
);

// ── 6. Bug 2: JS — toggleRecording fbInput 인자 + !SR 가드 ─────────────────
console.log(hdr('6. JS: toggleRecording 시그니처 + !SR 가드'));

assert(
  HTML.includes('function toggleRecording(qid, recBtn, transcriptEl, statusEl, fbInput)'),
  'toggleRecording 시그니처에 fbInput 인자 추가됨'
);
assert(
  HTML.includes('toggleRecording(q.id, recBtn, transcriptEl, statusEl, fbInput)'),
  'recBtn.onclick에서 fbInput 전달'
);

const toggleFnStart = HTML.indexOf('function toggleRecording');
const toggleFnEnd   = HTML.indexOf('\nfunction ', toggleFnStart + 1);
const toggleFnSrc   = HTML.slice(toggleFnStart, toggleFnEnd > 0 ? toggleFnEnd : toggleFnStart + 2000);

assert(
  toggleFnSrc.includes('음성 인식이 지원되지 않습니다'),
  '!SR 가드: 상태 메시지 존재'
);
assert(
  toggleFnSrc.includes("fbInput) { fbInput.classList.add('highlight'); fbInput.focus(); }") ||
  (toggleFnSrc.includes("fbInput.classList.add('highlight')") && toggleFnSrc.includes('fbInput.focus()')),
  '!SR 가드: fbInput highlight + focus 처리'
);

// ── 7. Bug 2: JS — onerror not-allowed 시 폴백 하이라이트 ───────────────────
console.log(hdr('7. JS: onerror not-allowed 시 폴백 처리'));

assert(
  toggleFnSrc.includes("'not-allowed'") && toggleFnSrc.includes("'audio-capture'"),
  "onerror: 'not-allowed' / 'audio-capture' 분기 존재"
);
assert(
  toggleFnSrc.includes('아래 칸에 직접 입력해 주세요'),
  "onerror not-allowed: '아래 칸에 직접 입력해 주세요' 안내"
);
// not-allowed 분기에서 fbInput.focus() 호출 확인
const notAllowedBlock = toggleFnSrc.slice(
  toggleFnSrc.indexOf("'not-allowed'"),
  toggleFnSrc.indexOf("} else {", toggleFnSrc.indexOf("'not-allowed'"))
);
assert(
  notAllowedBlock.includes('fbInput') && notAllowedBlock.includes('focus'),
  'onerror not-allowed 분기: fbInput.focus() 호출'
);

// ── 8. 타이핑 폴백 응답 저장 → method:'typing' ───────────────────────────────
console.log(hdr('8. 타이핑 폴백 저장 로직'));

assert(
  HTML.includes("method: 'typing'"),
  "fbBtn.onclick: method:'typing' 저장"
);
assert(
  HTML.includes("method: 'voice'"),
  "onresult: method:'voice' 저장"
);

// ── 9. calcResponseRate — 음성만 카운트 (formula 불변) ───────────────────────
console.log(hdr('9. calcResponseRate — 음성 응답률 (formula 불변)'));

// 타이핑 전용 → 0%
const typingOnly = {
  q1: { text: 'I like cats',   method: 'typing' },
  q2: { text: 'I play soccer', method: 'typing' },
  q3: { text: 'My name is Kim', method: 'typing' },
};
assert(
  calcResponseRate(typingOnly, 3) === 0,
  '타이핑 전용 3문항 → 음성 응답률 0%',
  calcResponseRate(typingOnly, 3)
);

// 혼합: voice 2 + typing 2 → 50%
const mixed = {
  q1: { text: 'a', method: 'voice'  },
  q2: { text: 'b', method: 'voice'  },
  q3: { text: 'c', method: 'typing' },
  q4: { text: 'd', method: 'typing' },
};
assert(
  calcResponseRate(mixed, 4) === 50,
  '음성 2 + 타이핑 2 / 전체 4 → 음성 응답률 50%',
  calcResponseRate(mixed, 4)
);

// 전원 무응답 → 0%
assert(calcResponseRate({}, 4) === 0, '응답 없음 → 0%');
// total=0 → null
assert(calcResponseRate({}, 0) === null, 'total=0 → null');

// 기존 speaking-check.js 케이스 회귀 없음
const voice3Typing1 = {
  'spk-2-1': { text: 'My name is Tom',   method: 'voice'  },
  'spk-2-2': { text: 'I like blue',      method: 'voice'  },
  'spk-2-3': { text: 'Yes I have a dog', method: 'voice'  },
  'spk-2-4': { text: 'I play soccer',    method: 'typing' },
};
assert(
  calcResponseRate(voice3Typing1, 4) === 75,
  '기존 케이스 회귀: 음성 3 / 전체 4 → 75%',
  calcResponseRate(voice3Typing1, 4)
);

const fiveAns = {
  s1: { text: 'a', method: 'voice'  },
  s2: { text: 'b', method: 'voice'  },
  s3: { text: 'c', method: 'voice'  },
  s4: { text: 'd', method: 'typing' },
  s5: { text: 'e', method: 'typing' },
};
assert(
  calcResponseRate(fiveAns, 5) === 60,
  '기존 케이스 회귀: 음성 3 / 전체 5 → 60%',
  calcResponseRate(fiveAns, 5)
);

// ── 10. buildSpeakingReport — 타이핑 [타이핑] 태그 ───────────────────────────
console.log(hdr('10. buildSpeakingReport — 타이핑 태그 + 응답률'));

const qs = [
  { id:'q1', prompt:'What is your name?',    promptKo:'이름?' },
  { id:'q2', prompt:'What do you like?',     promptKo:'좋아하는 것?' },
  { id:'q3', prompt:'Describe your school.', promptKo:'학교 묘사?' },
  { id:'q4', prompt:'What is your hobby?',   promptKo:'취미?' },
];
const ans = {
  q1: { text: 'My name is Alex', method: 'voice'  },
  q2: { text: 'I like soccer',   method: 'typing' },
  // q3: 무응답
  q4: { text: 'I read books',    method: 'voice'  },
};
const rpt = buildSpeakingReport(qs, ans);

assert(typeof rpt.responseRate === 'number', 'responseRate 숫자', typeof rpt.responseRate);
assert(rpt.responseRate === 50, '음성 2 / 전체 4 → responseRate 50%', rpt.responseRate);
assert(rpt.sttText.includes('[음성]'),    'sttText에 [음성] 태그');
assert(rpt.sttText.includes('[타이핑]'),  'sttText에 [타이핑] 태그');
assert(rpt.sttText.includes('(무응답)'), 'sttText에 (무응답) 표시');
assert(rpt.sttText.includes('I like soccer'), 'sttText에 타이핑 텍스트 포함');

// 타이핑 전용 리포트
const typingReport = buildSpeakingReport(qs, {
  q1: { text: 'Tom', method: 'typing' },
  q2: { text: 'soccer', method: 'typing' },
  q3: { text: 'big', method: 'typing' },
  q4: { text: 'reading', method: 'typing' },
});
assert(typingReport.responseRate === 0, '타이핑 전용 → responseRate 0%', typingReport.responseRate);
assert(!typingReport.sttText.includes('[음성]'), '타이핑 전용 → [음성] 없음');
assert(typingReport.sttText.includes('[타이핑]'),  '타이핑 전용 → [타이핑] 존재');

// 빈 문항 → null
const emptyRpt = buildSpeakingReport([], {});
assert(emptyRpt.responseRate === null, '문항 없음 → responseRate null');
assert(emptyRpt.sttText     === null, '문항 없음 → sttText null');

// ── 11. 팀 재테스트 — 단계 설명 문구 ──────────────────────────────────────────
console.log(hdr('11. STAGE_GUIDE_MAP 새 문구'));

assert(HTML.includes("1: '알파벳과 파닉스를 배우고 있어요'"), 'Stage 1 Seeker 설명');
assert(HTML.includes("2: '쉬운 단어와 짧은 문장을 읽을 수 있어요'"), 'Stage 2 Builder 설명');
assert(HTML.includes("3: '기본 문장을 읽고 쓸 수 있어요'"), 'Stage 3 Challenger 설명');
assert(HTML.includes("4: '영어 지문을 읽고 내용을 이해할 수 있어요'"), 'Stage 4 Explorer 설명');
assert(HTML.includes("5: '영어로 자신의 생각을 말하거나 쓸 수 있어요'"), 'Stage 5 Inventor 설명');
assert(HTML.includes("6: '영어로 자신의 생각을 말하거나 쓸 수 있어요'"), 'Stage 6 Innovator 설명');
// 레벨명·단계번호 미노출 확인
assert(!HTML.includes("data.stageName"), '확인 화면에 stageName 미노출 (이전 fix 유지)');
assert(!HTML.includes("단계 ${data.stage}"), '확인 화면에 단계번호 미노출');

// ── 12. 독해 지문 폰트 크기 ────────────────────────────────────────────────────
console.log(hdr('12. 독해 지문 font-size'));

const passageCssMatch = HTML.match(/\.passage\s*\{[^}]+\}/);
assert(
  passageCssMatch && passageCssMatch[0].includes('1.2rem'),
  '.passage CSS font-size:1.2rem 적용'
);
assert(
  passageCssMatch && !passageCssMatch[0].includes('font-size:14px'),
  '.passage CSS 구 14px 제거됨'
);

// ── 13. Builder writing ko_hint 표시 ───────────────────────────────────────────
console.log(hdr('13. ko_hint 표시'));

assert(HTML.includes('.q-ko-hint'), 'CSS: .q-ko-hint 클래스 정의 존재');
assert(HTML.includes('q.ko_hint'), 'JS: q.ko_hint 분기 존재');
assert(HTML.includes("hint.className = 'q-ko-hint'"), "JS: hint.className = 'q-ko-hint' 설정");
assert(
  HTML.includes("'(' + q.ko_hint + ')'"),
  'JS: ko_hint 괄호로 감싸서 표시'
);

// ── 14. STT continuous + 자동 재시작 ──────────────────────────────────────────
console.log(hdr('14. STT: continuous=true + 자동 재시작'));

const newToggleSrc = HTML.slice(
  HTML.indexOf('function toggleRecording'),
  HTML.indexOf('\nfunction stopRecording')
);
assert(
  newToggleSrc.includes('continuous      = true') ||
  newToggleSrc.includes('continuous = true') ||
  newToggleSrc.includes("continuous     = true"),
  'STT: continuous = true 설정'
);
assert(
  newToggleSrc.includes('doStart') && newToggleSrc.includes('setTimeout(doStart'),
  'STT: onend 시 doStart 자동 재시작 존재'
);
assert(
  newToggleSrc.includes('_spkRecording') && newToggleSrc.includes('_spkDone'),
  'STT: _spkRecording / _spkDone 상태 변수 사용'
);
assert(
  newToggleSrc.includes('_spk_timer') || newToggleSrc.includes('_spkSecsLeft'),
  'STT: 타이머 표시 로직 존재'
);
assert(
  newToggleSrc.includes('⏹ 완료'),
  'STT: 녹음 중 버튼 텍스트 "⏹ 완료"'
);
assert(
  newToggleSrc.includes('30'),
  'STT: 30초 자동 완료 설정'
);
assert(
  !newToggleSrc.includes("continuous = false") && !newToggleSrc.includes("continuous     = false"),
  'STT: continuous = false 없음 (이전 방식 제거)'
);
assert(
  newToggleSrc.includes('e.resultIndex'),
  'STT onresult: e.resultIndex 부터 순회 (중복 누적 방지)'
);
assert(
  !newToggleSrc.match(/for \(let i = 0; i < e\.results\.length/),
  'STT onresult: i=0 전체 재순회 없음 (중복 버그 제거)'
);

// stopRecording 에서도 새 상태 정리하는지
const stopFnSrc = HTML.slice(
  HTML.indexOf('function stopRecording'),
  HTML.indexOf('\n// ── ④-b 실제 제출')
);
assert(
  stopFnSrc.includes('_spkRecording = false'),
  'stopRecording: _spkRecording = false 초기화'
);
assert(
  stopFnSrc.includes('clearInterval'),
  'stopRecording: clearInterval 타이머 정리'
);

// ── 최종 결과 ─────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(60));
console.log('결과: ' + PASS + ' passed, ' + FAIL + ' failed');
if (failures.length > 0) {
  console.error('\n실패 항목:');
  failures.forEach(f => console.error('  - ' + f));
}
if (FAIL > 0) process.exit(1);
