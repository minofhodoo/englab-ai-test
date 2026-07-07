/**
 * answer-utils.js — 공용 답안 정규화 + 판정
 * UMD: Node.js(require) / 브라우저(window.AnswerUtils) 양쪽 사용 가능.
 */
'use strict';

/** 정규화: 양끝 공백 제거 → 다중 공백 1칸 → 소문자 → 후행 구두점 제거 */
function normalizeAnswer(s) {
  return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase().replace(/[.?!]+$/, '');
}

/**
 * unscramble 정오 판정.
 * submitted 문자열을 정규화 후 expected 배열의 어느 하나와 일치하면 정답.
 * @param {string}   submitted
 * @param {string[]} expectedArr
 */
function judgeUnscramble(submitted, expectedArr) {
  const n = normalizeAnswer;
  return Array.isArray(expectedArr)
    ? expectedArr.some(e => n(e) === n(submitted))
    : n(String(expectedArr || '')) === n(submitted);
}

/** D&D 대상 여부: questionType === 'unscramble' 인 문항만 */
function isUnscrambleType(q) {
  return !!(q && q.questionType === 'unscramble');
}

/**
 * expected[0] 의 마지막 문장 종결 부호(.?!) 추출.
 * words 배열에는 없으므로 답안 영역 끝에 고정 표시용.
 */
function extractTrailingPunct(expectedArr) {
  const exp = (Array.isArray(expectedArr) ? expectedArr[0] : expectedArr) || '';
  return /[.?!]$/.test(exp) ? exp[exp.length - 1] : '';
}

// UMD export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizeAnswer, judgeUnscramble, isUnscrambleType, extractTrailingPunct };
} else if (typeof window !== 'undefined') {
  window.AnswerUtils = { normalizeAnswer, judgeUnscramble, isUnscrambleType, extractTrailingPunct };
}
