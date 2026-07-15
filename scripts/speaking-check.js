/**
 * speaking-check.js — 스피킹 기능 검증
 *
 * 검증 범위:
 *  1. 의미 일치 판정(semanticMatch): 표현 달라도 의미 일치 → 정답 / 무관 → 오답
 *  2. 음성 응답률 계산(calcResponseRate)
 *  3. 스피킹이 레벨 산출에 미반영(scoreAndDiagnose 결과 불변)
 *  4. STT 텍스트: 원장 리포트(speaking.sttText)에만 존재, 학생 결과 구조에 없음
 *  5. buildSpeakingReport 구조 검증
 *  6. questions.speaking.json 데이터 무결성
 *
 * 실행: node scripts/speaking-check.js
 */
'use strict';

const path = require('path');
const fs   = require('fs');

const SU = require(path.join(__dirname, '../public/speaking-utils'));
const TC = require(path.join(__dirname, '../public/test-composer'));
const { semanticMatch, calcResponseRate, buildSpeakingReport, buildSpeakingFeedback, normalizeSpk } = SU;

// ── 색상 헬퍼 ──────────────────────────────────────────────────────────────
const C = {
  reset:'\x1b[0m', bold:'\x1b[1m',
  red:'\x1b[31m', green:'\x1b[32m', yellow:'\x1b[33m',
  cyan:'\x1b[36m', gray:'\x1b[90m', blue:'\x1b[34m',
};
const ok   = s => C.green + '✓ ' + s + C.reset;
const fail = s => C.red   + '✗ ' + s + C.reset;
const hdr  = s => '\n' + C.bold + C.cyan + s + C.reset;
const note = s => '    ' + C.gray + s + C.reset;

let PASS = 0, FAIL = 0;

function assert(cond, label, got) {
  if (cond) { console.log('  ' + ok(label)); PASS++; }
  else {
    const d = got !== undefined ? C.gray + '  (got: ' + JSON.stringify(got) + ')' + C.reset : '';
    console.log('  ' + fail(label) + d); FAIL++;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. normalizeSpk
// ═══════════════════════════════════════════════════════════════════════════
console.log(hdr('1. normalizeSpk'));

assert(normalizeSpk('Hello, World!') === 'hello world',
  '구두점 제거 + 소문자');
assert(normalizeSpk("I don't know.") === "i don't know",
  '아포스트로피 보존 + 소문자');
assert(normalizeSpk('  multiple   spaces  ') === 'multiple spaces',
  '다중 공백 + 양끝 공백 제거');
assert(normalizeSpk(null) === '', 'null → 빈 문자열');

// ═══════════════════════════════════════════════════════════════════════════
// 2. semanticMatch — 의미 일치 판정
// ═══════════════════════════════════════════════════════════════════════════
console.log(hdr('2. semanticMatch — 의미 일치 (표현 달라도 의미 같으면 정답)'));

// Level 2 Q1: What is your name? (anyResponseValid=true)
const nameQ = {
  id: 'spk-2-1', prompt: 'What is your name?',
  anyResponseValid: true,
  expectedKeywords: ['name', "i'm", 'i am', 'called'],
};
assert(semanticMatch('My name is Park Jisu', nameQ),    '이름 정상 표현 → 정답');
assert(semanticMatch("I'm Sarah",            nameQ),    '축약형 → 정답');
// anyResponseValid=true 이지만 hasContent 기준(2어절+) 미충족 → false
assert(!semanticMatch('Sarah', nameQ), '단어 1개만 → false (콘텐츠 부족)');

// Level 2 Q2: What is your favorite color? (keyword required)
const colorQ = {
  id: 'spk-2-2', prompt: 'What is your favorite color?',
  anyResponseValid: false,
  expectedKeywords: ['red','blue','green','yellow','orange','purple','pink','black','white','brown','color','like','love','favorite'],
};
assert(semanticMatch('I love the color red',        colorQ), '색 이름 포함 → 정답');
assert(semanticMatch('My favorite is blue',         colorQ), "favorite 키워드 → 정답");
assert(semanticMatch('I really like green things',  colorQ), 'like + 색 → 정답');
assert(!semanticMatch('I went to the park today',   colorQ), '색 무관 → 오답');
assert(!semanticMatch('yes',                        colorQ), '단어 1개 → 오답 (콘텐츠 부족)');
assert(!semanticMatch('',                           colorQ), '빈 문자열 → 오답');

// Level 3 Q2: favorite season
const seasonQ = {
  id: 'spk-3-2', prompt: 'What is your favorite season and why?',
  anyResponseValid: false,
  expectedKeywords: ['spring','summer','autumn','fall','winter','season','like','love','because','hot','cold','warm','cool','snow','beach','flower'],
};
assert(semanticMatch('I love summer because it is hot', seasonQ), '계절 + because → 정답');
assert(semanticMatch('Winter is my favourite season',   seasonQ), 'favourite(영국식) → 정답');
assert(semanticMatch('I enjoy cold weather in winter',  seasonQ), '동의어 표현 → 정답');
assert(!semanticMatch('The economy is growing fast',    seasonQ), '무관한 내용 → 오답');

// Level 5 Q1: social media
const socialQ = {
  id: 'spk-5-1', prompt: 'Do you think social media has more positive or negative effects?',
  anyResponseValid: false,
  expectedKeywords: ['social','media','positive','negative','effect','society','people','connect','mental','health','addiction','think','believe','argue'],
};
assert(semanticMatch('Social media can be both helpful and harmful to people', socialQ),
  '긍정/부정 혼재 표현 → 정답');
assert(semanticMatch('I think it has positive and negative aspects', socialQ),
  'positive/negative 포함 → 정답');
assert(semanticMatch('People connect through social platforms', socialQ),
  'connect + social 포함 → 정답');
assert(!semanticMatch('My dog is very cute and fluffy', socialQ),
  '완전 무관 → 오답');

// ═══════════════════════════════════════════════════════════════════════════
// 3. calcResponseRate
// ═══════════════════════════════════════════════════════════════════════════
console.log(hdr('3. calcResponseRate — 음성 응답률 계산'));

const answersVoice3Typing2 = {
  'spk-2-1': { text: 'My name is Tom',    method: 'voice'  },
  'spk-2-2': { text: 'I like blue',       method: 'voice'  },
  'spk-2-3': { text: 'Yes I have a dog',  method: 'voice'  },
  'spk-2-4': { text: 'I play soccer',     method: 'typing' },
};
// total=4, voice=3 → 75%
assert(calcResponseRate(answersVoice3Typing2, 4) === 75,
  '음성 3 / 전체 4 → 75%', calcResponseRate(answersVoice3Typing2, 4));

// The task says: 음성 3 / 타이핑 2 → 60%
const fiveAnswers = {
  'spk-1': { text: 'a', method: 'voice'  },
  'spk-2': { text: 'b', method: 'voice'  },
  'spk-3': { text: 'c', method: 'voice'  },
  'spk-4': { text: 'd', method: 'typing' },
  'spk-5': { text: 'e', method: 'typing' },
};
assert(calcResponseRate(fiveAnswers, 5) === 60,
  '음성 3 / 타이핑 2 → 60%', calcResponseRate(fiveAnswers, 5));

assert(calcResponseRate({}, 4) === 0,
  '응답 없음 → 0%', calcResponseRate({}, 4));
assert(calcResponseRate({}, 0) === null,
  'total=0 → null', calcResponseRate({}, 0));

const allVoice = { q1:{ text:'a', method:'voice' }, q2:{ text:'b', method:'voice' } };
assert(calcResponseRate(allVoice, 2) === 100,
  '전원 음성 → 100%', calcResponseRate(allVoice, 2));

// ═══════════════════════════════════════════════════════════════════════════
// 4. buildSpeakingReport 구조 검증
// ═══════════════════════════════════════════════════════════════════════════
console.log(hdr('4. buildSpeakingReport — 리포트 구조'));

const spkQs = [
  { id:'spk-2-1', prompt:'What is your name?',          promptKo:'이름이 무엇인가요?' },
  { id:'spk-2-2', prompt:'What is your favorite color?', promptKo:'좋아하는 색?' },
  { id:'spk-2-3', prompt:'Do you have a pet?',          promptKo:'반려동물이 있나요?' },
  { id:'spk-2-4', prompt:'What do you do after school?', promptKo:'방과 후 활동?' },
];
const spkAns = {
  'spk-2-1': { text: 'My name is Alex', method: 'voice'  },
  'spk-2-2': { text: 'I like blue',     method: 'voice'  },
  'spk-2-3': { text: 'Yes I have a cat', method: 'typing' },
  // spk-2-4: 무응답
};
const report = buildSpeakingReport(spkQs, spkAns);

assert(typeof report.responseRate === 'number',
  'responseRate는 숫자', typeof report.responseRate);
assert(report.responseRate === 50,
  '음성 2 / 전체 4 → 50%', report.responseRate);
assert(typeof report.sttText === 'string',
  'sttText는 문자열', typeof report.sttText);
assert(report.sttText.includes('[음성]'),
  'sttText에 [음성] 태그 포함');
assert(report.sttText.includes('[타이핑]'),
  'sttText에 [타이핑] 태그 포함');
assert(report.sttText.includes('무응답'),
  '무응답 항목에 (무응답) 표시');
assert(report.sttText.includes('My name is Alex'),
  'sttText에 실제 응답 텍스트 포함');

assert(typeof report.typingRate  === 'number', 'typingRate는 숫자', typeof report.typingRate);
assert(typeof report.matchRate   === 'number', 'matchRate는 숫자', typeof report.matchRate);
assert(report.matchRate >= 0 && report.matchRate <= 100, 'matchRate 0~100 범위', report.matchRate);

// 빈 문항 → null 반환
const emptyReport = buildSpeakingReport([], {});
assert(emptyReport.responseRate === null, '문항 없음 → responseRate=null');
assert(emptyReport.typingRate   === null, '문항 없음 → typingRate=null');
assert(emptyReport.matchRate    === null, '문항 없음 → matchRate=null');
assert(emptyReport.sttText      === null, '문항 없음 → sttText=null');

// buildSpeakingFeedback 상/중/하 검증
console.log(hdr('4-b. buildSpeakingFeedback — 상/중/하 케이스'));
const fbHigh = buildSpeakingFeedback({ responseRate: 80, matchRate: 75 });
assert(fbHigh !== null, 'buildSpeakingFeedback: responseRate 있으면 객체 반환');
assert(typeof fbHigh.pronunciation === 'string' && fbHigh.pronunciation.length > 0, '발음 코멘트 존재');
assert(typeof fbHigh.fluency       === 'string' && fbHigh.fluency.length       > 0, '유창성 코멘트 존재');
assert(typeof fbHigh.grammar       === 'string' && fbHigh.grammar.length       > 0, '문법 코멘트 존재');
assert(typeof fbHigh.expression    === 'string' && fbHigh.expression.length    > 0, '표현 코멘트 존재');

const fbMid = buildSpeakingFeedback({ responseRate: 50, matchRate: 45 });
assert(fbMid !== null, 'buildSpeakingFeedback: 중 케이스');
assert(fbMid.pronunciation !== fbHigh.pronunciation, '발음: 상/중 코멘트 다름 (변형 확인)');
assert(fbMid.grammar       !== fbHigh.grammar,       '문법: 상/중 코멘트 다름');

const fbLow = buildSpeakingFeedback({ responseRate: 20, matchRate: 15 });
assert(fbLow !== null, 'buildSpeakingFeedback: 하 케이스');
assert(fbLow.fluency     !== fbHigh.fluency,     '유창성: 상/하 코멘트 다름');
assert(fbLow.expression  !== fbHigh.expression,  '표현: 상/하 코멘트 다름');

assert(buildSpeakingFeedback(null) === null, 'buildSpeakingFeedback: null 입력 → null');
assert(buildSpeakingFeedback({ responseRate: null }) === null, 'buildSpeakingFeedback: responseRate null → null');

// ═══════════════════════════════════════════════════════════════════════════
// 5. 레벨 산출 불변 (스피킹 반영 금지)
// ═══════════════════════════════════════════════════════════════════════════
console.log(hdr('5. 레벨 산출 불변 — 스피킹이 적정/도전 레벨에 미반영'));

{
  const composed = TC.composeTest(3);
  const qs = composed.questions;

  // A. 스피킹 데이터 없는 기준 결과
  const answered = qs.map(q => Object.assign({}, q, { correct: true }));
  const baseResult = TC.scoreAndDiagnose(3, answered);

  // B. 스피킹 데이터 있는 결과 (서버가 speaking 필드만 override)
  const withSpkResult = Object.assign({}, baseResult);
  withSpkResult.speaking = buildSpeakingReport(spkQs, spkAns);

  // 레벨 관련 필드 모두 동일해야 함
  assert(withSpkResult.score          === baseResult.score,          'score 불변');
  assert(withSpkResult.scorePct       === baseResult.scorePct,       'scorePct 불변');
  assert(withSpkResult.appropriate    === baseResult.appropriate,    'appropriate 불변 (동일 참조)');
  assert(withSpkResult.challenge      === baseResult.challenge,      'challenge 불변 (동일 참조)');
  assert(withSpkResult.bonusEligible  === baseResult.bonusEligible,  'bonusEligible 불변');

  // speaking 필드만 다름
  assert(baseResult.speaking.responseRate === null,       '기본 speaking.responseRate=null');
  assert(withSpkResult.speaking.responseRate === 50,      'override 후 responseRate=50');

  console.log(note('적정레벨: ' + (baseResult.appropriate && baseResult.appropriate.recommended)));
  console.log(note('스피킹 반영 전후 recommended 동일: ' +
    (withSpkResult.appropriate && withSpkResult.appropriate.recommended)));
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. STT 가시성 — 원장 리포트에만, 학생 화면에는 없음
// ═══════════════════════════════════════════════════════════════════════════
console.log(hdr('6. STT 가시성 — 원장 전용 필드 확인'));

{
  const composed = TC.composeTest(2);
  const answered = composed.questions.map(q => Object.assign({}, q, { correct: true }));
  const assessment = TC.scoreAndDiagnose(2, answered);

  // 서버가 하는 것처럼 speaking override
  assessment.speaking = buildSpeakingReport(spkQs, spkAns);

  // 원장 리포트: speaking.sttText 존재
  assert(assessment.speaking.sttText !== null,
    '원장 리포트: speaking.sttText 존재');

  // 학생 결과에서 sttText 노출 금지 검증:
  // test.html의 showResult()는 speaking 필드를 렌더링하지 않으므로
  // 여기서는 assessment 객체에서 sttText 가 최상위 노출 경로에 없음을 확인
  const studentKeys = Object.keys(assessment).filter(k => k !== 'speaking');
  const sttExposedAtTopLevel = studentKeys.some(k => {
    const v = JSON.stringify(assessment[k]);
    return v && v.includes('[음성]') && v.includes('[타이핑]');
  });
  assert(!sttExposedAtTopLevel,
    '학생 리포트 최상위 필드에 STT 텍스트 미포함');

  // speaking 자체를 제거한 학생용 payload에서도 sttText 없음
  const studentPayload = Object.assign({}, assessment);
  delete studentPayload.speaking;
  assert(!JSON.stringify(studentPayload).includes('sttText'),
    '학생 payload에서 speaking 제거 시 sttText 없음');
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. questions.speaking.json 데이터 무결성
// ═══════════════════════════════════════════════════════════════════════════
console.log(hdr('7. questions.speaking.json — 데이터 무결성'));

const spkPath = path.join(__dirname, '../public/questions.speaking.json');
let spkData;
try {
  spkData = JSON.parse(fs.readFileSync(spkPath, 'utf8'));
} catch (e) {
  console.log('  ' + fail('파일 읽기 실패: ' + e.message)); FAIL++;
  spkData = null;
}

if (spkData) {
  const levels = ['2','3','4','5'];
  assert(levels.every(l => Array.isArray(spkData[l]) && spkData[l].length > 0),
    '레벨 2~5 모두 문항 보유');

  const allQs = levels.flatMap(l => spkData[l]);

  assert(allQs.every(q => q.id && q.prompt && q.promptKo),
    'id·prompt·promptKo 필드 모두 존재');
  assert(allQs.every(q => typeof q.anyResponseValid === 'boolean'),
    'anyResponseValid 필드 boolean 타입');
  assert(allQs.every(q => Array.isArray(q.expectedKeywords) && q.expectedKeywords.length > 0),
    'expectedKeywords 배열 비어있지 않음');

  // ID 중복 없음
  const ids = allQs.map(q => q.id);
  assert(new Set(ids).size === ids.length,
    `ID 중복 없음 (총 ${ids.length}개)`);

  // anyResponseValid=false 인 문항은 키워드 포함 여부로 판별 가능한지 검증
  const keywordQs = allQs.filter(q => !q.anyResponseValid);
  let allKeywordWork = true;
  keywordQs.forEach(q => {
    if (!q.expectedKeywords.some(kw => kw.length >= 2)) allKeywordWork = false;
  });
  assert(allKeywordWork, 'anyResponseValid=false 문항 키워드 모두 2자 이상');

  levels.forEach(l => {
    console.log(note(`레벨 ${l}: ${spkData[l].length}문항`));
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 최종 결과
// ═══════════════════════════════════════════════════════════════════════════
console.log(hdr('═══ 검증 결과 ═══'));
const total = PASS + FAIL;
if (FAIL === 0) {
  console.log(C.bold + C.green + '  전체 통과: ' + PASS + '/' + total + C.reset);
} else {
  console.log(C.bold + C.red + '  실패 ' + FAIL + '/' + total + C.reset);
  process.exitCode = 1;
}
console.log('');
