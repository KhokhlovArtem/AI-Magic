import test from 'node:test';
import assert from 'node:assert/strict';
import { curriculum, chapters } from '../curriculum.js';
import { createState, normalizeState, refreshEnergy, REFILL_MS, startQuiz, submitAnswer, nextQuestion, finishQuiz, currentQuestion, unlocked, passedLevels, levelAvailable, gradeAnswer, setDraftBlocks } from '../engine.js';
import { books, bookCategories } from '../books.js';
const now = 1_700_000_000_000;
const basics = curriculum[0];
const correctResponse = q => q.type === 'blocks' ? [...q.correctOrder] : q.correct;
const incorrectResponse = q => q.type === 'blocks' ? [...q.correctOrder].reverse() : (q.correct + 1) % q.options.length;
function complete(state, skill = basics, score = 5, levelId = 'foundation', time = now) {
  state = startQuiz(state, skill, curriculum, time, () => .37, levelId);
  for (let i = 0; i < 5; i++) {
    const { question } = currentQuestion(state, curriculum);
    state = submitAnswer(state, i < score ? correctResponse(question) : incorrectResponse(question), curriculum, time);
    state = nextQuestion(state);
  }
  return state;
}
test('curriculum IDs, answer keys and dependency graph stay valid as content grows', () => {
  const ids = new Set();
  for (const s of curriculum) {
    assert(!ids.has(s.id)); ids.add(s.id);
    for (const id of s.prerequisites) assert(curriculum.some(p => p.id === id && p.row < s.row));
    assert(s.lesson.points.length > 0);
    for (const l of s.levels) {
      assert(l.questions.length >= 5);
      assert(l.passScore > 0 && l.passScore <= 5);
      for (const q of l.questions) {
        assert(!ids.has(q.id)); ids.add(q.id);
        if (q.type === 'blocks') {
          assert(q.blocks.length >= 3);
          assert.equal(new Set(q.blocks.map(b => b.id)).size, q.blocks.length);
          assert(q.correctOrder.length >= 3);
          assert(q.correctOrder.every(id => q.blocks.some(b => b.id === id)));
          assert.equal(new Set(q.correctOrder).size, q.correctOrder.length);
        } else assert(q.options.length >= 2 && q.correct >= 0 && q.correct < q.options.length);
        assert(q.explanation);
      }
    }
  }
});
test('4/5 passes and each prerequisite is required for the next row', () => {
  let state = complete(createState(), basics, 4);
  assert.equal(passedLevels(state, basics), 1);
  assert(unlocked(state, curriculum[1], curriculum));
  assert(!unlocked(state, curriculum[3], curriculum));
  state = complete(finishQuiz(state), curriculum[1]);
  assert(!unlocked(state, curriculum[3], curriculum));
  state = complete(finishQuiz(state), curriculum[2]);
  assert(unlocked(state, curriculum[3], curriculum));
  assert(unlocked(state, curriculum[4], curriculum));
});
test('3/5 does not pass and a failed practice never revokes mastery', () => {
  assert.equal(passedLevels(complete(createState(), basics, 3), basics), 0);
  const state = complete(finishQuiz(complete(createState())), basics, 0);
  assert.equal(passedLevels(state, basics), 1);
  assert.equal(state.progress['basics:foundation'].best, 5);
});
test('duplicate clicks cannot spend energy or grant rewards twice', () => {
  let state = startQuiz(createState(), basics, curriculum, now);
  const { question } = currentQuestion(state, curriculum);
  state = submitAnswer(state, question.correct, curriculum, now);
  const duplicate = submitAnswer(state, question.correct, curriculum, now);
  assert.equal(duplicate, state);
  assert.equal(state.energy, 59);
  assert.equal(state.coins, 1);
  assert.equal(state.answered, 1);
});
test('repeating identical content does not inflate levels, XP or coins', () => {
  let state = complete(createState());
  state = complete(finishQuiz(state));
  assert.equal(state.coins, 5);
  assert.equal(state.xp, 50);
  assert.equal(state.answered, 10);
  assert.equal(passedLevels(state, basics), 1);
  assert.equal(state.progress['basics:foundation'].attempts, 2);
});
test('an initially incorrect answer can earn its first-correct reward on a later quiz', () => {
  let state = complete(createState(), basics, 3);
  assert.equal(state.coins, 3);
  state = complete(finishQuiz(state));
  assert.equal(state.coins, 5);
});
test('reload preserves randomized questions, options, answer feedback and current position', () => {
  let state = startQuiz(createState(), basics, curriculum, now, () => .2);
  state = submitAnswer(state, currentQuestion(state, curriculum).question.correct, curriculum, now);
  const restored = normalizeState(JSON.parse(JSON.stringify(state)), curriculum, now);
  assert.deepEqual(restored.active, state.active);
  assert.equal(submitAnswer(restored, 0, curriculum, now), restored);
  state = nextQuestion(restored);
  assert.equal(state.active.index, 1);
  assert.equal(state.active.answers.length, 1);
});
test('completion is persisted with the fifth answer, before opening the result page', () => {
  let state = startQuiz(createState(), basics, curriculum, now);
  for (let i = 0; i < 5; i++) {
    state = submitAnswer(state, currentQuestion(state, curriculum).question.correct, curriculum, now);
    if (i < 4) state = nextQuestion(state);
  }
  assert.equal(state.active.phase, 'question');
  state = normalizeState(JSON.parse(JSON.stringify(state)), curriculum, now);
  assert.equal(passedLevels(state, basics), 1);
  assert.equal(state.active.answers.length, 5);
  assert.equal(nextQuestion(state).active.phase, 'result');
});
test('energy timer begins on the first answer and refills once, at eight hours', () => {
  let state = startQuiz(createState(), basics, curriculum, now);
  assert.equal(state.refillAt, null);
  state = submitAnswer(state, currentQuestion(state, curriculum).question.correct, curriculum, now);
  assert.equal(state.refillAt, now + REFILL_MS);
  assert.equal(refreshEnergy(state, now + REFILL_MS - 1).energy, 59);
  state = refreshEnergy(state, now + REFILL_MS);
  assert.equal(state.energy, 60);
  assert.equal(state.refillAt, null);
  assert.throws(() => startQuiz({ ...createState(), energy: 4 }, basics, curriculum, now), /5 энергии/);
});
test('legacy progress migrates without losing achievements or earned balances', () => {
  const state = normalizeState({ levels: { basics: 4 }, energy: 44, started: now, coins: 5, xp: 50, solved: 16, correct: 5 }, curriculum, now);
  assert.equal(passedLevels(state, basics), 1);
  assert.equal(state.coins, 5);
  assert.equal(state.xp, 50);
  assert.equal(state.answered, 16);
  assert.equal(state.energy, 44);
  assert.equal(state.refillAt, now + REFILL_MS);
  assert.equal(state.rewards.length, 5);
});
test('malformed data cannot produce negative energy or restore an invalid quiz', () => {
  const state = normalizeState({ version: 2, energy: -5, correct: 99, answered: 2, rewards: [null, 'invented'], active: { phase: 'question', index: 0, skillId: 'missing' }, history: [null] }, curriculum, now);
  assert.equal(state.energy, 0);
  assert.equal(state.correct, 2);
  assert.equal(state.active, null);
  assert.deepEqual(state.rewards, []);
  assert.deepEqual(state.history, []);
});
test('a new level can be appended without resetting an already passed level', () => {
  const state = finishQuiz(complete(createState()));
  const expanded = structuredClone(curriculum);
  expanded[0].levels.push({ ...expanded[0].levels[0], id: 'next', questions: expanded[0].levels[0].questions.map(q => ({ ...q, id: q.id + '-next' })) });
  const restored = normalizeState(state, expanded, now);
  assert.equal(passedLevels(restored, expanded[0]), 1);
  assert.equal(startQuiz(restored, expanded[0], expanded, now).active.levelId, 'apply');
  assert.equal(restored.coins, state.coins);
});

test('the track has three chapters, eleven skills, 33 levels and 183 authored tasks', () => {
  assert.equal(chapters.length, 3);
  assert.equal(curriculum.length, 11);
  assert.equal(curriculum.flatMap(s => s.levels.flatMap(l => l.questions)).length, 183);
  assert.equal(curriculum.flatMap(s => s.levels).length, 33);
  assert.equal(curriculum.flatMap(s => s.levels.flatMap(l => l.questions)).filter(q => q.type === 'blocks').length, 55);
  for (const chapter of chapters) assert(curriculum.some(s => s.chapter === chapter.id));
  for (const skill of curriculum) assert(chapters.some(c => c.id === skill.chapter));
  for (const skill of curriculum.slice(5)) {
    assert.equal(skill.levels[0].questions.length, 8);
    assert(skill.lesson.sources.length > 0);
    assert(skill.lesson.sources.every(source => source.url.startsWith('https://')));
  }
});

test('level two and three require previous understanding, and passed levels remain replayable', () => {
  let state = createState();
  assert(!levelAvailable(state, basics, 'apply'));
  assert.throws(() => startQuiz(state, basics, curriculum, now, Math.random, 'synthesis'), /предыдущий уровень/);
  state = finishQuiz(complete(state));
  assert(levelAvailable(state, basics, 'apply'));
  assert(!levelAvailable(state, basics, 'synthesis'));
  state = finishQuiz(complete(state, basics, 5, 'apply'));
  assert(levelAvailable(state, basics, 'synthesis'));
  assert.equal(startQuiz(state, basics, curriculum, now, Math.random, 'foundation').active.practice, true);
});

test('all 33 levels are reachable, with refills between sessions', () => {
  let state = createState(), time = now;
  for (const levelId of ['foundation', 'apply', 'synthesis']) {
    for (const skill of curriculum) {
      if (state.energy < 5) { time += REFILL_MS; state = refreshEnergy(state, time); }
      state = finishQuiz(complete(state, skill, 5, levelId, time));
    }
  }
  assert(curriculum.every(s => passedLevels(state, s) === 3));
  assert.equal(state.answered, 165);
  assert.equal(state.correct, 165);
});

function blockSession() {
  let state = finishQuiz(complete(createState()));
  state = startQuiz(state, basics, curriculum, now, () => .37, 'apply');
  while (currentQuestion(state, curriculum).question.type !== 'blocks') {
    state = submitAnswer(state, correctResponse(currentQuestion(state, curriculum).question), curriculum, now);
    state = nextQuestion(state);
  }
  return state;
}

test('a block draft survives reload without spending energy, statistics or rewards', () => {
  let state = blockSession();
  const before = { energy: state.energy, answered: state.answered, coins: state.coins };
  const { question } = currentQuestion(state, curriculum);
  const draft = [question.correctOrder[1], question.correctOrder[0]];
  state = setDraftBlocks(state, draft, curriculum);
  state = normalizeState(JSON.parse(JSON.stringify(state)), curriculum, now);
  assert.deepEqual(state.active.drafts[question.id], draft);
  assert.deepEqual({ energy: state.energy, answered: state.answered, coins: state.coins }, before);
  assert.equal(setDraftBlocks(state, ['not-a-block'], curriculum), state);
  assert.equal(setDraftBlocks(state, [draft[0], draft[0]], curriculum), state);
});

test('block grading requires exactly the right blocks and order, excluding distractors', () => {
  const q = curriculum.find(s => s.id === 'iteration').levels[2].questions.find(q => q.type === 'blocks');
  assert(gradeAnswer(q, q.correctOrder));
  assert(!gradeAnswer(q, [...q.correctOrder].reverse()));
  assert(!gradeAnswer(q, q.correctOrder.slice(0, -1)));
  assert(!gradeAnswer(q, [...q.correctOrder, q.blocks.at(-1).id]));
  assert(!gradeAnswer(q, [q.correctOrder[0], q.correctOrder[0]]));
});

test('submitting blocks spends energy only once, preserves the submitted order and rewards correctly', () => {
  let state = blockSession();
  const q = currentQuestion(state, curriculum).question, energy = state.energy, coins = state.coins;
  state = submitAnswer(state, q.correctOrder, curriculum, now);
  assert.equal(state.energy, energy - 1);
  assert.equal(state.coins, coins + 1);
  assert.equal(submitAnswer(state, q.correctOrder, curriculum, now), state);
  const restored = normalizeState(JSON.parse(JSON.stringify(state)), curriculum, now);
  assert.deepEqual(currentQuestion(restored, curriculum).answer.choice, q.correctOrder);
  assert(currentQuestion(restored, curriculum).answer.correct);
});

test('incorrect block order is a valid failed attempt with no reward', () => {
  let state = blockSession();
  const q = currentQuestion(state, curriculum).question, coins = state.coins;
  state = submitAnswer(state, [...q.correctOrder].reverse(), curriculum, now);
  assert.equal(state.coins, coins);
  assert.equal(currentQuestion(state, curriculum).answer.correct, false);
});

test('the literature list has distinct books, all three subjects and official source links', () => {
  assert.equal(books.length, 10);
  assert.equal(new Set(books.map(b => b.id)).size, books.length);
  assert.equal(bookCategories.length, 3);
  for (const c of bookCategories) assert(books.some(b => b.category === c.id));
  for (const b of books) { assert(b.title && b.author && b.description && b.when); assert(b.url.startsWith('https://')); }
});

test('chapters open in dependency order and both branches are required where specified', () => {
  let state = createState();
  const skill = id => curriculum.find(s => s.id === id);
  for (const s of curriculum.slice(0, 4)) state = finishQuiz(complete(state, s));
  assert(!unlocked(state, skill('training'), curriculum));
  state = finishQuiz(complete(state, skill('privacy')));
  assert(unlocked(state, skill('training'), curriculum));
  assert(!unlocked(state, skill('context'), curriculum));
  state = finishQuiz(complete(state, skill('training')));
  assert(unlocked(state, skill('context'), curriculum));
  assert(unlocked(state, skill('tools'), curriculum));
  state = finishQuiz(complete(state, skill('context')));
  assert(!unlocked(state, skill('goals'), curriculum));
  state = finishQuiz(complete(state, skill('tools')));
  assert(unlocked(state, skill('goals'), curriculum));
  state = finishQuiz(complete(state, skill('goals')));
  assert(unlocked(state, skill('examples'), curriculum));
  assert(unlocked(state, skill('iteration'), curriculum));
  state = finishQuiz(complete(state, skill('examples')));
  state = finishQuiz(complete(state, skill('iteration')));
  assert(curriculum.every(s => passedLevels(state, s) === 1));
  assert.equal(state.energy, 5);
});

test('adding new chapters preserves a v2 save, reward IDs and an unfinished original quiz', () => {
  let state = finishQuiz(complete(createState()));
  state = startQuiz(state, curriculum[1], curriculum, now, () => .2);
  state = submitAnswer(state, currentQuestion(state, curriculum).question.correct, curriculum, now);
  const previousSave = JSON.parse(JSON.stringify(state));
  const restored = normalizeState(previousSave, curriculum, now);
  assert.deepEqual(restored.active, previousSave.active);
  assert.deepEqual(restored.rewards, previousSave.rewards);
  assert.equal(restored.coins, previousSave.coins);
  assert.equal(restored.xp, previousSave.xp);
  assert.equal(passedLevels(restored, basics), 1);
  assert.equal(passedLevels(restored, curriculum[5]), 0);
});

test('the expanded bank yields five unique questions, varied subsets and valid option permutations', () => {
  let state = createState();
  for (const s of curriculum.slice(0, 5)) state = finishQuiz(complete(state, s));
  const a = startQuiz(state, curriculum[5], curriculum, now, () => .1).active;
  const b = startQuiz(state, curriculum[5], curriculum, now, () => .9).active;
  assert.equal(a.questions.length, 5);
  assert.equal(new Set(a.questions.map(q => q.id)).size, 5);
  assert.notDeepEqual(new Set(a.questions.map(q => q.id)), new Set(b.questions.map(q => q.id)));
  for (const q of a.questions) assert.deepEqual([...q.order].sort(), [0, 1, 2]);
});
