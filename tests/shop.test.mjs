import test from 'node:test';
import assert from 'node:assert/strict';
import { curriculum, chapters } from '../curriculum.js';
import { shopItems, hasChapterPass } from '../shop.js';
import { createState, normalizeState, purchaseChapter, chapterAvailable, unlocked, missingPrerequisites, startQuiz, submitAnswer, currentQuestion, nextQuestion, finishQuiz } from '../engine.js';

const now = 1_700_000_000_000;
const skill = id => curriculum.find(skill => skill.id === id);
function pass(state, id) {
  state = startQuiz(state, skill(id), curriculum, now);
  for (let i = 0; i < 5; i++) {
    const { question } = currentQuestion(state, curriculum);
    state = submitAnswer(state, question.type === 'blocks' ? question.correctOrder : question.correct, curriculum, now);
    state = nextQuestion(state);
  }
  return finishQuiz(state);
}

test('shop prices identify existing chapters without changing the one-coin reward economy', () => {
  assert.deepEqual(shopItems.map(item => [item.chapterId, item.price]), [['models', 200], ['results', 300]]);
  assert.equal(new Set(shopItems.map(item => item.id)).size, shopItems.length);
  assert(shopItems.every(item => chapters.some(chapter => chapter.id === item.chapterId)));
  assert.equal(pass(createState(), 'basics').coins, 5);
});

test('insufficient funds and unknown items cannot change balances or game state', () => {
  const state = { ...createState(), coins: 199 };
  const before = structuredClone(state);
  assert.throws(() => purchaseChapter(state, 'chapter-models', curriculum, now), /Недостаточно монет/);
  assert.throws(() => purchaseChapter(state, 'missing', curriculum, now), /недоступен/);
  assert.throws(() => purchaseChapter({ ...state, coins: NaN }, 'chapter-models', curriculum, now), /Недостаточно монет/);
  assert.deepEqual(state, before);
});

test('a purchase charges exactly once and preserves progress, energy and an active quiz', () => {
  let state = startQuiz({ ...createState(), coins: 200 }, skill('basics'), curriculum, now, () => .3);
  state = submitAnswer(state, currentQuestion(state, curriculum).question.correct, curriculum, now);
  const before = structuredClone(state);
  const bought = purchaseChapter(state, 'chapter-models', curriculum, now);
  assert.equal(bought.coins, before.coins - 200);
  assert.deepEqual(bought.purchases, [{ itemId: 'chapter-models', price: 200, purchasedAt: now }]);
  for (const field of ['progress', 'energy', 'refillAt', 'xp', 'rewards', 'active', 'answered', 'correct', 'history']) assert.deepEqual(bought[field], before[field]);
  assert.equal(purchaseChapter(bought, 'chapter-models', curriculum, now + 1), bought);
  assert.deepEqual(state, before);
  const restored = normalizeState(JSON.parse(JSON.stringify(bought)), curriculum, now);
  assert.equal(restored.coins, bought.coins);
  assert.deepEqual(restored.purchases, bought.purchases);
  assert.deepEqual(restored.active, bought.active);
});

test('exactly 200 coins opens chapter 02 at a zero balance', () => {
  const state = purchaseChapter({ ...createState(), coins: 200 }, 'chapter-models', curriculum, now);
  assert.equal(state.coins, 0);
  assert(hasChapterPass(state, 'models'));
  assert(chapterAvailable(state, 'models', curriculum));
  assert.equal(startQuiz(state, skill('training'), curriculum, now).active.skillId, 'training');
});

test('early access bypasses only outside dependencies, retaining topic and understanding order', () => {
  let state = purchaseChapter({ ...createState(), coins: 200 }, 'chapter-models', curriculum, now);
  assert(unlocked(state, skill('training'), curriculum));
  assert(!unlocked(state, skill('context'), curriculum));
  assert.deepEqual(missingPrerequisites(state, skill('context'), curriculum), ['training']);
  assert(!unlocked(state, skill('goals'), curriculum));
  assert.throws(() => startQuiz(state, skill('training'), curriculum, now, Math.random, 'apply'), /предыдущий уровень/);
  state = pass(state, 'training');
  assert(unlocked(state, skill('context'), curriculum));
  assert(unlocked(state, skill('tools'), curriculum));
  assert(!unlocked(state, skill('goals'), curriculum));
  assert.equal(Object.keys(state.progress).length, 1);
});

test('chapter 03 has independent access for 300, with its internal prerequisites retained', () => {
  let state = purchaseChapter({ ...createState(), coins: 300 }, 'chapter-results', curriculum, now);
  assert.equal(state.coins, 0);
  assert(unlocked(state, skill('goals'), curriculum));
  assert(!unlocked(state, skill('training'), curriculum));
  assert(!unlocked(state, skill('examples'), curriculum));
  state = pass(state, 'goals');
  assert(unlocked(state, skill('examples'), curriculum));
  assert(unlocked(state, skill('iteration'), curriculum));
});

test('two different passes cost 500 in either order and survive reload', () => {
  for (const ids of [['chapter-models', 'chapter-results'], ['chapter-results', 'chapter-models']]) {
    let state = { ...createState(), coins: 500 };
    for (const id of ids) state = purchaseChapter(state, id, curriculum, now);
    state = normalizeState(JSON.parse(JSON.stringify(state)), curriculum, now);
    assert.equal(state.coins, 0);
    assert.equal(state.purchases.length, 2);
    assert(chapterAvailable(state, 'models', curriculum));
    assert(chapterAvailable(state, 'results', curriculum));
  }
});

test('learning still opens chapters for free and prevents unnecessary purchases', () => {
  let state = createState();
  for (const id of ['basics', 'prompt', 'limits', 'verify', 'privacy']) state = pass(state, id);
  assert(chapterAvailable(state, 'models', curriculum));
  const before = { ...state, coins: 700 };
  assert.equal(purchaseChapter(before, 'chapter-models', curriculum, now), before);
  assert.deepEqual(before.purchases, []);
  for (const id of ['training', 'context', 'tools']) state = pass(state, id);
  assert(chapterAvailable(state, 'results', curriculum));
  assert.equal(purchaseChapter(state, 'chapter-results', curriculum, now), state);
});

test('old v2 and legacy saves keep balances and achievements without invented purchases', () => {
  const old = structuredClone(pass(createState(), 'basics'));
  delete old.purchases;
  const restored = normalizeState(old, curriculum, now);
  for (const [key, value] of Object.entries(old.progress)) {
    const { migrated, ...achievement } = restored.progress[key];
    assert.deepEqual(achievement, value);
  }
  assert.deepEqual(restored.purchases, []);
  assert.equal(restored.coins, old.coins);
  assert(!chapterAvailable(restored, 'models', curriculum));
  const legacy = normalizeState({ levels: { basics: 1 }, coins: 37, xp: 100 }, curriculum, now);
  assert.equal(legacy.coins, 37);
  assert.deepEqual(legacy.purchases, []);
});

test('purchase normalization discards malformed and duplicate records but preserves the price paid', () => {
  const valid = { itemId: 'chapter-models', price: 175, purchasedAt: now };
  const restored = normalizeState({ ...createState(), coins: 25, purchases: [
    null, {}, { ...valid, price: -200 }, { ...valid, purchasedAt: NaN }, { ...valid, itemId: 'missing' }, valid, { ...valid, price: 200 }
  ] }, curriculum, now);
  assert.deepEqual(restored.purchases, [valid]);
  assert.equal(restored.coins, 25);
  assert(hasChapterPass(restored, 'models'));
  assert.deepEqual(normalizeState({ ...createState(), purchases: {} }, curriculum, now).purchases, []);
});
