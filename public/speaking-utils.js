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
 * 반환: { responseRate: number(0~100)|null, sttText: string|null }
 * → assessment.speaking 으로 대입. 레벨 산출 로직에는 절대 사용하지 않음.
 */
function buildSpeakingReport(speakingQuestions, speakingAnswers) {
  const total = (speakingQuestions || []).length;
  if (total === 0) return { responseRate: null, sttText: null };

  const answered = speakingAnswers || {};
  const entries = Object.values(answered);
  const voiceCount  = entries.filter(a => a && a.method === 'voice').length;
  const typingCount = entries.filter(a => a && a.method === 'typing').length;
  const responseRate = Math.round((voiceCount  / total) * 100);
  const typingRate   = Math.round((typingCount / total) * 100);

  const sttLines = (speakingQuestions || []).map((q, i) => {
    const ans = answered[q.id];
    if (!ans || !ans.text) return `Q${i + 1}. (무응답)`;
    const tag = ans.method === 'voice' ? '[음성]' : '[타이핑]';
    return `Q${i + 1}. ${tag} ${ans.text}`;
  });

  return {
    responseRate,
    typingRate,
    sttText: sttLines.join('\n'),
  };
}

// UMD export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizeSpk, hasContent, semanticMatch, calcResponseRate, buildSpeakingReport };
} else if (typeof window !== 'undefined') {
  window.SpeakingUtils = { normalizeSpk, hasContent, semanticMatch, calcResponseRate, buildSpeakingReport };
}
