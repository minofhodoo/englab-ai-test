'use strict';
/**
 * char-intro-check.js — 캐릭터 안내 화면 복원 검증
 */

const fs   = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(label)      { console.log('  PASS  ' + label); pass++; }
function ng(label, why) { console.error('  FAIL  ' + label + (why ? ' — ' + why : '')); fail++; }
function assert(cond, label, why) { cond ? ok(label) : ng(label, why); }

const html = fs.readFileSync(path.join(__dirname, '../public/test.html'), 'utf8');

// ── 1. 캐릭터 PNG 파일 존재 ────────────────────────────────────────────────
console.log('\n[1] 캐릭터 PNG 파일');
const CHARS = ['char-ello','char-toki','char-kapi','char-pixi','char-poco','char-nova'];
for (const c of CHARS) {
  const exists = fs.existsSync(path.join(__dirname, '../public/' + c + '.png'));
  assert(exists, c + '.png 존재');
}

// ── 2. HTML 화면 구조 ─────────────────────────────────────────────────────
console.log('\n[2] HTML 화면 구조');
assert(html.includes('id="screen-welcome"'),        'screen-welcome 존재');
assert(html.includes('id="screen-section-intro"'),  'screen-section-intro 존재');
assert(html.includes('id="screen-code"'),           'screen-code 존재');
assert(html.includes('id="screen-test"'),           'screen-test 존재');
assert(html.includes('id="screen-spk-prep"'),       'screen-spk-prep 존재');
assert(html.includes('id="screen-result"'),         'screen-result 존재');

// 웰컴이 active (class="screen active" id="screen-welcome")
assert(html.includes('class="screen active" id="screen-welcome"'),
       'screen-welcome가 active 초기값');
// screen-code는 class에 active가 없어야 함 (웰컴 이후 진입)
const codeDiv = html.match(/id="screen-code"[^>]*/);
assert(codeDiv && !codeDiv[0].includes('active'), 'screen-code는 active 초기값 아님');

// ── 3. 웰컴 화면 내용 ─────────────────────────────────────────────────────
console.log('\n[3] 웰컴 화면');
assert(html.includes('char-ello.png'),              '웰컴: 엘로 이미지 참조');
assert(html.includes('나는 엘로야'),                '웰컴: 엘로 말풍선 텍스트');
assert(html.includes("showScreen('screen-code')"),  '웰컴: screen-code로 이동 버튼');
assert(html.includes('char-speech'),               '웰컴: .char-speech 클래스 사용');
// 웰컴에 레벨명 없음
assert(!html.match(/screen-welcome[\s\S]{0,2000}(Seeker|Builder|Challenger|Explorer|Inventor)/),
       '웰컴: 레벨명(Seeker 등) 미노출');

// ── 4. 섹션 인트로 화면 ──────────────────────────────────────────────────
console.log('\n[4] 섹션 인트로 화면');
assert(html.includes('id="si-progress"'),   'si-progress 존재');
assert(html.includes('id="si-dots"'),       'si-dots 존재');
assert(html.includes('id="si-char-img"'),   'si-char-img 존재');
assert(html.includes('id="si-char-emoji"'), 'si-char-emoji 존재');
assert(html.includes('id="si-speech"'),     'si-speech 존재');
assert(html.includes('id="si-title"'),      'si-title 존재');
assert(html.includes('id="si-desc"'),       'si-desc 존재');
assert(html.includes('id="si-count"'),      'si-count 존재');
assert(html.includes('id="si-tips"'),       'si-tips 존재');
assert(html.includes("onclick=\"startSection()\""), '시작하기 버튼: startSection() 호출');

// ── 5. 스피킹 준비 화면 엘로 ─────────────────────────────────────────────
console.log('\n[5] 스피킹 준비 화면 (엘로)');
// screen-spk-prep 블록 안에 char-ello.png가 있어야 함
const spkPrepBlock = html.match(/id="screen-spk-prep"[\s\S]*?id="screen-speaking"/);
assert(spkPrepBlock && spkPrepBlock[0].includes('char-ello.png'),
       'screen-spk-prep: 엘로 이미지');
assert(spkPrepBlock && spkPrepBlock[0].includes('잘 하셨어요'),
       'screen-spk-prep: 엘로 말풍선 텍스트');
assert(spkPrepBlock && spkPrepBlock[0].includes('char-speech'),
       'screen-spk-prep: .char-speech 클래스');

// ── 6. 결과 화면 엘로 ─────────────────────────────────────────────────────
console.log('\n[6] 결과 화면 (엘로)');
const resIdx   = html.indexOf('id="screen-result"');
const resBlock = resIdx >= 0 ? html.slice(resIdx, resIdx + 800) : '';
assert(resBlock.includes('char-ello.png'),      'screen-result: 엘로 이미지');
assert(resBlock.includes('result-char-speech'), 'screen-result: .result-char-speech 클래스');
assert(resBlock.includes('수고하셨어요'),        'screen-result: 격려 메시지');
// 결과 화면 HTML에 레벨별 캐릭터 없어야 함 (JS의 SECTION_CHARS 정의는 허용)
const scriptIdx  = html.indexOf('<script');
const resultHtml = resIdx >= 0 && scriptIdx > resIdx
  ? html.slice(resIdx, scriptIdx) : resBlock;
assert(!resultHtml.match(/char-(toki|kapi|pixi|poco|nova)\.png/),
       'screen-result HTML: 레벨별 캐릭터 없음 (엘로만)');

// ── 7. JS: SECTION_CHARS ──────────────────────────────────────────────────
console.log('\n[7] JS: SECTION_CHARS');
assert(html.includes('const SECTION_CHARS'),        'SECTION_CHARS 상수 존재');
assert(html.includes("phonics:"),                   'SECTION_CHARS.phonics 존재');
assert(html.includes("vocabulary:"),                'SECTION_CHARS.vocabulary 존재');
assert(html.includes("grammar:"),                   'SECTION_CHARS.grammar 존재');
assert(html.includes("reading:"),                   'SECTION_CHARS.reading 존재');
assert(html.includes("writing:"),                   'SECTION_CHARS.writing 존재');
assert(html.includes("char-toki.png"),              'SECTION_CHARS: toki=phonics');
assert(html.includes("char-kapi.png"),              'SECTION_CHARS: kapi=vocabulary');
assert(html.includes("char-pixi.png"),              'SECTION_CHARS: pixi=grammar');
assert(html.includes("char-poco.png"),              'SECTION_CHARS: poco=reading');
assert(html.includes("char-nova.png"),              'SECTION_CHARS: nova=writing');

// 말풍선 문구 검증
assert(html.includes('수다쟁이 토키야'),             'phonics 말풍선: 토키');
assert(html.includes('든든한 카피야'),               'vocabulary 말풍선: 카피');
assert(html.includes('말장난의 달인 픽시야'),         'grammar 말풍선: 픽시');
assert(html.includes('도전을 즐기는 포코야'),         'reading 말풍선: 포코');
assert(html.includes('듬직한 맏형 노바야'),           'writing 말풍선: 노바');

// ── 8. JS: 상태 변수 및 함수 ──────────────────────────────────────────────
console.log('\n[8] JS: 상태 변수 및 함수');
assert(html.includes('_shownIntros'),               '_shownIntros 변수 존재');
assert(html.includes('_sectionOrder'),              '_sectionOrder 변수 존재');
assert(html.includes('function showSectionIntro'),  'showSectionIntro 함수 존재');
assert(html.includes('function startSection'),      'startSection 함수 존재');
assert(html.includes('_shownIntros.has(sec)'),      '섹션 인트로 중복 방지 체크');
assert(html.includes('_shownIntros.add(sec)'),      '섹션 인트로 표시 후 기록');
assert(html.includes('_sectionOrder.push'),         '_sectionOrder 구축 로직');

// ── 9. 섹션→캐릭터 매핑 로직 (composeTest 연동) ────────────────────────
console.log('\n[9] 섹션 기반 동적 처리');
assert(html.includes('q.section'),                 '문항의 section 필드 사용');
assert(html.includes('SECTION_CHARS[sec]'),         'SECTION_CHARS[sec] 동적 조회');
// 하드코딩 섹션 배열이 없어야 함
assert(!html.match(/\[['"]phonics['"],\s*['"]vocabulary['"]/),
       '섹션 배열 하드코딩 없음 (동적 처리)');

// ── 10. URL 코드 자동 처리 ────────────────────────────────────────────────
console.log('\n[10] URL 코드 자동 처리');
assert(html.includes("showScreen('screen-code')") &&
       html.includes('urlCode'),
       'URL 코드 있을 때 screen-code로 직행');

// ── 11. onerror 폴백 처리 ─────────────────────────────────────────────────
console.log('\n[11] 이미지 onerror 폴백');
const onerrorCount = (html.match(/onerror=/g) || []).length;
assert(onerrorCount >= 4, 'onerror 폴백 4곳 이상 (' + onerrorCount + '개)');

// ── 12. composeTest 섹션 구성 검증 ───────────────────────────────────────
console.log('\n[12] composeTest 섹션 구성 (단계별)');
const TC = require('../public/test-composer');
function getSections(stage) {
  const result = TC.composeTest(stage);
  const qs = Array.isArray(result) ? result : (result && result.questions) || [];
  const seen = new Set(), order = [];
  for (const q of qs) {
    if (q.section && !seen.has(q.section)) { seen.add(q.section); order.push(q.section); }
  }
  return order;
}
const s1 = getSections(1);
assert(s1.length === 1 && s1[0] === 'phonics',
       'Stage 1(Seeker): 섹션=phonics 1개만 → 토키만 등장');
assert(!s1.includes('vocabulary') && !s1.includes('grammar') &&
       !s1.includes('reading')    && !s1.includes('writing'),
       'Stage 1: 다른 섹션 없음');

for (let stage = 2; stage <= 5; stage++) {
  const secs = getSections(stage);
  assert(secs.includes('vocabulary'), 'Stage ' + stage + ': vocabulary 포함 → 카피 등장');
  assert(secs.includes('grammar'),    'Stage ' + stage + ': grammar 포함 → 픽시 등장');
  assert(secs.includes('reading'),    'Stage ' + stage + ': reading 포함 → 포코 등장');
  assert(secs.includes('writing'),    'Stage ' + stage + ': writing 포함 → 노바 등장');
  assert(!secs.includes('phonics'),   'Stage ' + stage + ': phonics 없음 → 토키 미등장');
}

// ── 결과 ──────────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────');
console.log('PASS: ' + pass + '  FAIL: ' + fail);
if (fail > 0) { console.error('검증 실패. 위 FAIL 항목을 수정하세요.'); process.exit(1); }
else          { console.log('모든 검증 통과!'); }
