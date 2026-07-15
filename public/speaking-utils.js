/**
 * speaking-utils.js — 스피킹 의미 일치 판정 + 응답률 집계
 * UMD: Node.js(require) / 브라우저(window.SpeakingUtils) 양쪽 사용 가능.
 */
'use strict';

/** 스피킹 전용 정규화: 영문자·숫자·아포스트로피·공백만 남김, 소문자 */
function normalizeSpk(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9' ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 최소 의미 콘텐츠 여부: 2자 이상 + 2어절 이상 */
function hasContent(s) {
  const n = normalizeSpk(s);
  return n.length >= 2 && n.split(' ').filter(Boolean).length >= 2;
}

/** 예상 키워드 중 하나라도 포함 여부 */
function hasKeyword(s, keywords) {
  const n = normalizeSpk(s);
  return (keywords || []).some(kw => {
    const nkw = normalizeSpk(kw);
    return nkw.length > 0 && n.includes(nkw);
  });
}

/**
 * 의미 일치 판정 (관대한 매칭).
 *   - 콘텐츠 없음(짧은 소음) → false
 *   - anyResponseValid === true  → 콘텐츠만 있으면 true (이름 등 개인 답변)
 *   - anyResponseValid === false → expectedKeywords 중 하나 이상 포함 시 true
 *
 * 스피킹은 레벨 결정과 무관하므로 의도적으로 허용 범위를 넓게 설정.
 */
function semanticMatch(submitted, question) {
  if (!hasContent(submitted)) return false;
  if (question && question.anyResponseValid) return true;
  return hasKeyword(submitted, question && question.expectedKeywords);
}

/**
 * 음성 응답률 계산 (0~100 정수 퍼센트).
 * speakingAnswers: { [qid]: { text, method:'voice'|'typing' } }
 * total: 전체 스피킹 문항 수 (스킵 포함 계산)
 */
function calcResponseRate(speakingAnswers, total) {
  const entries = Object.values(speakingAnswers || {});
  const denom = total != null ? total : entries.length;
  if (denom === 0) return null;
  const voiceCount = entries.filter(a => a && a.method === 'voice').length;
  return Math.round((voiceCount / denom) * 100);
}

/**
 * 스피킹 리포트 빌드.
 * 반환: { responseRate, typingRate, matchRate, sttText }
 * → assessment.speaking 으로 대입. 레벨 산출 로직에는 절대 사용하지 않음.
 */
function buildSpeakingReport(speakingQuestions, speakingAnswers) {
  const total = (speakingQuestions || []).length;
  if (total === 0) return { responseRate: null, typingRate: null, matchRate: null, sttText: null };

  const answered = speakingAnswers || {};
  const entries = Object.values(answered);
  const voiceCount  = entries.filter(a => a && a.method === 'voice').length;
  const typingCount = entries.filter(a => a && a.method === 'typing').length;
  const responseRate = Math.round((voiceCount  / total) * 100);
  const typingRate   = Math.round((typingCount / total) * 100);

  // 의미매칭 정답률 (display용 보조지표, 레벨 미반영)
  const matchCount = (speakingQuestions || []).filter(function(q) {
    var ans = answered[q.id];
    return ans ? semanticMatch(ans.text, q) : false;
  }).length;
  const matchRate = Math.round((matchCount / total) * 100);

  const sttLines = (speakingQuestions || []).map((q, i) => {
    const ans = answered[q.id];
    if (!ans || !ans.text) return `Q${i + 1}. (무응답)`;
    const tag = ans.method === 'voice' ? '[음성]' : '[타이핑]';
    return `Q${i + 1}. ${tag} ${ans.text}`;
  });

  return {
    responseRate,
    typingRate,
    matchRate,
    sttText: sttLines.join('\n'),
  };
}

/**
 * AI Speaking 피드백 — 템플릿 기반 (외부 AI 미호출)
 * 발음·유창성: 음성 응답률(responseRate) 기반
 * 문법·표현:  의미매칭률(matchRate) 기반
 * @param {{ responseRate: number|null, matchRate?: number|null }} speaking
 * @returns {{ pronunciation:string, grammar:string, expression:string, fluency:string }|null}
 */
function buildSpeakingFeedback(speaking) {
  if (!speaking || speaking.responseRate == null) return null;
  var rate  = speaking.responseRate;
  var match = speaking.matchRate != null ? speaking.matchRate : 0;

  var pronunciation = rate >= 70
    ? '음성 응답 비율이 높아 발음 훈련이 충분히 이루어졌습니다. 정확한 발음 습관이 형성되고 있는 것으로 확인됩니다.'
    : rate >= 40
    ? '일부 구간에서 음성 발화가 확인됩니다. 더 많은 발화 연습을 통해 발음의 일관성을 높이는 것이 좋습니다.'
    : '음성 발화 기회가 적었습니다. 큰 소리로 읽고 말하는 연습을 늘리면 발음 향상에 도움이 됩니다.';

  var fluency = rate >= 70
    ? '꾸준한 음성 발화 습관이 확인됩니다. 자연스러운 말하기 흐름을 유지하면서 속도와 리듬을 다듬어 나가면 유창성이 더욱 향상됩니다.'
    : rate >= 40
    ? '부분적인 음성 발화는 확인되나, 전체적인 유창성 향상을 위해 음성 응답 비율을 높이는 것이 중요합니다.'
    : '음성으로 답하는 연습이 유창성 향상의 핵심입니다. 짧은 문장부터 소리 내어 말하는 습관을 만들어 보세요.';

  var grammar = match >= 70
    ? '발화 내용이 문법적으로 적절하게 구성되었습니다. 기본 문장 구조를 활용하여 의미를 전달하는 능력이 확인됩니다.'
    : match >= 40
    ? '의미 전달은 부분적으로 이루어지고 있으나, 문법적으로 더 정확한 구조로 발화하는 연습이 필요합니다.'
    : '문법 구조를 갖춘 발화 연습이 필요합니다. 핵심 문형을 반복하며 자연스럽게 익히는 훈련을 권장합니다.';

  var expression = match >= 70
    ? '핵심 어휘와 표현을 활용하여 의사를 전달하는 능력이 확인됩니다. 다양한 표현을 시도하는 방향으로 발전을 이어 나가세요.'
    : match >= 40
    ? '일부 핵심 표현의 사용이 확인됩니다. 다양한 어휘와 표현을 학습하여 전달력을 더욱 높이는 것이 중요합니다.'
    : '핵심 어휘와 표현 습득이 우선 필요합니다. 자주 사용되는 기본 표현부터 반복 연습을 권장합니다.';

  return { pronunciation: pronunciation, grammar: grammar, expression: expression, fluency: fluency };
}

// UMD export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizeSpk, hasContent, semanticMatch, calcResponseRate, buildSpeakingReport, buildSpeakingFeedback };
} else if (typeof window !== 'undefined') {
  window.SpeakingUtils = { normalizeSpk, hasContent, semanticMatch, calcResponseRate, buildSpeakingReport, buildSpeakingFeedback };
}
