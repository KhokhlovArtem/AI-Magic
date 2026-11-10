import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { curriculum } from '../curriculum.js';
import { createState, startQuiz, currentQuestion, submitAnswer } from '../engine.js';

function correctAnswer(state) {
  const q = currentQuestion(state, curriculum).question;
  return q.type === 'blocks' ? q.correctOrder : q.correct;
}

test('guest cannot earn more than 100 coins, but keeps XP and reward achievement', () => {
  let state = { ...createState(), coins: 100 };
  state = startQuiz(state, curriculum[0], curriculum, 1000, () => 0);
  state = submitAnswer(state, correctAnswer(state), curriculum, 1000, 100);
  assert.equal(state.coins, 100);
  assert.equal(state.xp, 10);
  assert.equal(state.rewards.length, 1);
  assert.equal(state.active.answers[0].coinEarned, false);
});

test('guest earns the hundredth coin and signed-in flow is not capped', () => {
  let state = { ...createState(), coins: 99 };
  state = startQuiz(state, curriculum[0], curriculum, 1000, () => 0);
  state = submitAnswer(state, correctAnswer(state), curriculum, 1000, 100);
  assert.equal(state.coins, 100);
  state = { ...createState(), coins: 100 };
  state = startQuiz(state, curriculum[0], curriculum, 1000, () => 0);
  state = submitAnswer(state, correctAnswer(state), curriculum, 1000);
  assert.equal(state.coins, 101);
});
