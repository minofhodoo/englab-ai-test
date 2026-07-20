/**
 * stage-guide.js — 단계별 학습 수준 안내 문구 (전 화면 공용 상수)
 * UMD: Node.js require() / 브라우저 window.StageGuide 양쪽 사용 가능.
 * 문구 변경 시 이 파일 한 곳만 수정할 것.
 */
'use strict';
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) { module.exports = factory(); }
  else { root.StageGuide = factory(); }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  // 1=Seeker 2=Builder 3=Challenger 4=Explorer 5=Inventor 6=Innovator
  var STAGE_GUIDE_MAP = {
    1: '알파벳과 파닉스를 배우고 있어요.',
    2: '쉬운 단어와 짧은 문장을 읽을 수 있어요.',
    3: '기본 문장을 이해하고 영어로 쓸 수 있어요.',
    4: '영어 지문을 읽고 내용을 이해할 수 있어요.',
    5: '영어로 자신의 생각을 말하고 글로 표현할 수 있어요.',
    6: '영어로 자신의 생각을 말하고 글로 표현할 수 있어요.',
  };

  return { STAGE_GUIDE_MAP: STAGE_GUIDE_MAP };
}));
