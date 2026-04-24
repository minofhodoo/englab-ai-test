require('dotenv').config({ override: true });
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const nodemailer = require('nodemailer');
const path = require('path');
const fs   = require('fs');

// ── Data directory for result persistence ──────────
// Railway Volume 사용 시 DATA_DIR 환경변수로 마운트 경로 지정
const DATA_DIR       = process.env.DATA_DIR || path.join(__dirname, 'data');
const RESULTS_FILE   = path.join(DATA_DIR, 'results.json');
const ACADEMIES_FILE = path.join(DATA_DIR, 'academies.json');
const LOGS_FILE      = path.join(DATA_DIR, 'logs.json');
if (!fs.existsSync(DATA_DIR))       fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(RESULTS_FILE))   fs.writeFileSync(RESULTS_FILE,   '[]', 'utf8');
if (!fs.existsSync(ACADEMIES_FILE)) fs.writeFileSync(ACADEMIES_FILE, '[]', 'utf8');
if (!fs.existsSync(LOGS_FILE))      fs.writeFileSync(LOGS_FILE,      '[]', 'utf8');

// helper: read JSON file safely
function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8') || '[]'); } catch { return []; }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ──────────────────────────────────────────────
//  Clients
// ──────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function createMailTransport() {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

// ──────────────────────────────────────────────
//  GET /api/academies  — public: returns name list for validation
// ──────────────────────────────────────────────
app.get('/api/academies', (_req, res) => {
  const list = readJSON(ACADEMIES_FILE);
  res.json(list.map(a => a.name));
});

// ──────────────────────────────────────────────
//  POST /api/log  — public: record all test events
// ──────────────────────────────────────────────
app.post('/api/log', (req, res) => {
  const {
    event, sessionId,
    name, grade, academy,
    surveyTheta,          // 설문 선택 theta
    errorMsg, errorStep,  // 오류 이벤트용
    extra,                // 추가 자유 필드 (object)
  } = req.body;
  try {
    const logs = readJSON(LOGS_FILE);
    const entry = {
      id:          Date.now(),
      date:        new Date().toISOString(),
      event:       event || 'start',
      sessionId:   sessionId || '',
      name:        name    || '',
      grade:       grade   || '',
      academy:     academy || '',
      // 서버가 수집하는 정보
      ip:          (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(),
      ua:          req.headers['user-agent'] || '',
    };
    if (surveyTheta  != null) entry.surveyTheta = surveyTheta;
    if (errorMsg)            entry.errorMsg    = errorMsg;
    if (errorStep)           entry.errorStep   = errorStep;
    if (extra && typeof extra === 'object') Object.assign(entry, extra);
    logs.push(entry);
    writeJSON(LOGS_FILE, logs);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ──────────────────────────────────────────────
//  Health check
// ──────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    emailConfigured: !!(process.env.EMAIL_USER && process.env.EMAIL_PASS),
    teacherEmail: process.env.TEACHER_EMAIL || '(not set)',
  });
});

// ──────────────────────────────────────────────
//  POST /api/chat
//  Proxy a single conversation turn to Claude
// ──────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { messages, studentName, grade, mcqLevel, mcqTheta, turnCount } = req.body;

  const isFinalTurn = turnCount >= 5;
  const theta = mcqTheta || 5;
  const turn  = turnCount + 1;

  // ── 레벨별 초단순 프롬프트 ──────────────────
  let systemPrompt;

  if (theta < 2) {
    // SEEKER: 서버에서 직접 레벨 계산 → Claude에게 명령으로 전달
    const userAnswerCount = messages.filter(m => m.role === 'user').length;

    let levelInstruction, levelExample1, levelExample2;
    if (userAnswerCount < 2) {
      // Level A: 이모지 퀴즈
      levelInstruction = 'Show ONE emoji and ask how to say it in English.';
      levelExample1 = '오, 진짜 잘한다! 🐶 이 그림은 영어로 어떻게 말해?';
      levelExample2 = '와, 정말 잘했어! 🚗 이 그림은 영어로 어떻게 말해?';
    } else if (userAnswerCount < 4) {
      // Level B: 선택 질문
      levelInstruction = 'Ask ONE simple either/or choice question in English.';
      levelExample1 = '너 진짜 영어 잘하는구나! Do you like dogs or cats?';
      levelExample2 = '오, 대단한데! Do you like pizza or rice?';
    } else {
      // Level C: 짧은 자유 문장 질문
      levelInstruction = 'Ask ONE simple open-ended question in English (max 8 words).';
      levelExample1 = '진짜 잘 따라오네, 멋지다! What do you like to eat?';
      levelExample2 = '와, 너무 잘한다! What do you do after school?';
    }

    systemPrompt = `You are Ello, a friendly English teacher. Student: ${studentName}, turn ${turn}/6.

THIS TURN YOU MUST: ${levelInstruction}

REPLY FORMAT (strictly 1-2 sentences):
• Warm, friendly Korean encouragement (a full sentence, not just one word) reacting to student's previous answer — skip on turn 1
• Then exactly the type of question described above

Korean reaction examples (use variety, feel free to create similar ones):
  "오, 진짜 잘한다!", "와, 대단한데!", "너 영어 잘하는구나!", "정말 잘했어!", "와 맞아, 너무 잘하는걸!", "진짜 멋지다!"

Full reply examples:
  "${levelExample1}"
  "${levelExample2}"

NEVER write more than 2 sentences.
NEVER use a different question type than instructed above.
NEVER say "It's nice to meet you" or introduce yourself.`;

  } else if (theta < 4) {
    // BUILDER: 짧은 일상 질문
    systemPrompt = `You are Ello, a friendly English teacher.
Student: ${studentName}, turn ${turn}/6.

REPLY FORMAT — maximum 2 short sentences:
Sentence 1: Warm, friendly Korean reaction (a real sentence, not just one word). Skip on turn 1.
Sentence 2: ONE simple English question about daily life.

Korean reaction examples (use variety):
  "오, 진짜 잘하는데!", "와, 대단하다!", "너무 잘했어!", "정말 멋지다!", "오 맞아, 잘한다!"

Turn 1 example: "안녕 ${studentName}! What food do you like?"
Turn 2 example: "와, 진짜 잘하는구나! Do you have a pet?"
Turn 3 example: "오, 대단한데! How old are you?"
Turn 4 example: "너무 잘했어! What color is your bag?"

NEVER write more than 2 sentences. NEVER ask "what is your favorite subject".`;

  } else if (theta < 6) {
    // CHALLENGER
    systemPrompt = `You are Ello, an English teacher.
Student: ${studentName} (${grade}), turn ${turn}/6.

Write exactly 2 sentences:
1. One-word or 2-word reaction to previous answer.
2. One question about daily life or hobbies (max 10 words).

Example: "Nice! What do you do after school?"
Example: "Good! Tell me about your best friend."
English only. No praise paragraphs.`;

  } else if (theta < 8) {
    // EXPLORER
    systemPrompt = `You are Ello, an English teacher assessing ${studentName} (${grade}). Turn ${turn}/6.
Write 1-2 sentences max. Short reaction + one open question requiring 2-3 sentence answer.
English only. Be concise.`;

  } else {
    // INVENTOR
    systemPrompt = `You are Ello, an English teacher assessing ${studentName} (${grade}). Turn ${turn}/6.
One brief reaction + one analytical question. Max 2 sentences. English only.`;
  }

  // 마지막 턴: JSON 평가 추가
  if (isFinalTurn) {
    systemPrompt += `

FINAL TURN: Write one warm closing sentence (max 12 words), then on a NEW LINE output ONLY this JSON (no markdown, no code block):
{"assessment_complete":true,"vocabulary":N,"grammar":N,"complexity":N,"overall":N,"final_level":"X N","strengths":"...","growth":"...","recommendation_ko":"...","notes_ko":"..."}

Field rules:
- final_level: one of "Seeker 1","Seeker 2","Builder 1","Builder 2","Challenger 1","Challenger 2","Explorer 1","Explorer 2","Inventor 1","Inventor 2"
- MCQ theta ${theta.toFixed(1)} counts 40%, this conversation 60%

SCORING PHILOSOPHY — scores are LEVEL-RELATIVE, NOT absolute:
Score how well this student performed FOR THEIR OWN LEVEL (theta ${theta.toFixed(1)}).
A Seeker who perfectly names all emojis and answers simple questions deserves 8-9.
A Builder who responds fluently with correct simple sentences deserves 8-9.
Only give low scores (1-4) if the student STRUGGLED even for their level.
Scale: 1-4=below expectations for level, 5-6=meets expectations, 7-9=exceeds expectations, 10=exceptional
- vocabulary: how rich/appropriate was their word choice FOR THIS LEVEL?
- grammar: how accurate was their grammar FOR THIS LEVEL?
- complexity: how complex were their sentences FOR THIS LEVEL?
- overall: holistic performance FOR THIS LEVEL

- strengths: 2-3 sentences in English — cite SPECIFIC evidence from the conversation (actual words/phrases the student used). What did they do well?
- growth: 2-3 sentences in English — identify SPECIFIC patterns observed (e.g. tense errors, limited connector use). What exact areas need work?
- recommendation_ko: 2-3 sentences in Korean — concrete, actionable study tips matched to this student's level and observed weaknesses (e.g. "매일 영어 일기 쓰기", "현재완료 시제 집중 연습" etc.)
- notes_ko: 2-3 sentences in Korean for the teacher — overall impression, attitude during the test, and any notable observations the teacher should know`;
  }

  // ── 메시지 구성 ──────────────────────────────
  // few-shot 예시로 포맷 강제 (prefill 미지원 모델 대응)
  let messagesForAPI;

  if (messages.length === 0) {
    if (theta < 2) {
      // Seeker: 첫 턴 → Level A 포맷 예시 1쌍 + 시작 요청
      messagesForAPI = [
        { role: 'user',      content: '[예시] 어떻게 질문해?' },
        { role: 'assistant', content: '안녕! 🍎 이 그림은 영어로 어떻게 말해?' },
        { role: 'user',      content: `좋아, 이제 ${studentName}한테 시작해줘.` },
      ];
    } else if (theta < 4) {
      // Builder: 포맷 예시 1쌍 + 시작 요청
      messagesForAPI = [
        { role: 'user',      content: '[예시] 어떻게 질문해?' },
        { role: 'assistant', content: `안녕 민지! What food do you like?` },
        { role: 'user',      content: `좋아, 이제 ${studentName}한테 시작해줘.` },
      ];
    } else {
      messagesForAPI = [{ role: 'user', content: `Hi, I'm ${studentName}.` }];
    }
  } else {
    messagesForAPI = messages;
    // messages[0]가 assistant면 user: 'start' 앞에 추가
    if (messagesForAPI[0]?.role === 'assistant') {
      messagesForAPI = [{ role: 'user', content: 'start' }, ...messagesForAPI];
    }
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: isFinalTurn ? 900 : 80,
      system: systemPrompt,
      messages: messagesForAPI,
    });

    // Extract JSON if present
    const fullText = response.content[0].text;
    let assessment = null;
    let displayText = fullText;
    // 마크다운 코드블록 제거 후 JSON 추출
    const cleaned = fullText.replace(/```(?:json)?\s*/g, '').replace(/```/g, '');
    const jsonMatch = cleaned.match(/\{[\s\S]*"assessment_complete"\s*:\s*true[\s\S]*\}/);
    if (jsonMatch) {
      try {
        assessment = JSON.parse(jsonMatch[0]);
        displayText = fullText
          .replace(/```(?:json)?[\s\S]*?```/g, '')  // 코드블록 전체 제거
          .replace(jsonMatch[0], '')
          .trim();
      } catch {
        // JSON parse failed — keep full text, no assessment
      }
    }

    res.json({ message: displayText, assessment, isComplete: !!assessment });
  } catch (err) {
    console.error('Claude API error:', err.message);
    res.status(500).json({ error: 'AI 응답 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' });
  }
});

// ──────────────────────────────────────────────
//  POST /api/complete
//  Compute final level, send email report
// ──────────────────────────────────────────────
app.post('/api/complete', async (req, res) => {
  const {
    studentInfo,       // { name, grade, teacherEmail?, sessionId? }
    mcqResults,        // { theta, correctCount, total, byType, history }
    mcqLevel,          // "Challenger 3" from client theta
    conversationMessages, // [{role, content}]
    assessment,        // from Claude's final JSON
    durationSec,       // 소요 시간 (초)
  } = req.body;

  // ── Compute final level (MCQ 전용 — AI 대화는 레벨에 영향 없음) ──
  const mcqTheta   = mcqResults.theta || 5;
  const finalTheta = mcqTheta;
  const finalLevel = thetaToLevelString(mcqTheta);

  // ── Save result to data/results.json ────────────────────
  const now = new Date();
  try {
    const existing = readJSON(RESULTS_FILE);
    const acc = mcqResults.correctCount && mcqResults.total
      ? Math.round((mcqResults.correctCount / mcqResults.total) * 100) : 0;
    existing.push({
      id:           Date.now(),
      date:         now.toISOString(),
      sessionId:    studentInfo.sessionId || '',
      name:         studentInfo.name,
      grade:        studentInfo.grade,
      academy:      studentInfo.academy || '',
      finalLevel,
      mcqTheta:     +mcqTheta.toFixed(2),
      correct:      mcqResults.correctCount || 0,
      total:        mcqResults.total || 0,
      acc,
      bySection:    mcqResults.bySection || {},
      // AI assessment detail
      ai_vocab:     assessment?.vocabulary  || null,
      ai_grammar:   assessment?.grammar     || null,
      ai_complex:   assessment?.complexity  || null,
      ai_overall:   assessment?.overall     || null,
      strengths:        assessment?.strengths        || '',
      growth:           assessment?.growth           || '',
      recommendation_ko: assessment?.recommendation_ko || '',
      notes_ko:         assessment?.notes_ko         || '',
      durationSec:  durationSec || null,
      // conversation log
      conversation: (conversationMessages || []).filter(m => m.role === 'user' || m.role === 'assistant'),
    });
    writeJSON(RESULTS_FILE, existing);
    // also log 'complete' event
    const logs = readJSON(LOGS_FILE);
    logs.push({
      id:         Date.now() + 1,
      date:       now.toISOString(),
      event:      'complete',
      sessionId:  studentInfo.sessionId || '',
      name:       studentInfo.name,
      grade:      studentInfo.grade,
      academy:    studentInfo.academy || '',
      ip:         (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(),
      ua:         req.headers['user-agent'] || '',
      finalLevel,
      mcqTheta:   +mcqTheta.toFixed(2),
      correct:    mcqResults.correctCount || 0,
      total:      mcqResults.total || 0,
      acc:        mcqResults.correctCount && mcqResults.total
                    ? Math.round((mcqResults.correctCount / mcqResults.total) * 100) : 0,
      bySection:  mcqResults.bySection || {},
      durationSec: durationSec || null,
    });
    writeJSON(LOGS_FILE, logs);
  } catch (e) {
    console.error('Result save error:', e.message);
  }

  // ── Build email ──────────────────────────────────────────
  const dateStr = now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  const recipientEmail = studentInfo.teacherEmail || process.env.TEACHER_EMAIL;

  const emailHtml = buildEmailHtml({
    studentInfo,
    mcqResults,
    mcqLevel,
    conversationMessages,
    assessment,
    finalLevel,
    dateStr,
  });

  let emailSent = false;
  let emailError = null;

  if (recipientEmail && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    try {
      const transporter = createMailTransport();
      await transporter.sendMail({
        from: `"잉글랩 AI 레벨테스트" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
        to: recipientEmail,
        subject: `[잉글랩 AI 레벨테스트] ${studentInfo.name} 학생 결과 — ${finalLevel} (${dateStr})`,
        html: emailHtml,
      });
      emailSent = true;
    } catch (err) {
      console.error('Email send error:', err.message);
      emailError = err.message;
    }
  }

  res.json({
    finalLevel,
    finalTheta,
    strengths: assessment?.strengths || '',
    growth: assessment?.growth || '',
    notes_ko: assessment?.notes_ko || '',
    emailSent,
    emailError,
    recipientEmail,
  });
});

// ──────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────
// 잉글랩 5-레벨 시스템
// Seeker(토키) → Builder(카피) → Challenger(포코) → Explorer(픽시) → Inventor(노바)
function thetaToLevelString(theta) {
  if (theta < 1.0) return 'Seeker 1';
  if (theta < 2.0) return 'Seeker 2';
  if (theta < 3.0) return 'Builder 1';
  if (theta < 4.0) return 'Builder 2';
  if (theta < 5.0) return 'Challenger 1';
  if (theta < 6.0) return 'Challenger 2';
  if (theta < 7.0) return 'Explorer 1';
  if (theta < 8.0) return 'Explorer 2';
  if (theta < 9.0) return 'Inventor 1';
  return             'Inventor 2';
}

function buildEmailHtml({ studentInfo, mcqResults, mcqLevel, conversationMessages, assessment, finalLevel, dateStr }) {
  const acc = mcqResults.correctCount && mcqResults.total
    ? Math.round((mcqResults.correctCount / mcqResults.total) * 100)
    : 0;

  // 섹션별 결과표 (bySection 우선, 없으면 byType fallback)
  const SECTION_META = {
    vocabulary: { label: 'Vocabulary & Expressions', ko: '어휘 & 표현', color: '#E65100' },
    grammar:    { label: 'Grammar & Structure',      ko: '문법 & 구조', color: '#1565C0' },
    reading:    { label: 'Reading Comprehension',    ko: '독해',        color: '#6A1B9A' },
    writing:    { label: 'Writing',                  ko: '쓰기',        color: '#2E7D32' },
  };

  const sectionData = mcqResults.bySection || {};
  const hasSections = Object.keys(sectionData).length > 0;

  // 섹션별 코멘트 생성
  function sectionComment(key, pct) {
    const comments = {
      vocabulary: pct >= 80 ? '풍부한 어휘력을 갖추고 있어요.' : pct >= 60 ? '기본 어휘는 양호하나, 고급 어휘 확장이 필요해요.' : '어휘 학습을 체계적으로 강화할 필요가 있어요.',
      grammar:    pct >= 80 ? '문법 구조를 정확히 이해하고 있어요.' : pct >= 60 ? '기초 문법은 잡혀 있으나, 시제·수 일치 등 정교화가 필요해요.' : '기초 문법 규칙부터 체계적인 복습이 필요해요.',
      reading:    pct >= 80 ? '지문 이해 및 추론 능력이 우수해요.' : pct >= 60 ? '직접 이해는 되나, 추론·중심문장 파악 연습이 필요해요.' : '짧은 지문 독해부터 단계적 연습이 필요해요.',
      writing:    pct >= 80 ? '문장 구조를 정확하게 조립할 수 있어요.' : pct >= 60 ? '기본 문장 구성은 가능하나, 복잡한 구조 연습이 필요해요.' : '기본 어순과 문장 구조 훈련이 필요해요.',
    };
    return comments[key] || '';
  }

  const sectionRows = hasSections
    ? Object.entries(sectionData).map(([key, stat]) => {
        if (!stat.total) return '';
        const meta = SECTION_META[key] || { ko: key, color: '#555' };
        const pct  = Math.round((stat.correct / stat.total) * 100);
        const comment = sectionComment(key, pct);
        return `<tr>
          <td style="padding:10px 12px;border-bottom:1px solid #E2E8F0;">
            <span style="font-weight:700;color:${meta.color};">${meta.ko}</span>
            <div style="font-size:12px;color:#6B7280;margin-top:3px;">${comment}</div>
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #E2E8F0;text-align:center;white-space:nowrap;">${stat.correct}/${stat.total}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #E2E8F0;text-align:center;">
            <span style="background:${pct >= 70 ? '#D1FAE5' : pct >= 50 ? '#FEF3C7' : '#FEE2E2'};
              color:${pct >= 70 ? '#065F46' : pct >= 50 ? '#92400E' : '#991B1B'};
              padding:2px 8px;border-radius:9999px;font-size:13px;">${pct}%</span>
          </td>
        </tr>`;
      }).join('')
    : Object.entries(mcqResults.byType || {}).map(([type, stat]) => {
        const pct = Math.round((stat.correct / stat.total) * 100);
        const typeKo = { grammar: '문법', vocabulary: '어휘', reading: '독해', writing: '쓰기' };
        return `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;">${typeKo[type] || type}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;text-align:center;">${stat.correct}/${stat.total}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;text-align:center;">
            <span style="background:${pct >= 70 ? '#D1FAE5' : pct >= 50 ? '#FEF3C7' : '#FEE2E2'};
              color:${pct >= 70 ? '#065F46' : pct >= 50 ? '#92400E' : '#991B1B'};
              padding:2px 8px;border-radius:9999px;font-size:13px;">${pct}%</span>
          </td>
        </tr>`;
      }).join('');

  const typeRows = sectionRows; // alias for template below

  const chatBubbles = conversationMessages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => {
      const isAI = m.role === 'assistant';
      return `<div style="margin:8px 0;${isAI ? '' : 'text-align:right;'}">
        <span style="display:inline-block;max-width:80%;padding:10px 14px;border-radius:${isAI ? '4px 16px 16px 16px' : '16px 4px 16px 16px'};
          background:${isAI ? '#EEF2FF' : '#4F46E5'};color:${isAI ? '#1E1B4B' : '#FFFFFF'};
          font-size:14px;line-height:1.5;">
          ${isAI ? '<strong>AI 선생님</strong><br>' : ''}${escapeHtml(m.content)}
        </span>
      </div>`;
    }).join('');

  const scoreBar = (label, score) => {
    const pct = Math.round((score / 10) * 100);
    const color = score >= 7 ? '#4F46E5' : score >= 5 ? '#F59E0B' : '#EF4444';
    return `<div style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
        <span style="font-size:14px;color:#374151;">${label}</span>
        <span style="font-size:14px;font-weight:600;color:${color};">${score}/10</span>
      </div>
      <div style="background:#E5E7EB;border-radius:9999px;height:8px;">
        <div style="background:${color};width:${pct}%;height:8px;border-radius:9999px;"></div>
      </div>
    </div>`;
  };

  const [series, book] = finalLevel.split(' ');
  const seriesColor = series === 'Builder' ? '#10B981' : series === 'Challenger' ? '#4F46E5' : '#F59E0B';

  return `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;">
<tr><td align="center" style="padding:32px 16px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

  <!-- Header -->
  <tr><td style="background:linear-gradient(135deg,#4F46E5 0%,#7C3AED 100%);border-radius:16px 16px 0 0;padding:32px;text-align:center;">
    <p style="margin:0 0 4px;color:#C7D2FE;font-size:13px;letter-spacing:2px;text-transform:uppercase;">SDA삼육잉글랩</p>
    <h1 style="margin:0;color:#FFFFFF;font-size:24px;font-weight:700;">AI 레벨테스트 결과 리포트</h1>
    <p style="margin:8px 0 0;color:#A5B4FC;font-size:13px;">${dateStr}</p>
  </td></tr>

  <!-- Student info -->
  <tr><td style="background:#FFFFFF;padding:24px 32px;border-left:1px solid #E2E8F0;border-right:1px solid #E2E8F0;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:6px 0;color:#6B7280;font-size:14px;width:100px;">이름</td>
        <td style="padding:6px 0;color:#111827;font-size:14px;font-weight:600;">${escapeHtml(studentInfo.name)}</td>
        <td style="padding:6px 0;color:#6B7280;font-size:14px;width:80px;">학년</td>
        <td style="padding:6px 0;color:#111827;font-size:14px;font-weight:600;">${escapeHtml(studentInfo.grade)}</td>
      </tr>
      ${studentInfo.academy ? `<tr>
        <td style="padding:6px 0;color:#6B7280;font-size:14px;">학원</td>
        <td colspan="3" style="padding:6px 0;color:#111827;font-size:14px;font-weight:600;">${escapeHtml(studentInfo.academy)}</td>
      </tr>` : ''}
    </table>
  </td></tr>

  <!-- Final Level Banner -->
  <tr><td style="background:#FFFFFF;padding:0 32px 24px;border-left:1px solid #E2E8F0;border-right:1px solid #E2E8F0;">
    <div style="background:linear-gradient(135deg,${seriesColor}15 0%,${seriesColor}30 100%);border:2px solid ${seriesColor};border-radius:16px;padding:24px;text-align:center;">
      <p style="margin:0 0 8px;color:#374151;font-size:14px;">최종 배치 레벨</p>
      <p style="margin:0;font-size:48px;font-weight:800;color:${seriesColor};">${finalLevel}</p>
      <p style="margin:8px 0 0;color:#6B7280;font-size:13px;">4섹션 적응형 문항 평가 결과</p>
    </div>
  </td></tr>

  <!-- Section 1: MCQ -->
  <tr><td style="background:#FFFFFF;padding:0 32px 24px;border-left:1px solid #E2E8F0;border-right:1px solid #E2E8F0;">
    <h2 style="margin:0 0 16px;font-size:16px;color:#111827;border-left:4px solid #4F46E5;padding-left:12px;">1단계 | 적응형 문항 테스트 (CAT)</h2>
    <p style="margin:0 0 16px;color:#6B7280;font-size:14px;">총 ${mcqResults.total}문항 &nbsp;·&nbsp; 정답 <strong>${mcqResults.correctCount}개</strong> &nbsp;·&nbsp; 정확도 <strong>${acc}%</strong></p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E2E8F0;border-radius:8px;overflow:hidden;">
      <tr style="background:#F9FAFB;">
        <th style="padding:8px 12px;text-align:left;font-size:13px;color:#374151;font-weight:600;border-bottom:1px solid #E2E8F0;">섹션 / 진단</th>
        <th style="padding:8px 12px;text-align:center;font-size:13px;color:#374151;font-weight:600;border-bottom:1px solid #E2E8F0;">정답/문항</th>
        <th style="padding:8px 12px;text-align:center;font-size:13px;color:#374151;font-weight:600;border-bottom:1px solid #E2E8F0;">정확도</th>
      </tr>
      ${typeRows}
    </table>
  </td></tr>

  <!-- Section 2: AI Conversation -->
  <tr><td style="background:#FFFFFF;padding:0 32px 24px;border-left:1px solid #E2E8F0;border-right:1px solid #E2E8F0;">
    <h2 style="margin:0 0 16px;font-size:16px;color:#111827;border-left:4px solid #7C3AED;padding-left:12px;">2단계 | AI 대화 평가</h2>
    ${assessment ? `
    <div style="margin-bottom:20px;">
      ${scoreBar('어휘력 (Vocabulary)', assessment.vocabulary || 5)}
      ${scoreBar('문법 정확도 (Grammar)', assessment.grammar || 5)}
      ${scoreBar('문장 복잡도 (Complexity)', assessment.complexity || 5)}
      ${scoreBar('종합 점수 (Overall)', assessment.overall || 5)}
    </div>` : ''}
    <div style="background:#F8FAFC;border-radius:12px;padding:16px;max-height:300px;overflow-y:auto;">
      ${chatBubbles}
    </div>
  </td></tr>

  <!-- Feedback -->
  <tr><td style="background:#FFFFFF;padding:0 32px 24px;border-left:1px solid #E2E8F0;border-right:1px solid #E2E8F0;">
    <h2 style="margin:0 0 16px;font-size:16px;color:#111827;border-left:4px solid #10B981;padding-left:12px;">종합 피드백</h2>

    ${assessment?.strengths ? `
    <div style="background:#F0FDF4;border-left:4px solid #22C55E;border-radius:0 10px 10px 0;padding:14px 18px;margin-bottom:14px;">
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:0.5px;">✓ 강점 (Strengths)</p>
      <p style="margin:0;font-size:14px;color:#15803D;line-height:1.8;">${escapeHtml(assessment.strengths)}</p>
    </div>` : ''}

    ${assessment?.growth ? `
    <div style="background:#FFF7ED;border-left:4px solid #F97316;border-radius:0 10px 10px 0;padding:14px 18px;margin-bottom:14px;">
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#9A3412;text-transform:uppercase;letter-spacing:0.5px;">→ 보완 영역 (Areas for Growth)</p>
      <p style="margin:0;font-size:14px;color:#C2410C;line-height:1.8;">${escapeHtml(assessment.growth)}</p>
    </div>` : ''}

    ${assessment?.recommendation_ko ? `
    <div style="background:#EFF6FF;border-left:4px solid #3B82F6;border-radius:0 10px 10px 0;padding:14px 18px;margin-bottom:14px;">
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#1D4ED8;text-transform:uppercase;letter-spacing:0.5px;">📚 학습 추천</p>
      <p style="margin:0;font-size:14px;color:#1E40AF;line-height:1.8;">${escapeHtml(assessment.recommendation_ko)}</p>
    </div>` : ''}

    ${assessment?.notes_ko ? `
    <div style="background:#FFFBEB;border-left:4px solid #F59E0B;border-radius:0 10px 10px 0;padding:14px 18px;">
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#92400E;text-transform:uppercase;letter-spacing:0.5px;">📝 선생님 메모</p>
      <p style="margin:0;font-size:14px;color:#78350F;line-height:1.8;">${escapeHtml(assessment.notes_ko)}</p>
    </div>` : ''}
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#F9FAFB;border:1px solid #E2E8F0;border-radius:0 0 16px 16px;padding:20px 32px;text-align:center;">
    <p style="margin:0 0 4px;font-size:12px;color:#9CA3AF;">본 결과는 AI 기반 평가이며, 최종 배치는 담당 선생님의 판단에 따라 조정될 수 있습니다.</p>
    <p style="margin:0;font-size:12px;color:#9CA3AF;">SDA삼육잉글랩 AI 레벨테스트 시스템</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ──────────────────────────────────────────────
//  Admin — 페이지 라우트
// ──────────────────────────────────────────────
app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ──────────────────────────────────────────────
//  Admin — 인증 헬퍼
// ──────────────────────────────────────────────
function adminAuth(req, res) {
  const pw = process.env.ADMIN_PASSWORD || 'englab2024';
  if (req.query.pw !== pw) { res.status(401).json({ error: '비밀번호가 틀렸습니다.' }); return false; }
  return true;
}

// GET /api/admin/results
app.get('/api/admin/results', (req, res) => {
  if (!adminAuth(req, res)) return;
  try { res.json(readJSON(RESULTS_FILE).reverse()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/admin/results/:id
app.delete('/api/admin/results/:id', (req, res) => {
  if (!adminAuth(req, res)) return;
  try {
    writeJSON(RESULTS_FILE, readJSON(RESULTS_FILE).filter(r => String(r.id) !== String(req.params.id)));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/academies
app.get('/api/admin/academies', (req, res) => {
  if (!adminAuth(req, res)) return;
  res.json(readJSON(ACADEMIES_FILE));
});

// POST /api/admin/academies
app.post('/api/admin/academies', (req, res) => {
  if (!adminAuth(req, res)) return;
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: '학원명을 입력해주세요.' });
  const list = readJSON(ACADEMIES_FILE);
  if (list.some(a => a.name === name)) return res.status(400).json({ error: '이미 등록된 학원입니다.' });
  list.push({ id: Date.now(), name, addedAt: new Date().toISOString() });
  writeJSON(ACADEMIES_FILE, list);
  res.json({ ok: true });
});

// DELETE /api/admin/academies/:id
app.delete('/api/admin/academies/:id', (req, res) => {
  if (!adminAuth(req, res)) return;
  const list = readJSON(ACADEMIES_FILE);
  writeJSON(ACADEMIES_FILE, list.filter(a => String(a.id) !== String(req.params.id)));
  res.json({ ok: true });
});

// GET /api/admin/logs
app.get('/api/admin/logs', (req, res) => {
  if (!adminAuth(req, res)) return;
  res.json(readJSON(LOGS_FILE).reverse());
});

// ──────────────────────────────────────────────
//  Start
// ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`\n🎓 SDA삼육잉글랩 AI 레벨테스트`);
  console.log(`   서버 주소: http://localhost:${PORT}`);
  console.log(`   이메일 설정: ${process.env.EMAIL_USER ? '✅ ' + process.env.EMAIL_USER : '❌ 미설정 (.env 파일 확인 필요)'}`);
  console.log(`   결과 수신 이메일: ${process.env.TEACHER_EMAIL || '❌ 미설정'}\n`);
});
