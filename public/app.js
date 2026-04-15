/* ══════════════════════════════════════════════
   SDA삼육잉글랩 AI Placement Test — Frontend
   v2: 설문 + 그림문항 + 브랜드 업데이트
══════════════════════════════════════════════ */
'use strict';

// ── CAT Engine ────────────────────────────────
class CATEngine {
  constructor(questions, startTheta = 5.0) {
    this.all     = questions;
    this.used    = new Set();
    this.theta   = startTheta;
    this.history = [];

    // 4섹션 순차 진행: 각 섹션별 문항 수 고정
    this.SECTIONS = [
      { key: 'vocabulary', label: 'Vocabulary & Expressions', icon: '📖', count: 10, weight: 0.35 },
      { key: 'grammar',    label: 'Grammar & Structure',      icon: '✏️',  count: 10, weight: 0.35 },
      { key: 'reading',    label: 'Reading Comprehension',    icon: '📚',  count: 5,  weight: 0.20 },
      { key: 'writing',    label: 'Writing',                  icon: '🖊️', count: 5,  weight: 0.10 },
    ];
    this.sectionIdx   = 0;
    this.sectionDone  = 0;
    this.TARGET = this.SECTIONS.reduce((s, x) => s + x.count, 0); // 30

    // 섹션별 독립 theta (writing 오답이 vocab/grammar theta를 끌어내리지 않도록)
    this.sectionThetas = {};
    for (const s of this.SECTIONS) this.sectionThetas[s.key] = startTheta;
  }

  get currentSection() { return this.SECTIONS[this.sectionIdx] || null; }

  selectNext() {
    if (this.isDone()) return null;
    const sec = this.currentSection;
    if (!sec) return null;

    // Vocabulary 섹션 초급(sectionTheta ≤ 1.5) + 처음 4문항 → 그림-단어 우선
    const secTheta = this.sectionThetas[sec.key] ?? this.theta;
    if (sec.key === 'vocabulary' && secTheta <= 1.5 && this.sectionDone < 4) {
      const pics = this.all.filter(q => q.questionType === 'picture' && !this.used.has(q.id));
      if (pics.length > 0) return pics.sort(() => Math.random() - 0.5)[0];
    }

    // 현재 섹션 theta 기반 난이도 CAT 선택 (섹션별 독립 theta 사용)
    const target = Math.round(this.sectionThetas[sec.key] ?? this.theta);
    for (let delta = 0; delta <= 5; delta++) {
      for (const dir of [0, 1, -1]) {
        const d = target + dir * delta;
        if (d < 0 || d > 10) continue;
        const pool = this.all.filter(q =>
          q.section === sec.key && q.difficulty === d && !this.used.has(q.id)
        );
        if (pool.length > 0) {
          const picks = pool.sort(() => Math.random() - 0.5).slice(0, 3);
          return picks[Math.floor(Math.random() * picks.length)];
        }
      }
    }
    return null;
  }

  record(questionId, isCorrect) {
    const q = this.all.find(q => q.id === questionId);
    if (!q) return;
    this.used.add(questionId);
    this.history.push({
      id: questionId, difficulty: q.difficulty,
      type: q.type, section: q.section, correct: isCorrect,
    });

    // 섹션 진행 카운터
    this.sectionDone++;
    const sec = this.currentSection;
    if (sec && this.sectionDone >= sec.count) {
      this.sectionIdx++;
      this.sectionDone = 0;
    }

    // 섹션별 독립 theta 업데이트
    const secKey = q.section || 'vocabulary';
    const nSec = this.history.filter(h => h.section === secKey).length;
    const lrSec = Math.max(0.2, 0.6 - nSec * 0.04);
    const tSec  = isCorrect ? q.difficulty + 0.8 : q.difficulty - 0.8;
    this.sectionThetas[secKey] = Math.max(0, Math.min(10,
      (this.sectionThetas[secKey] ?? this.theta) + lrSec * (tSec - (this.sectionThetas[secKey] ?? this.theta))
    ));

    // 전체 theta = 섹션 가중 평균 (writing 10%로 제한 → 오답이 전체를 끌어내리지 않음)
    let weightedSum = 0, weightTotal = 0;
    for (const s of this.SECTIONS) {
      if (this.sectionThetas[s.key] !== undefined) {
        weightedSum  += this.sectionThetas[s.key] * s.weight;
        weightTotal  += s.weight;
      }
    }
    this.theta = weightTotal > 0
      ? Math.max(0, Math.min(10, weightedSum / weightTotal))
      : this.theta;
  }

  isDone() { return this.sectionIdx >= this.SECTIONS.length; }

  results() {
    const correct = this.history.filter(h => h.correct).length;
    const bySection = {};
    for (const s of this.SECTIONS) bySection[s.key] = { label: s.label, correct: 0, total: 0 };
    const byType = {};
    for (const h of this.history) {
      if (h.section && bySection[h.section]) {
        bySection[h.section].total++;
        if (h.correct) bySection[h.section].correct++;
      }
      if (!byType[h.type]) byType[h.type] = { correct: 0, total: 0 };
      byType[h.type].total++;
      if (h.correct) byType[h.type].correct++;
    }
    return { theta: this.theta, sectionThetas: { ...this.sectionThetas }, correctCount: correct, total: this.history.length, byType, bySection, history: this.history };
  }

  // 잉글랩 5-레벨: Seeker → Builder → Challenger → Explorer → Inventor
  thetaToLevel(theta) {
    const t = theta ?? this.theta;
    if (t < 1.0) return 'Seeker 1';
    if (t < 2.0) return 'Seeker 2';
    if (t < 3.0) return 'Builder 1';
    if (t < 4.0) return 'Builder 2';
    if (t < 5.0) return 'Challenger 1';
    if (t < 6.0) return 'Challenger 2';
    if (t < 7.0) return 'Explorer 1';
    if (t < 8.0) return 'Explorer 2';
    if (t < 9.0) return 'Inventor 1';
    return         'Inventor 2';
  }
}

// ── 캐릭터 설정 ────────────────────────────────
// PNG 파일을 public/ 에 저장하면 자동 표시됩니다
const CHARACTERS = {
  Seeker: {
    nameKo: '토키', animal: '앵무새', file: 'char-toki.png',
    badgeClass: 'orange',
    color: '#F08300',
    emoji: '🦜',
    cheer: '안녕! 나는 수다쟁이 토키야! 🦜\n영어 여행이 지금 막 시작됐어요. 같이 신나게 해봐요!',
    desc:  '시작이 반이에요! 매일 조금씩 쌓이면 금방 달라져요.',
  },
  Builder: {
    nameKo: '카피', animal: '카피바라', file: 'char-kapi.png',
    badgeClass: 'green',
    color: '#16A34A',
    emoji: '🦫',
    cheer: '안녕! 나는 친근한 카피야! 🦫\n기초를 착실하게 다지고 있어요. 잘 하고 있어요!',
    desc:  '기초가 탄탄해요! 카피처럼 든든히 실력을 쌓아가요.',
  },
  Challenger: {
    nameKo: '포코', animal: '강아지', file: 'char-poco.png',
    badgeClass: 'blue',
    color: '#1C9BEF',
    emoji: '🐶',
    cheer: '안녕! 도전을 즐기는 포코야! 🐶\n훌륭한 실력이에요! 계속 도전해봐요!',
    desc:  '도전 정신이 빛나요! 포코처럼 씩씩하게 나아가고 있어요.',
  },
  Explorer: {
    nameKo: '픽시', animal: '여우', file: 'char-pixi.png',
    badgeClass: 'purple',
    color: '#8B5CB8',
    emoji: '🦊',
    cheer: '나는 말장난의 달인 픽시야! 🦊\n영어 실력이 꽤 좋은걸요? 멋져요!',
    desc:  '유머까지 영어로! 픽시처럼 재치있게 영어를 즐겨요.',
  },
  Inventor: {
    nameKo: '노바', animal: '북극곰', file: 'char-nova.png',
    badgeClass: 'navy',
    color: '#1A2E5A',
    emoji: '🐻‍❄️',
    cheer: '듬직한 리더 노바야! ❄️\n최상위 레벨! 정말 대단해요!',
    desc:  '영어 실력 최고봉! 노바처럼 든든한 영어 리더예요.',
  },
};

const MC = {
  nameKo: '엘로', animal: 'AI 로봇', file: 'char-ello.png',
  emoji: '🤖',
};

// ── 섹션 인트로 설정 ──────────────────────────
const SECTION_INTROS = {
  vocabulary: {
    num: 1, icon: '📖', colorClass: 'section-vocabulary',
    title: '단어를 알아볼까요?',
    charFile: 'char-toki.png', charEmoji: '🦜', charName: '토키',
    speech: '안녕! 나는 수다쟁이 토키야! 🦜\n내가 영어 단어 퀴즈를 낼 거야.\n얼마나 많이 알고 있는지 같이 알아봐요!',
    desc: '그림과 문장을 보고 알맞은 영어 단어를 골라보세요.',
    tips: ['천천히 읽고 생각해요', '모르는 단어가 나와도 괜찮아요!'],
    count: 10,
  },
  grammar: {
    num: 2, icon: '✏️', colorClass: 'section-grammar',
    title: '문장 규칙을 알아봐요!',
    charFile: 'char-kapi.png', charEmoji: '🦫', charName: '카피',
    speech: '안녕! 든든한 카피야! 🦫\n영어 문장의 규칙을 같이 알아볼까요?\n잘 읽으면 답이 보일 거예요!',
    desc: '빈칸에 알맞은 단어를 골라 올바른 문장을 완성해보세요.',
    tips: ['문장 전체를 끝까지 읽어요', '소리 내어 읽으면 더 쉬워요!'],
    count: 10,
  },
  reading: {
    num: 3, icon: '📚', colorClass: 'section-reading',
    title: '짧은 글을 읽어봐요!',
    charFile: 'char-pixi.png', charEmoji: '🦊', charName: '픽시',
    speech: '안녕! 말장난의 달인 픽시야! 🦊\n짧은 영어 글을 읽고 질문에 답하는 거야.\n천천히 읽으면 답이 보여요!',
    desc: '짧은 영어 글을 읽고 질문에 맞는 답을 골라보세요.',
    tips: ['글을 먼저 읽고 질문을 봐요', '모르는 단어가 있어도 전체 내용으로 답할 수 있어요'],
    count: 5,
  },
  writing: {
    num: 4, icon: '🖊️', colorClass: 'section-writing',
    title: '영어로 직접 써봐요!',
    charFile: 'char-poco.png', charEmoji: '🐶', charName: '포코',
    speech: '안녕! 도전을 즐기는 포코야! 🐶\n이제 영어를 직접 써볼 차례야!\n힌트를 잘 보고 타이핑해봐요. 할 수 있어요!',
    desc: '단어를 올바른 순서로 입력하거나, 빈칸에 알맞은 단어를 직접 써보세요.',
    tips: ['힌트를 꼭 확인해요', '타이핑 후 Enter 키를 눌러요'],
    count: 5,
  },
};

// ── App State ─────────────────────────────────
const state = {
  studentInfo:   { name: '', grade: '', teacherEmail: '', academy: '', sessionId: '' },
  surveyTheta:   5.0,
  cat:           null,
  currentQ:      null,
  mcqResults:    null,
  mcqLevel:      '',
  chatMessages:  [],
  chatTurn:      0,
  assessment:    null,
  testStartTime: null,   // 테스트 시작 시각 (소요 시간 계산용)
};

// ── 로그 헬퍼 ─────────────────────────────────
function logEvent(event, extra = {}) {
  const payload = {
    event,
    sessionId: state.studentInfo.sessionId,
    name:      state.studentInfo.name,
    grade:     state.studentInfo.grade,
    academy:   state.studentInfo.academy,
    ...extra,
  };
  fetch('/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

// ── Academy list (loaded on init) ─────────────
let _academies = [];   // string[]

async function loadAcademies() {
  try {
    const res = await fetch('/api/academies');
    if (res.ok) {
      _academies = await res.json();
      // populate datalist
      const dl = document.getElementById('academy-datalist');
      if (dl) {
        dl.innerHTML = _academies.map(n => `<option value="${n.replace(/"/g,'&quot;')}">`).join('');
      }
    }
  } catch { /* offline — skip validation */ }
}
loadAcademies();

// ── App Controller ────────────────────────────
const App = {

  goTo(screenId) {
    App.stopSpeech();
    document.querySelectorAll('.screen').forEach(s => {
      s.classList.remove('active');
      s.style.display = 'none';
    });
    const el = document.getElementById(screenId);
    if (el) {
      el.style.display = 'flex';
      el.classList.add('active');
      window.scrollTo(0, 0);
    }
  },

  // ─── Step 1: Info submit → Survey ─────────
  async startTest(event) {
    event.preventDefault();

    const academyInput = document.getElementById('f-academy');
    const academyErr   = document.getElementById('academy-error');
    const academyVal   = academyInput.value.trim();

    // 학원 검증: 목록이 있고, 입력값이 목록에 없으면 차단
    if (_academies.length > 0 && !_academies.includes(academyVal)) {
      academyInput.classList.add('input-error');
      academyErr.style.display = 'block';
      academyInput.focus();
      return;
    }
    academyInput.classList.remove('input-error');
    academyErr.style.display = 'none';

    // 세션 ID 생성 (이번 테스트 고유 식별자)
    state.studentInfo.sessionId    = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    state.studentInfo.academy      = academyVal;
    state.studentInfo.name         = document.getElementById('f-name').value.trim();
    state.studentInfo.grade        = document.getElementById('f-grade').value;
    state.studentInfo.teacherEmail = document.getElementById('f-email').value.trim();
    state.testStartTime            = Date.now();

    // 시작 로그 (브라우저·화면 정보 포함)
    logEvent('start', {
      extra: {
        screenW:    screen.width,
        screenH:    screen.height,
        lang:       navigator.language,
        platform:   navigator.platform,
      },
    });

    App.goTo('screen-survey');
  },

  // ─── Step 2: Survey selection ─────────────
  selectSurvey(btn, theta) {
    // 시각적 선택 표시
    document.querySelectorAll('.survey-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    state.surveyTheta = theta;

    // 설문 선택 로그
    logEvent('survey_select', { surveyTheta: theta });

    // 0.4초 후 자동으로 MCQ로 이동
    setTimeout(async () => {
      const res = await fetch('/questions.json').catch(() => null);
      if (!res || !res.ok) {
        logEvent('error', { errorStep: 'load_questions', errorMsg: 'questions.json 로드 실패' });
        alert('문제를 불러오지 못했습니다. 페이지를 새로고침 해주세요.');
        return;
      }
      const questions = await res.json();
      state.cat = new CATEngine(questions, state.surveyTheta);
      logEvent('mcq_start', { extra: { totalQ: state.cat.TARGET } });
      App.showSectionIntro(); // Section 1 인트로부터 시작
    }, 400);
  },

  // ─── 섹션 인트로 ──────────────────────────
  showSectionIntro() {
    const sec  = state.cat.currentSection;
    if (!sec) { App.goTo('screen-mcq'); App.showNextQuestion(); return; }
    const info = SECTION_INTROS[sec.key];
    if (!info) { App.goTo('screen-mcq'); App.showNextQuestion(); return; }

    // 배지
    const badge = document.getElementById('si-badge');
    badge.textContent = `${info.icon} Section ${info.num} / 4`;
    badge.className = `si-badge ${info.colorClass}`;

    // 진행 점 (완료 섹션 강조)
    for (let i = 1; i <= 4; i++) {
      const dot = document.getElementById(`si-dot-${i}`);
      if (dot) dot.className = 'si-dot' + (i === info.num ? ' active' : i < info.num ? ' done' : '');
    }

    // 캐릭터
    const img   = document.getElementById('si-char-img');
    const emoji = document.getElementById('si-char-emoji');
    img.src = info.charFile;
    img.style.display = 'block';
    emoji.style.display = 'none';
    img.onerror = function () {
      this.style.display = 'none';
      emoji.textContent  = info.charEmoji;
      emoji.style.display = 'block';
    };

    // 말풍선 + 텍스트
    document.getElementById('si-speech').textContent = info.speech;
    document.getElementById('si-title').textContent  = info.title;
    document.getElementById('si-desc').textContent   = info.desc;
    document.getElementById('si-count').textContent  = `📝 ${info.count}문제`;

    // 팁
    const tipsEl = document.getElementById('si-tips');
    tipsEl.innerHTML = info.tips.map(t => `<div class="si-tip">💡 ${t}</div>`).join('');

    App.goTo('screen-section-intro');
  },

  startSection() {
    App.goTo('screen-mcq');
    App.showNextQuestion();
  },

  // ─── MCQ ──────────────────────────────────
  showNextQuestion() {
    const q = state.cat.selectNext();
    if (!q || state.cat.isDone()) { App.finishMCQ(); return; }
    state.currentQ = q;

    const done  = state.cat.history.length;
    const total = state.cat.TARGET;
    document.getElementById('mcq-progress-fill').style.width = `${(done / total) * 100}%`;
    document.getElementById('mcq-progress-label').textContent = `${done + 1} / ${total}`;
    document.getElementById('q-number').textContent = `Q${done + 1}`;

    // 섹션 배지 업데이트
    const sec = state.cat.currentSection;
    const secEl = document.getElementById('q-section-badge');
    if (secEl && sec) {
      const secNum = state.cat.sectionIdx + 1;
      secEl.textContent = `${sec.icon} Section ${secNum} · ${sec.label}`;
      secEl.className = `q-section-badge section-${sec.key}`;
      document.getElementById('q-section-progress').textContent =
        `${state.cat.sectionDone + 1} / ${sec.count}`;
    }

    // 그림 문항 처리
    const picEl = document.getElementById('q-picture');
    if (q.questionType === 'picture' && q.picture) {
      picEl.textContent = q.picture;
      picEl.style.display = 'block';
    } else {
      picEl.style.display = 'none';
    }

    document.getElementById('q-text').textContent = q.question;

    const optWrap     = document.getElementById('q-options');
    const writingArea = document.getElementById('q-writing-area');
    const isWriting   = q.section === 'writing' && (q.questionType === 'unscramble' || q.questionType === 'fillin');

    if (isWriting) {
      // ── 쓰기 입력 모드 ──
      optWrap.style.display = 'none';
      writingArea.style.display = 'block';

      // 단어 힌트 (unscramble: 섞어서 표시)
      const hintEl = document.getElementById('q-writing-hint');
      if (q.questionType === 'unscramble' && q.words?.length) {
        const shuffled = [...q.words].sort(() => Math.random() - 0.5);
        hintEl.innerHTML = shuffled.map(w => `<span class="word-chip">${w}</span>`).join('');
        hintEl.style.display = 'flex';
      } else {
        hintEl.style.display = 'none';
      }

      const inp = document.getElementById('q-writing-input');
      const fb  = document.getElementById('q-writing-feedback');
      inp.value = '';
      inp.disabled = false;
      fb.textContent = '';
      fb.className = 'writing-feedback';
      document.getElementById('q-writing-submit').disabled = false;
      setTimeout(() => inp.focus(), 100);

    } else {
      // ── 객관식 모드 ──
      writingArea.style.display = 'none';
      optWrap.style.display = '';
      optWrap.innerHTML = '';
      const letters = ['A', 'B', 'C', 'D'];
      q.options.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'opt-btn';
        btn.innerHTML = `<span class="opt-letter">${letters[i]}</span>${opt}`;
        btn.onclick = () => App.answerQuestion(i, btn);
        optWrap.appendChild(btn);
      });
    }

    // 카드 애니메이션
    const card = document.getElementById('mcq-card');
    card.style.animation = 'none';
    card.offsetHeight;
    card.style.animation = 'fadeIn 0.3s ease';
  },

  // ─── Writing 제출 채점 ──────────────────────
  submitWriting() {
    const q   = state.currentQ;
    const inp = document.getElementById('q-writing-input');
    const raw = inp.value.trim();
    if (!raw) { inp.focus(); return; }

    // 정답 정규화 비교 (대소문자·끝 구두점·스마트따옴표 무시)
    const norm = s => s.toLowerCase()
      .replace(/['']/g, "'").replace(/[""]/g, '"')
      .replace(/[.!?,;]+$/, '').replace(/\s+/g, ' ').trim();

    const isCorrect = (q.expected || []).some(exp => norm(raw) === norm(exp));

    inp.disabled = true;
    document.getElementById('q-writing-submit').disabled = true;

    const fb = document.getElementById('q-writing-feedback');
    if (isCorrect) {
      fb.textContent = '✓ 정답!';
      fb.className = 'writing-feedback correct';
    } else {
      fb.textContent = `✗ 정답: ${q.expected?.[0] ?? ''}`;
      fb.className = 'writing-feedback wrong';
    }

    state.cat.record(q.id, isCorrect);
    setTimeout(() => {
      if (state.cat.isDone())          App.finishMCQ();
      else if (state.cat.sectionDone === 0) App.showSectionIntro(); // 새 섹션 시작
      else                              App.showNextQuestion();
    }, isCorrect ? 800 : 1400);
  },

  answerQuestion(selectedIdx, clickedBtn) {
    const q       = state.currentQ;
    const correct = (selectedIdx === q.answer);

    document.querySelectorAll('.opt-btn').forEach(b => b.classList.add('disabled'));
    clickedBtn.classList.remove('disabled');
    clickedBtn.classList.add(correct ? 'selected-correct' : 'selected-wrong');

    if (!correct) {
      document.querySelectorAll('.opt-btn')[q.answer].classList.remove('disabled');
      document.querySelectorAll('.opt-btn')[q.answer].classList.add('reveal-correct');
    }

    state.cat.record(q.id, correct);
    setTimeout(() => {
      if (state.cat.isDone())              App.finishMCQ();
      else if (state.cat.sectionDone === 0) App.showSectionIntro(); // 새 섹션 시작
      else                                  App.showNextQuestion();
    }, correct ? 700 : 1100);
  },

  finishMCQ() {
    state.mcqResults = state.cat.results();
    state.mcqLevel   = state.cat.thetaToLevel();
    App.goTo('screen-transition');
  },

  // ─── Chat ─────────────────────────────────
  startChat() {
    state.chatMessages = [];
    state.chatTurn = 0;
    document.getElementById('chat-messages').innerHTML = '';
    App.goTo('screen-chat');
    App.getAIMessage();
  },

  async getAIMessage() {
    App.setChatInputEnabled(false);
    App.showTyping(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages:    state.chatMessages,
          studentName: state.studentInfo.name,
          grade:       state.studentInfo.grade,
          mcqLevel:    state.mcqLevel,
          mcqTheta:    state.mcqResults?.theta,
          turnCount:   state.chatTurn,
        }),
      });

      App.showTyping(false);
      if (!res.ok) throw new Error('서버 오류');
      const data = await res.json();

      const aiMsg = data.message || '...';
      state.chatMessages.push({ role: 'assistant', content: aiMsg });
      App.appendBubble('ai', aiMsg);

      state.chatTurn++;
      document.getElementById('chat-turn-current').textContent = Math.min(state.chatTurn, 6);

      if (data.isComplete && data.assessment) {
        state.assessment = data.assessment;
        setTimeout(() => App.finishChat(), 1200);
      } else {
        App.setChatInputEnabled(true);
        document.getElementById('chat-input').focus();
      }
    } catch {
      App.showTyping(false);
      App.appendBubble('ai', 'Sorry, I had a little trouble there. Could you try again?');
      App.setChatInputEnabled(true);
    }
  },

  sendChat() {
    const input = document.getElementById('chat-input');
    const text  = input.value.trim();
    if (!text) return;
    // 녹음 중이면 먼저 중단
    if (App._recognition) { try { App._recognition.stop(); } catch(e){} }
    input.value = '';
    state.chatMessages.push({ role: 'user', content: text });
    App.appendBubble('user', text);
    App.getAIMessage();
  },

  chatKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      App.sendChat();
    }
  },

  // ─── 음성 입력 ─────────────────────────────
  toggleVoice() {
    if (App._voiceActive) {
      App._stopVoice();
    } else {
      App._startVoice();
    }
  },

  _startVoice() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      alert('음성 입력은 Chrome 또는 Edge 브라우저에서 사용 가능해요!');
      return;
    }

    const rec  = new SpeechRec();
    rec.lang   = 'en-US';
    rec.continuous     = false;
    rec.interimResults = true;

    const micBtn = document.getElementById('btn-mic');
    const input  = document.getElementById('chat-input');
    const status = document.getElementById('voice-status');

    rec.onstart = () => {
      App._voiceActive = true;
      App._recognition = rec;
      micBtn.classList.add('recording');
      micBtn.textContent = '⏹';
      if (status) { status.style.display = 'flex'; }
      input.value = '';
      input.placeholder = '듣고 있어요... 영어로 말해보세요 🎤';
    };

    rec.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map(r => r[0].transcript).join('');
      input.value = transcript;
      // 최종 결과면 1초 후 자동 전송
      if (e.results[e.results.length - 1].isFinal) {
        App._stopVoice();
        setTimeout(() => { if (input.value.trim()) App.sendChat(); }, 800);
      }
    };

    rec.onerror = (e) => {
      console.warn('Voice error:', e.error);
      App._stopVoice();
      if (e.error === 'not-allowed') {
        alert('마이크 권한이 필요해요. 브라우저 주소창 왼쪽의 🔒 아이콘을 눌러 마이크를 허용해주세요.');
      }
    };

    rec.onend = () => App._stopVoice();
    rec.start();
  },

  _stopVoice() {
    const micBtn = document.getElementById('btn-mic');
    const input  = document.getElementById('chat-input');
    const status = document.getElementById('voice-status');
    if (App._recognition) { try { App._recognition.stop(); } catch(e){} App._recognition = null; }
    App._voiceActive = false;
    if (micBtn) { micBtn.classList.remove('recording'); micBtn.textContent = '🎤'; }
    if (status) status.style.display = 'none';
    if (input)  input.placeholder = '영어로 말해보세요... (🎤 누르거나 직접 입력)';
  },

  appendBubble(role, text) {
    const wrap  = document.createElement('div');
    wrap.className = `chat-bubble-wrap ${role}`;

    const label = document.createElement('div');
    label.className = 'bubble-label';

    if (role === 'ai') {
      // 🔊 재생 버튼 + 레이블
      label.innerHTML = `AI 선생님 (Ello) <button class="btn-speak" title="다시 듣기" onclick="App.speakText(this.dataset.text)" data-text="${text.replace(/"/g,'&quot;')}">🔊</button>`;
    } else {
      label.textContent = state.studentInfo.name || '학생';
    }

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.textContent = text;

    wrap.appendChild(label);
    wrap.appendChild(bubble);
    const container = document.getElementById('chat-messages');
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;

    // AI 메시지는 자동으로 음성 출력
    if (role === 'ai') App.speakText(text);
  },

  // ─── TTS (AI 음성 출력 — 한국어 + 영어 지원) ─
  speakText(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    // 이모지·특수기호·구두점 제거 (TTS 엔진이 "exclamation mark" 등으로 읽는 것 방지)
    const cleaned = text
      .replace(/\p{Extended_Pictographic}/gu, ' ')
      .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
      .replace(/[{}[\]━*#_~`|!?.,;:'"()]/g, ' ')
      .replace(/\s+/g, ' ').trim();

    if (!cleaned) return;

    // 한국어 / 영어 구간 분리
    // ★ 핵심: 공백·숫자·중립문자는 현재 구간에 그냥 포함 → 단어 단위 끊김 방지
    //   오직 "반대 언어 글자"가 나올 때만 구간을 나눔
    const segments = [];
    let buf = '', bufKo = null;
    for (const ch of cleaned) {
      const isKo = /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(ch);
      const isEn = /[a-zA-Z]/.test(ch);

      if (bufKo === null) {
        // 첫 글자가 한국어/영어일 때 언어 확정
        if (isKo)      bufKo = true;
        else if (isEn) bufKo = false;
        buf += ch;
        continue;
      }

      // 반대 언어 글자가 나올 때만 구간 전환
      if ((isKo && !bufKo) || (isEn && bufKo)) {
        if (buf.trim()) segments.push({ t: buf.trim(), ko: bufKo });
        buf = ch;
        bufKo = isKo ? true : false;
      } else {
        buf += ch;
      }
    }
    if (buf.trim()) segments.push({ t: buf.trim(), ko: bufKo ?? false });

    const voices = window.speechSynthesis.getVoices();

    // 한국어: Google 한국어 > 네트워크 기반(non-local) > 그 외 순으로 우선
    const koVoice =
      voices.find(v => v.lang.startsWith('ko') && v.name === 'Google 한국어') ||
      voices.find(v => v.lang.startsWith('ko') && v.name.toLowerCase().includes('google')) ||
      voices.find(v => v.lang.startsWith('ko') && v.localService === false) ||
      voices.find(v => v.lang.startsWith('ko'));

    // 영어: 자연스러운 음성 우선
    const enVoice =
      voices.find(v => v.lang === 'en-US' && /Samantha|Google US English|Ava|Zira/i.test(v.name)) ||
      voices.find(v => v.lang === 'en-US' && v.localService === false) ||
      voices.find(v => v.lang === 'en-US');

    segments.forEach(seg => {
      const utter  = new SpeechSynthesisUtterance(seg.t);
      utter.lang   = seg.ko ? 'ko-KR' : 'en-US';
      // Google 한국어는 rate 0.95가 자연스럽고, 로컬 음성은 조금 느리게
      utter.rate   = seg.ko ? 0.92 : 0.88;
      utter.pitch  = seg.ko ? 1.0 : 1.05;
      const voice  = seg.ko ? koVoice : enVoice;
      if (voice) utter.voice = voice;
      window.speechSynthesis.speak(utter);
    });
  },

  stopSpeech() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  },

  showTyping(show) {
    document.getElementById('chat-typing').style.display = show ? 'flex' : 'none';
    document.getElementById('chat-messages').scrollTop = 9999;
  },

  setChatInputEnabled(enabled) {
    document.getElementById('chat-input').disabled = !enabled;
    document.getElementById('btn-send').disabled   = !enabled;
    const mic = document.getElementById('btn-mic');
    if (mic) mic.disabled = !enabled;
    if (!enabled) App._stopVoice();
  },

  finishChat() { App.goTo('screen-processing'); App.runProcessing(); },

  // ─── Processing ───────────────────────────
  async runProcessing() {
    const steps = ['ps-1','ps-2','ps-3','ps-4'];
    const markStep = (i, active) => {
      const el = document.getElementById(steps[i]);
      el.classList.toggle('active', active);
      if (!active) el.classList.add('done');
    };

    markStep(0, true); await delay(600);
    markStep(0, false); markStep(1, true); await delay(600);
    markStep(1, false); markStep(2, true);

    const durationSec = state.testStartTime
      ? Math.round((Date.now() - state.testStartTime) / 1000) : null;

    try {
      const res = await fetch('/api/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentInfo:          state.studentInfo,
          mcqResults:           state.mcqResults,
          mcqLevel:             state.mcqLevel,
          conversationMessages: state.chatMessages,
          assessment:           state.assessment,
          durationSec,
        }),
      });
      const data = await res.json();
      markStep(2, false); markStep(3, true); await delay(800);
      markStep(3, false);
      App.showResult(data);
    } catch (err) {
      logEvent('error', {
        errorStep: 'api_complete',
        errorMsg:  err?.message || 'unknown error',
      });
      markStep(2, false); markStep(3, false);
      App.showResult({
        finalLevel: state.assessment?.final_level || state.mcqLevel,
        strengths:  state.assessment?.strengths || '',
        growth:     state.assessment?.growth || '',
        emailSent:  false,
      });
    }
  },

  // ─── Result ───────────────────────────────
  showResult(data) {
    document.getElementById('result-student-name').textContent = state.studentInfo.name;

    const finalLevel = data.finalLevel || state.mcqLevel || 'Seeker 1';
    const parts  = finalLevel.split(' ');
    const series = parts[0];   // e.g. 'Explorer'
    const book   = parts.slice(1).join(' ');  // e.g. '1'

    document.getElementById('level-series').textContent = series;
    document.getElementById('level-book').textContent   = book;

    // 캐릭터 설정 불러오기
    const char = CHARACTERS[series] || CHARACTERS.Seeker;

    // 배지 색깔
    const badge = document.getElementById('level-badge');
    badge.className = 'level-badge ' + char.badgeClass;

    // 결과 캐릭터 이미지 (PNG 있으면 표시, 없으면 이모지 폴백)
    const charWrap = document.getElementById('result-char-wrap');
    const charImg  = document.getElementById('result-char-img');
    const charEmoji= document.getElementById('result-char-emoji');
    if (charImg && charWrap) {
      charImg.src = char.file;
      charImg.alt = char.nameKo;
      charImg.onload  = () => { charImg.style.display='block'; if(charEmoji) charEmoji.style.display='none'; };
      charImg.onerror = () => { charImg.style.display='none';  if(charEmoji) { charEmoji.style.display='block'; charEmoji.textContent=char.emoji; } };
      charWrap.style.borderColor = char.color;
    }

    // 캐릭터 이름 표시
    const charNameEl = document.getElementById('result-char-name');
    if (charNameEl) charNameEl.textContent = `${char.emoji} ${char.nameKo} (${char.animal})`;

    // 응원 메시지
    document.getElementById('cheer-msg').textContent = char.cheer;

    // 섹션별 점수 카드 (MCQ 결과 기반, AI 대화 점수 미표시)
    const scores = document.getElementById('result-scores');
    scores.innerHTML = '';
    const SECTION_INFO = {
      vocabulary: { label: '어휘 & 표현', icon: '📖' },
      grammar:    { label: '문법 & 구조', icon: '✏️'  },
      reading:    { label: '독해',        icon: '📚'  },
      writing:    { label: '쓰기',        icon: '🖊️' },
    };
    const bySection = state.mcqResults?.bySection || {};
    Object.entries(SECTION_INFO).forEach(([key, info]) => {
      const s = bySection[key];
      if (!s || !s.total) return;
      const pct = Math.round((s.correct / s.total) * 100);
      const color = pct >= 80 ? '#16A34A' : pct >= 60 ? '#D97706' : '#DC2626';
      const div = document.createElement('div');
      div.className = 'score-card';
      div.innerHTML = `
        <div class="score-card-label">${info.icon} ${info.label}</div>
        <div class="score-card-value" style="color:${color}">${pct}<span style="font-size:13px;color:#94A3B8">%</span></div>
        <div style="font-size:11px;color:#94A3B8;margin-top:2px;">${s.correct}/${s.total}</div>`;
      scores.appendChild(div);
    });

    // 피드백
    const fb = document.getElementById('result-feedback');
    fb.innerHTML = '';
    if (data.strengths) fb.innerHTML += `<div class="feedback-item">
      <div class="feedback-item-label">✓ 잘하는 점</div>
      <div class="feedback-item-text">${escHtml(data.strengths)}</div></div>`;
    if (data.growth) fb.innerHTML += `<div class="feedback-item">
      <div class="feedback-item-label">→ 더 키울 부분</div>
      <div class="feedback-item-text">${escHtml(data.growth)}</div></div>`;

    // 이메일 상태
    const emailEl = document.getElementById('email-status');
    if (data.emailSent) {
      emailEl.className = 'sent';
      emailEl.textContent = `✅ 결과 리포트가 ${data.recipientEmail}으로 발송되었습니다.`;
    } else if (data.emailError) {
      emailEl.className = 'error';
      emailEl.textContent = `⚠️ 이메일 발송 실패 — 선생님께 직접 결과를 알려주세요.`;
    }

    App.goTo('screen-result');
  },

  // ─── Reset ────────────────────────────────
  reset() {
    Object.assign(state, {
      cat: null, currentQ: null, mcqResults: null, mcqLevel: '',
      chatMessages: [], chatTurn: 0, assessment: null, surveyTheta: 5.0,
    });
    ['f-name','f-email','f-academy'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    const ae = document.getElementById('academy-error');
    if (ae) { ae.style.display = 'none'; }
    const ai = document.getElementById('f-academy');
    if (ai) ai.classList.remove('input-error');
    document.getElementById('f-grade').value = '';
    document.querySelectorAll('.survey-btn').forEach(b => b.classList.remove('selected'));
    ['ps-1','ps-2','ps-3','ps-4'].forEach(id => {
      const el = document.getElementById(id);
      el.classList.remove('done', 'active');
    });
    App.goTo('screen-welcome');
  },
};

// ── Utils ─────────────────────────────────────
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function escHtml(s) {
  return String(s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── 테스트 모드: URL에 ?test=chat&level=3 붙이면 바로 인터뷰 화면 ──
(function initTestMode() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('test') !== 'chat') return;

  const theta = parseFloat(params.get('level') ?? '3');
  const name  = params.get('name') ?? '테스트';
  const grade = params.get('grade') ?? '초등 5학년';

  // 더미 상태 주입
  state.studentInfo = { name, grade, teacherEmail: '' };
  state.surveyTheta = theta;
  state.mcqResults  = { theta, correctCount: 8, total: 15, byType: {}, history: [] };

  // thetaToLevel 직접 계산
  const lvl = theta < 1 ? 'Seeker 1' : theta < 2 ? 'Seeker 2'
            : theta < 3 ? 'Builder 1' : theta < 4 ? 'Builder 2'
            : theta < 5 ? 'Challenger 1' : theta < 6 ? 'Challenger 2'
            : theta < 7 ? 'Explorer 1'   : theta < 8 ? 'Explorer 2'
            : theta < 9 ? 'Inventor 1'   : 'Inventor 2';
  state.mcqLevel = lvl;

  // 화면 전환 (DOM 이미 로드됨 → 바로 실행)
  console.log(`🧪 테스트 모드: level=${lvl} (theta=${theta}), name=${name}`);
  setTimeout(() => {
    App.goTo('screen-chat');
    App.startChat();
  }, 100);
})();

// ── Boot ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.screen').forEach(s => { s.style.display = 'none'; });
  App.goTo('screen-welcome');

  // 사용 가능한 한국어 음성 목록 콘솔 출력 (개발용)
  const logVoices = () => {
    const all = window.speechSynthesis.getVoices();
    const ko  = all.filter(v => v.lang.startsWith('ko'));
    if (ko.length) {
      console.log('[TTS] 한국어 음성 목록:');
      ko.forEach(v => console.log(`  ${v.name} | local:${v.localService} | lang:${v.lang}`));
    }
  };
  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = logVoices;
    logVoices();
  }
});
