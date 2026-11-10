export const STORAGE_KEY = 'ai-magic-v2';
export const LEGACY_KEY = 'ai-magic-v1';
export const ENERGY_LIMIT = 60;
export const REFILL_MS = 8 * 60 * 60 * 1000;
export const QUIZ_SIZE = 5;
const count = n => Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
const levelKey = (skill, level) => `${skill.id}:${level.id}`;
export function createState() {
  return { version: 2, progress: {}, rewards: [], energy: ENERGY_LIMIT, refillAt: null, coins: 0, xp: 0, answered: 0, correct: 0, active: null, history: [] };
}
export function refreshEnergy(state, now = Date.now()) {
  return state.refillAt && now >= state.refillAt ? { ...state, energy: ENERGY_LIMIT, refillAt: null } : state;
}
export function passedLevels(state, skill) {
  return skill.levels.filter(l => state.progress[levelKey(skill, l)]?.passed).length;
}
export function unlocked(state, skill, curriculum) {
  return skill.prerequisites.every(id => {
    const prerequisite = curriculum.find(s => s.id === id);
    return prerequisite && passedLevels(state, prerequisite) >= 1;
  });
}
export function targetLevel(state, skill) {
  return skill.levels.find(l => !state.progress[levelKey(skill, l)]?.passed) || skill.levels.at(-1);
}
export function levelAvailable(state, skill, levelId) {
  const index = skill.levels.findIndex(l => l.id === levelId);
  return index >= 0 && skill.levels.slice(0, index).every(l => state.progress[levelKey(skill, l)]?.passed);
}
export function validResponse(question, choice, allowEmpty = false) {
  if (question.type === 'blocks') {
    return Array.isArray(choice) && (allowEmpty || choice.length > 0) && new Set(choice).size === choice.length && choice.every(id => question.blocks.some(b => b.id === id));
  }
  return Number.isInteger(choice) && choice >= 0 && choice < question.options.length;
}
export function gradeAnswer(question, choice) {
  if (!validResponse(question, choice)) return false;
  return question.type === 'blocks'
    ? choice.length === question.correctOrder.length && choice.every((id, i) => id === question.correctOrder[i])
    : choice === question.correct;
}
export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function startQuiz(state, skill, curriculum, now = Date.now(), random = Math.random, levelId) {
  state = refreshEnergy(state, now);
  if (state.active) throw new Error('Сначала заверши текущий квиз.');
  if (!unlocked(state, skill, curriculum)) throw new Error('Навык пока закрыт.');
  if (state.energy < QUIZ_SIZE) throw new Error('Для квиза нужно 5 энергии.');
  const level = levelId ? skill.levels.find(l => l.id === levelId) : targetLevel(state, skill);
  if (!level || !levelAvailable(state, skill, level.id)) throw new Error('Сначала пройди предыдущий уровень этой темы.');
  if (level.questions.length < QUIZ_SIZE) throw new Error('В этом уровне пока недостаточно вопросов.');
  return { ...state, active: {
    skillId: skill.id, levelId: level.id, index: 0, phase: 'question', startedAt: now,
    questions: shuffle(level.questions, random).slice(0, QUIZ_SIZE).map(q => ({ id: q.id, order: shuffle((q.type === 'blocks' ? q.blocks : q.options).map((_, i) => i), random) })),
    answers: [], drafts: {}, practice: Boolean(state.progress[levelKey(skill, level)]?.passed)
  } };
}
export function currentQuestion(state, curriculum) {
  const active = state.active;
  if (!active) return null;
  const skill = curriculum.find(s => s.id === active.skillId);
  const level = skill?.levels.find(l => l.id === active.levelId);
  const item = active.questions[active.index];
  const question = level?.questions.find(q => q.id === item?.id);
  return { skill, level, question, item, answer: active.answers[active.index] };
}
export function submitAnswer(state, choice, curriculum, now = Date.now(), coinLimit = Infinity) {
  const active = state.active;
  if (!active || active.phase !== 'question' || active.answers[active.index]) return state;
  const { question, level, skill } = currentQuestion(state, curriculum);
  if (!question || !validResponse(question, choice)) return state;
  state = refreshEnergy(state, now);
  if (state.energy < 1) throw new Error('Энергия закончилась. Ответ можно отправить после восстановления.');
  const correct = gradeAnswer(question, choice);
  const earned = correct && !state.rewards.includes(question.id);
  const coinEarned = earned && state.coins < coinLimit;
  const answer = { questionId: question.id, choice, correct, earned, coinEarned };
  const updated = { ...state,
    energy: state.energy - 1, refillAt: state.refillAt || now + REFILL_MS,
    answered: state.answered + 1, correct: state.correct + Number(correct),
    coins: state.coins + Number(coinEarned), xp: state.xp + Number(earned) * 10,
    rewards: earned ? [...state.rewards, question.id] : state.rewards,
    active: { ...active, answers: [...active.answers, answer] }
  };
  // Commit completion with the final answer, so closing or reloading cannot lose it.
  if (updated.active.answers.length === QUIZ_SIZE) {
    const key = levelKey(skill, level);
    const previous = state.progress[key] || {};
    const score = updated.active.answers.filter(a => a.correct).length;
    updated.progress = { ...state.progress, [key]: {
      passed: Boolean(previous.passed || score >= level.passScore),
      best: Math.max(previous.best || 0, score), lastScore: score,
      attempts: (previous.attempts || 0) + 1
    } };
    updated.history = [...state.history, { skillId: skill.id, levelId: level.id, score, date: now }].slice(-30);
  }
  return updated;
}
export function setDraftBlocks(state, blocks, curriculum) {
  if (!state.active || state.active.phase !== 'question') return state;
  const { question, answer } = currentQuestion(state, curriculum);
  if (answer || question?.type !== 'blocks' || !validResponse(question, blocks, true)) return state;
  return { ...state, active: { ...state.active, drafts: { ...state.active.drafts, [question.id]: [...blocks] } } };
}
export function nextQuestion(state) {
  if (!state.active?.answers[state.active.index]) return state;
  return { ...state, active: { ...state.active,
    index: Math.min(QUIZ_SIZE - 1, state.active.index + 1),
    phase: state.active.index === QUIZ_SIZE - 1 ? 'result' : 'question'
  } };
}
export function finishQuiz(state) {
  if (state.active?.phase !== 'result') return state;
  return { ...state, active: null };
}
export function normalizeState(raw, curriculum, now = Date.now()) {
  const state = createState();
  if (!raw || typeof raw !== 'object') return state;
  const legacy = raw.version !== 2;
  for (const key of ['coins', 'xp']) state[key] = count(raw[key]);
  state.answered = count(legacy ? raw.solved : raw.answered);
  state.correct = Math.min(state.answered, count(raw.correct));
  state.energy = Math.min(ENERGY_LIMIT, typeof raw.energy === 'number' ? count(raw.energy) : ENERGY_LIMIT);
  const refill = legacy ? Number(raw.started) + REFILL_MS : raw.refillAt;
  state.refillAt = state.energy < ENERGY_LIMIT ? (Number.isFinite(refill) && refill > 0 ? Math.min(refill, now + REFILL_MS) : now + REFILL_MS) : null;
  const allQuestionIds = new Set(curriculum.flatMap(s => s.levels.flatMap(l => l.questions.map(q => q.id))));
  state.rewards = [...new Set(Array.isArray(raw.rewards) ? raw.rewards.filter(id => allQuestionIds.has(id)) : [])];
  for (const skill of curriculum) {
    for (const [i, level] of skill.levels.entries()) {
      const key = levelKey(skill, level);
      const value = raw.progress?.[key];
      if (legacy && i === 0 && count(raw.levels?.[skill.id]) > 0) {
        state.progress[key] = { passed: true, best: 4, lastScore: null, attempts: 0, migrated: true };
        state.rewards.push(...level.questions.map(q => q.id));
      } else if (value && typeof value === 'object') {
        state.progress[key] = { passed: Boolean(value.passed), best: Math.min(QUIZ_SIZE, count(value.best)), lastScore: value.lastScore == null ? null : Math.min(QUIZ_SIZE, count(value.lastScore)), attempts: count(value.attempts), migrated: Boolean(value.migrated) };
      }
    }
  }
  state.rewards = [...new Set(state.rewards)];
  state.history = Array.isArray(raw.history) ? raw.history.filter(h => h && curriculum.some(s => s.id === h.skillId) && Number.isFinite(h.score) && Number.isFinite(h.date)).slice(-30) : [];
  const a = raw.active;
  if (!legacy && a && ['question', 'result'].includes(a.phase) && Number.isInteger(a.index) && a.index >= 0 && a.index < QUIZ_SIZE) {
    const skill = curriculum.find(s => s.id === a.skillId);
    const level = skill?.levels.find(l => l.id === a.levelId);
    const validQuestions = level && Array.isArray(a.questions) && a.questions.length === QUIZ_SIZE && new Set(a.questions.map(q => q?.id)).size === QUIZ_SIZE && a.questions.every(item => {
      const q = level.questions.find(q => q.id === item?.id);
      const entries = q?.type === 'blocks' ? q.blocks : q?.options;
      return q && Array.isArray(item.order) && item.order.length === entries.length && new Set(item.order).size === item.order.length && item.order.every(i => Number.isInteger(i) && i >= 0 && i < entries.length);
    });
    const validAnswers = validQuestions && Array.isArray(a.answers) && a.answers.length >= a.index && a.answers.length <= Math.min(a.index + 1, QUIZ_SIZE) && a.answers.every((answer, index) => {
      const q = level.questions.find(q => q.id === a.questions[index].id);
      return answer?.questionId === q.id && validResponse(q, answer.choice) && answer.correct === gradeAnswer(q, answer.choice);
    });
    if (validAnswers && (a.phase !== 'result' || a.answers.length === QUIZ_SIZE)) {
      const drafts = Object.fromEntries(level.questions.filter(q => q.type === 'blocks' && validResponse(q, a.drafts?.[q.id], true)).map(q => [q.id, a.drafts[q.id]]));
      state.active = { ...a, drafts };
    }
  }
  return refreshEnergy(state, now);
}
