import { curriculum, chapters } from './curriculum.js';
import { icon } from './icons.js';
import { STORAGE_KEY, LEGACY_KEY, createState, normalizeState, refreshEnergy, unlocked, passedLevels, targetLevel, levelAvailable, startQuiz, submitAnswer, currentQuestion, nextQuestion, finishQuiz, setDraftBlocks } from './engine.js';
const $ = selector => document.querySelector(selector);
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const skillById = id => curriculum.find(s => s.id === id);
let state = createState(), view = null;
let signedIn = false;
window.addEventListener('ai-magic-auth', event => { signedIn = event.detail.signedIn; });
function notice(text) { $('#notice').hidden = false; $('#notice').textContent = text; }
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch { notice('Сохранение недоступно: прогресс останется до закрытия страницы.'); $('.save-info p').textContent = 'Браузер не разрешил сохранить эту сессию.'; }
}
try {
  const saved = localStorage.getItem(STORAGE_KEY), legacy = saved ? null : localStorage.getItem(LEGACY_KEY);
  state = normalizeState(JSON.parse(saved || legacy || 'null'), curriculum);
  if (legacy) notice('Прежний прогресс перенесён. Зачтённые навыки сохраняются как первый уровень понимания.');
  persist();
} catch { notice('Не удалось прочитать сохранение. Прежняя запись не удалена; начата новая сессия.'); }
const openChapters = new Set([skillById(state.active?.skillId)?.chapter || curriculum.find(s => unlocked(state, s, curriculum) && !passedLevels(state, s))?.chapter || chapters[0].id]);
function commit(reducer) { state = reducer(state); persist(); render(); }
function refillText() {
  if (!state.refillAt) return 'Энергия полная';
  const minutes = Math.max(1, Math.ceil((state.refillAt - Date.now()) / 60000));
  return `До 60 через ${Math.floor(minutes / 60)} ч ${String(minutes % 60).padStart(2, '0')} мин`;
}
function balances() { $('#energy').textContent = state.energy; $('#coins').textContent = state.coins; $('#refill').textContent = refillText(); }
function openChapter(id, focus = false) {
  openChapters.add(id);
  const details = $(`[data-chapter-panel="${id}"]`);
  if (details) { details.open = true; if (focus) { details.querySelector('summary').focus(); details.scrollIntoView({ block: 'start', behavior: 'auto' }); } }
  requestAnimationFrame(drawConnections);
}
function renderNode(s) {
  const available = unlocked(state, s, curriculum), count = passedLevels(state, s), active = state.active?.skillId === s.id;
  const status = active ? 'Продолжить квиз' : count === s.levels.length ? 'Все уровни пройдены' : available ? `Доступен уровень ${count + 1}` : 'Нужны предыдущие навыки';
  return `<button class="node ${count === 3 ? 'done' : available ? 'ready' : 'locked'}" data-skill="${s.id}" aria-label="${esc(s.name)}, ${count} из 3, ${status}"><span class="orb"><span class="orb-inner">${icon(s.icon)}</span><span class="node-badge" aria-hidden="true">${count || (available ? '•' : '−')}</span></span><span class="node-label"><span class="node-name">${esc(s.name)}</span><span class="node-levels" aria-hidden="true">${s.levels.map((l, i) => `<i class="${state.progress[`${s.id}:${l.id}`]?.passed ? 'passed' : ''}">${i + 1}</i>`).join('')}</span><span class="node-status">${status}</span></span></button>`;
}
function render() {
  balances();
  const total = curriculum.reduce((n, s) => n + s.levels.length, 0), passed = curriculum.reduce((n, s) => n + passedLevels(state, s), 0);
  const questionCount = curriculum.reduce((n, s) => n + s.levels.reduce((m, l) => m + l.questions.length, 0), 0);
  $('#trackProgress').textContent = `${chapters.length} главы · ${curriculum.length} тем · ${total} уровня · ${questionCount} задания · пройдено ${passed} из ${total}`;
  $('#chapters').innerHTML = chapters.map((chapter, index) => {
    const skills = curriculum.filter(s => s.chapter === chapter.id), n = skills.reduce((sum, s) => sum + passedLevels(state, s), 0);
    const rows = [...new Set(skills.map(s => s.row))].sort((a, b) => a - b);
    return `<details class="chapter-panel" data-chapter-panel="${chapter.id}" ${openChapters.has(chapter.id) ? 'open' : ''}><summary><span class="eyebrow">Глава ${String(index + 1).padStart(2, '0')}</span><span class="chapter-title">${esc(chapter.title)}<span class="chevron" aria-hidden="true">⌃</span></span><span class="chapter-subtitle">${esc(chapter.subtitle)}</span><span class="chapter-progress">Уровни ${n} / ${skills.length * 3}</span></summary><div class="chapter-body"><p class="chapter-goal">${esc(chapter.goal)}</p><div class="legend"><span><i class="legend-dot ready"></i>Доступно</span><span><i class="legend-dot done"></i>3 уровня пройдены</span><span><i class="legend-dot locked"></i>Закрыто</span></div><div class="tree chapter-tree"><svg class="connections" aria-hidden="true"></svg>${rows.map(row => `<div class="skill-row">${skills.filter(s => s.row === row).map(renderNode).join('')}</div>`).join('')}</div><div class="board-foot"><span aria-hidden="true">✦</span><p>Первого уровня достаточно для открытия следующих тем. Уровни 2 и 3 углубляют понимание.</p></div></div></details>`;
  }).join('');
  document.querySelectorAll('[data-chapter-panel]').forEach(details => details.addEventListener('toggle', () => {
    if (details.open) openChapters.add(details.dataset.chapterPanel); else openChapters.delete(details.dataset.chapterPanel);
    requestAnimationFrame(drawConnections);
  }));
  $('#route').innerHTML = chapters.map((chapter, index) => {
    const skills = curriculum.filter(s => s.chapter === chapter.id), n = skills.reduce((sum, s) => sum + passedLevels(state, s), 0);
    return `<button class="route-item ${skills.some(s => unlocked(state, s, curriculum)) ? 'available' : ''}" data-chapter="${chapter.id}"><span class="step-number">${String(index + 1).padStart(2, '0')}</span><span>${esc(chapter.title)}<small>${n} из ${skills.length * 3} уровней</small></span></button>`;
  }).join('');
  $('#stats').innerHTML = [...new Set(curriculum.map(s => s.group))].map(group => {
    const skills = curriculum.filter(s => s.group === group), n = skills.reduce((sum, s) => sum + passedLevels(state, s), 0), max = skills.length * 3;
    return `<div class="stat"><div class="stat-line"><span>${group}</span><strong>${n} / ${max}</strong></div><div class="bar" role="progressbar" aria-label="${group}" aria-valuenow="${n}" aria-valuemin="0" aria-valuemax="${max}"><i style="width:${n / max * 100}%"></i></div></div>`;
  }).join('');
  $('#answered').textContent = state.answered; $('#accuracy').textContent = state.answered ? `${Math.round(state.correct / state.answered * 100)}%` : '—'; $('#xp').textContent = state.xp;
  const next = curriculum.find(s => unlocked(state, s, curriculum) && passedLevels(state, s) === 0) || curriculum.find(s => unlocked(state, s, curriculum) && passedLevels(state, s) < s.levels.length);
  if (state.active) {
    $('#recTitle').textContent = skillById(state.active.skillId).name;
    $('#recText').textContent = state.active.phase === 'result' ? 'Результат сохранён. Посмотри разбор.' : `Попытка сохранена: вопрос ${state.active.index + 1} из 5.`;
    $('#recButton').textContent = state.active.phase === 'result' ? 'Посмотреть результат →' : 'Продолжить квиз →'; $('#recButton').onclick = () => showQuiz();
  } else if (next) {
    $('#recTitle').textContent = next.name; $('#recText').textContent = `Уровень ${next.levels.indexOf(targetLevel(state, next)) + 1}: ${targetLevel(state, next).name}. ${next.lesson.goal}`;
    $('#recButton').textContent = 'Изучить тему →'; $('#recButton').onclick = () => showSkill(next.id);
  } else {
    $('#recTitle').textContent = 'Все уровни пройдены!'; $('#recText').textContent = 'Повторяй сложные темы и выбирай книги в литературе.';
    $('#recButton').textContent = 'Повторить основы →'; $('#recButton').onclick = () => showSkill(curriculum[0].id, 'foundation');
  }
  requestAnimationFrame(drawConnections);
}
function drawConnections() {
  document.querySelectorAll('.chapter-tree').forEach(tree => {
    const svg = tree.querySelector('svg'), root = tree.getBoundingClientRect();
    if (!root.width || !root.height) return;
    svg.setAttribute('viewBox', `0 0 ${root.width} ${root.height}`);
    const chapterId = tree.closest('details').dataset.chapterPanel;
    svg.innerHTML = curriculum.filter(s => s.chapter === chapterId).flatMap(s => s.prerequisites.map(id => {
      const parent = tree.querySelector(`[data-skill="${id}"]`), child = tree.querySelector(`[data-skill="${s.id}"] .orb`);
      if (!parent || !child) return '';
      const a = parent.getBoundingClientRect(), b = child.getBoundingClientRect();
      const x1 = a.x + a.width / 2 - root.x, y1 = a.bottom + 6 - root.y, x2 = b.x + b.width / 2 - root.x, y2 = b.top - 7 - root.y, mid = (y1 + y2) / 2;
      return `<path class="${unlocked(state, s, curriculum) ? '' : 'closed'}" d="M${x1} ${y1} C${x1} ${mid},${x2} ${mid},${x2} ${y2}"/>`;
    })).join('');
  });
}
new ResizeObserver(drawConnections).observe($('#chapters'));
$('#chapters').addEventListener('click', e => { const node = e.target.closest('[data-skill]'); if (node) showSkill(node.dataset.skill); });
$('#route').addEventListener('click', e => { const button = e.target.closest('[data-chapter]'); if (button) openChapter(button.dataset.chapter, true); });
const dialog = $('#dialog');
const heading = text => `<h2 class="dialog-title" id="dialog-title" tabindex="-1">${esc(text)}</h2>`;
function show(content, kind, skillId, levelId, focus = true) {
  view = { kind, skillId, levelId }; $('#dialogContent').innerHTML = content;
  if (!dialog.open) dialog.showModal();
  if (focus) { dialog.scrollTop = 0; $('#dialog-title')?.focus({ preventScroll: true }); }
}
function closeDialog() { dialog.close(); view = null; render(); }
$('#closeDialog').onclick = closeDialog;
dialog.addEventListener('cancel', () => { view = null; render(); });
dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeDialog(); } });
function showSkill(id, levelId, fromQuiz = false) {
  const skill = skillById(id); openChapter(skill.chapter);
  if (!unlocked(state, skill, curriculum)) {
    const missing = skill.prerequisites.map(skillById).filter(s => !passedLevels(state, s));
    show(`<p class="dialog-eyebrow">Следующая цель</p>${heading(skill.name)}<p class="dialog-copy">${esc(skill.lesson.goal)}</p><p class="dialog-copy">Сначала пройди первый уровень этих тем:</p><div class="dependency-list">${missing.map(s => `<button class="secondary" data-dependency="${s.id}">${esc(s.name)} →</button>`).join('')}</div>`, 'locked', id);
    dialog.querySelectorAll('[data-dependency]').forEach(b => b.onclick = () => showSkill(b.dataset.dependency)); return;
  }
  if (state.active?.skillId === id && !levelId && !fromQuiz) { showQuiz(); return; }
  const level = skill.levels.find(l => l.id === levelId) || targetLevel(state, skill), index = skill.levels.indexOf(level), progress = state.progress[`${id}:${level.id}`];
  const available = levelAvailable(state, skill, level.id);
  show(`<p class="dialog-eyebrow">${esc(skill.group)} / Уровень ${index + 1} из 3</p>${heading(skill.name)}<div class="level-picker" aria-label="Уровни понимания">${skill.levels.map((l, i) => `<button data-level="${l.id}" class="level-choice ${l.id === level.id ? 'selected' : ''}" aria-pressed="${l.id === level.id}"><strong>${state.progress[`${id}:${l.id}`]?.passed ? '✓' : i + 1}</strong><span>${esc(l.name)}</span><small>${levelAvailable(state, skill, l.id) ? l.difficulty : 'Сначала уровень ' + i}</small></button>`).join('')}</div><p class="dialog-copy">${esc(level.intro)}</p><details class="lesson" open><summary>Теория и пример</summary><div class="lesson-body"><ul>${skill.lesson.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul><div class="example"><strong>Пример</strong>${esc(skill.lesson.example)}</div>${skill.lesson.sources?.length ? `<p class="lesson-sources">Подробнее: ${skill.lesson.sources.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a>`).join(' · ')}</p>` : ''}</div></details>${progress ? `<div class="stats-inline"><span>Лучший результат <strong>${progress.migrated && !progress.attempts ? 'Зачтено ранее' : progress.best + ' / 5'}</strong></span><span>Квизов <strong>${progress.attempts}</strong></span></div>` : ''}<div class="quiz-facts"><span>5 из ${level.questions.length} заданий</span><span>${esc(level.difficulty)} сложность</span><span>5 энергии</span></div>${state.active ? `<p class="dialog-copy">Сохранён квиз «${esc(skillById(state.active.skillId).name)}». Сначала заверши его.</p><button class="primary full" id="resume">Продолжить сохранённый квиз →</button>` : !available ? `<p class="unlock-message">Этот уровень откроется после зачёта предыдущего уровня этой темы.</p>` : `<button class="primary full" id="start" ${state.energy < 5 ? 'disabled' : ''}>${progress?.passed ? 'Повторить уровень' : 'Начать уровень ' + (index + 1)} →</button>${state.energy < 5 ? `<p class="dialog-note">Нужно 5 энергии. ${refillText()}.</p>` : ''}`}<p class="dialog-note">Для зачёта — 4 из 5. Ошибки в повторном квизе не отменяют зачёт. Награда за первый правильный ответ на задание: 1 монета и 10 XP.</p>`, 'skill', id, level.id);
  dialog.querySelectorAll('[data-level]').forEach(b => b.onclick = () => showSkill(id, b.dataset.level, true));
  if ($('#resume')) $('#resume').onclick = () => showQuiz();
  if ($('#start')) $('#start').onclick = () => { try { commit(s => startQuiz(s, skill, curriculum, Date.now(), Math.random, level.id)); showQuiz(); } catch (e) { notice(e.message); showSkill(id, level.id); } };
}
const solution = q => q.type === 'blocks' ? q.correctOrder.map(id => q.blocks.find(b => b.id === id).text).join(' → ') : q.options[q.correct];
const responseText = (q, choice) => q.type === 'blocks' ? choice.map(id => q.blocks.find(b => b.id === id).text).join(' → ') : q.options[choice];
function blockQuestion(q, item, answer) {
  const chosen = answer ? answer.choice : state.active.drafts?.[q.id] || [], complete = chosen.length === q.correctOrder.length;
  return `<p class="dialog-copy">Собери ${q.correctOrder.length} ${q.correctOrder.length < 5 ? 'блока' : 'блоков'} в правильном порядке. Лишние блоки оставь внизу.</p><p class="block-count" role="status">Собрано ${chosen.length} из ${q.correctOrder.length}</p><ol class="block-selection" id="selectedBlocks">${chosen.map((id, i) => `<li><span>${esc(q.blocks.find(b => b.id === id).text)}</span>${answer ? '' : `<span class="block-controls"><button data-shift="-1" data-index="${i}" aria-label="Поднять блок ${i + 1}" ${i === 0 ? 'disabled' : ''}>↑</button><button data-shift="1" data-index="${i}" aria-label="Опустить блок ${i + 1}" ${i === chosen.length - 1 ? 'disabled' : ''}>↓</button><button data-remove="${i}" aria-label="Убрать блок ${i + 1}">×</button></span>`}</li>`).join('')}</ol>${!chosen.length ? '<p class="empty-blocks">Нажимай на блоки ниже — они появятся здесь.</p>' : ''}${answer ? '' : `<div class="block-pool">${item.order.map(i => q.blocks[i]).filter(b => !chosen.includes(b.id)).map(b => `<button class="block-option" data-add="${b.id}" ${chosen.length >= q.correctOrder.length ? 'disabled' : ''}>+ ${esc(b.text)}</button>`).join('')}</div><button class="primary full" id="checkBlocks" ${complete ? '' : 'disabled'}>Проверить сборку</button><p class="dialog-note">Переставляй шаги стрелками; × возвращает блок в набор. Энергия списывается только после проверки.</p>`}`;
}
function showQuiz(focus = true) {
  if (!state.active) { closeDialog(); return; }
  openChapter(skillById(state.active.skillId).chapter);
  if (state.active.phase === 'result') { showResult(); return; }
  const active = state.active, { skill, level, question: q, item, answer } = currentQuestion(state, curriculum);
  const body = q.type === 'blocks' ? blockQuestion(q, item, answer) : `<div class="answers">${item.order.map((choice, i) => `<button class="answer ${answer ? choice === q.correct ? 'correct' : choice === answer.choice ? 'wrong' : '' : ''}" data-choice="${choice}" ${answer ? 'disabled' : ''}><span class="letter" aria-hidden="true">${answer && choice === q.correct ? '✓' : answer && choice === answer.choice ? '×' : String.fromCharCode(65 + i)}</span><span>${esc(q.options[choice])}</span></button>`).join('')}</div>`;
  show(`<p class="dialog-eyebrow">${esc(skill.name)} / ${esc(level.name)}</p><div class="quiz-progress" aria-label="Задание ${active.index + 1} из 5">${active.questions.map((_, i) => `<i class="${active.answers[i] ? active.answers[i].correct ? 'correct' : 'wrong' : i === active.index ? 'current' : ''}"></i>`).join('')}</div><p class="dialog-note">Задание ${active.index + 1} из 5 · ${state.energy} энергии · ${q.type === 'blocks' ? 'Сборка из блоков' : 'Выбор ответа'}</p>${heading(q.text)}${body}${answer ? `<div class="feedback ${answer.correct ? '' : 'wrong'}" role="status"><strong>${answer.correct ? 'Верно!' : 'Разберём решение'}</strong>${esc(q.explanation)}${!answer.correct ? `<p>Верное решение: ${esc(solution(q))}</p>` : ''}<p class="dialog-note">${answer.earned ? '+1 монета · +10 XP' : answer.correct ? 'Награда за это задание уже получена.' : 'Награда не начислена.'}</p></div><button class="primary full" id="next">${active.index === 4 ? 'Посмотреть результат' : 'Следующее задание →'}</button>` : '<p class="dialog-note">Одно отправленное решение на задание. Можно закрыть окно — попытка сохранится.</p>'}<button class="link-button quiz-theory" id="theory">Вернуться к теории</button>`, 'quiz', skill.id, level.id, focus);
  if (answer?.earned && answer.coinEarned === false) dialog.querySelector('.feedback .dialog-note').textContent = '+10 XP · достигнут лимит гостевых монет.';
  function submit(choice) {
    try {
      commit(s => s.active?.startedAt === active.startedAt && currentQuestion(s, curriculum)?.question.id === q.id ? submitAnswer(s, choice, curriculum, Date.now(), signedIn ? Infinity : 100) : s);
      if (!signedIn && state.coins >= 100) notice('Без входа можно заработать не более 100 монет. Войдите в аккаунт, чтобы продолжить.');
      showQuiz(); $('#next')?.focus();
    } catch (e) { notice(e.message); }
  }
  dialog.querySelectorAll('[data-choice]').forEach(b => b.onclick = () => submit(Number(b.dataset.choice)));
  function editDraft(next, focusSelector) {
    commit(s => setDraftBlocks(s, next, curriculum)); showQuiz(false);
    const target = dialog.querySelector(focusSelector);
    (target && !target.disabled ? target : dialog.querySelector('#selectedBlocks button:not(:disabled)'))?.focus({ preventScroll: true });
  }
  if (q.type === 'blocks' && !answer) {
    const draft = active.drafts?.[q.id] || [];
    dialog.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { const next = [...draft, b.dataset.add]; editDraft(next, next.length === q.correctOrder.length ? '#checkBlocks' : '.block-option:not(:disabled)'); });
    dialog.querySelectorAll('[data-remove]').forEach(b => b.onclick = () => editDraft(draft.filter((_, i) => i !== Number(b.dataset.remove)), '.block-option:not(:disabled)'));
    dialog.querySelectorAll('[data-shift]').forEach(b => b.onclick = () => { const next = [...draft], i = Number(b.dataset.index), j = i + Number(b.dataset.shift); [next[i], next[j]] = [next[j], next[i]]; editDraft(next, `[data-index="${j}"][data-shift="${b.dataset.shift}"]`); });
    $('#checkBlocks').onclick = () => submit([...draft]);
  }
  if ($('#next')) $('#next').onclick = () => { commit(nextQuestion); showQuiz(); };
  $('#theory').onclick = () => showSkill(skill.id, level.id, true);
}
function showResult() {
  const active = state.active, { skill, level } = currentQuestion(state, curriculum), index = skill.levels.indexOf(level);
  const score = active.answers.filter(a => a.correct).length, passed = score >= level.passScore, wrong = active.answers.filter(a => !a.correct), earned = active.answers.filter(a => a.earned).length;
  const newlyAvailable = !active.practice && passed && index === 0 ? curriculum.filter(s => s.prerequisites.includes(skill.id) && unlocked(state, s, curriculum) && !passedLevels(state, s)) : [];
  show(`<p class="dialog-eyebrow">${esc(skill.name)} / Уровень ${index + 1}</p>${heading(passed ? active.practice ? 'Знания закреплены!' : `Уровень ${index + 1} пройден!` : 'Продолжим практику')}<div class="score">${score}<small>/ 5 верных решений</small></div><p class="dialog-copy">${passed ? active.practice ? 'Повторение помогает закрепить материал.' : index < 2 ? `Открыт уровень ${index + 2}: ${skill.levels[index + 1].name}.` : 'Все три уровня этой темы освоены!' : active.practice ? 'Прежний зачёт сохраняется. Разбери ошибки.' : 'Для зачёта нужно 4 из 5. Вернись к теории и разбери ошибки.'}</p>${newlyAvailable.length ? `<p class="unlock-message">Открыты темы: ${newlyAvailable.map(s => esc(s.name)).join(', ')}.</p>` : ''}<div class="quiz-facts"><span>Монеты: +${earned}</span><span>+${earned * 10} XP</span><span>−5 энергии</span></div>${wrong.length ? `<div class="review"><h3>Разбор ошибок · ${wrong.length}</h3>${wrong.map(a => { const q = level.questions.find(q => q.id === a.questionId); return `<div class="review-item"><strong>${esc(q.text)}</strong><p class="wrong-text">Твой ответ: ${esc(responseText(q, a.choice))}</p><p class="right-text">Верное решение: ${esc(solution(q))}</p><p>${esc(q.explanation)}</p></div>`; }).join('')}</div>` : '<p class="dialog-copy">Все решения верные. Отличная работа!</p>'}<div class="dialog-actions"><button class="secondary" id="revisit">${passed && index < 2 ? 'К следующему уровню' : 'Вернуться к теме'}</button><button class="primary" id="finish">К дереву навыков →</button></div>`, 'result', skill.id, level.id);
  dialog.querySelector('.quiz-facts span').textContent = `Монеты: +${active.answers.filter(a => a.coinEarned ?? a.earned).length}`;
  $('#finish').onclick = () => { commit(finishQuiz); closeDialog(); };
  $('#revisit').onclick = () => { commit(finishQuiz); showSkill(skill.id, passed && index < 2 ? skill.levels[index + 1].id : level.id); };
}
function showRules() {
  show(`<p class="dialog-eyebrow">Правила игры</p>${heading('От понимания к решению')}<ol class="rules-list"><li><strong>Раскрывай главы.</strong> Несколько глав могут быть открыты одновременно.</li><li><strong>У каждой темы три уровня.</strong> 1 — понимаю, 2 — применяю, 3 — собираю решение. Уровни внутри темы открываются по порядку; для следующей темы достаточно первого уровня её зависимостей.</li><li><strong>Квиз — пять заданий.</strong> Для зачёта нужны четыре верных решения. Есть выбор ответа и сборка последовательности из блоков. Лишние блоки нужно оставить в наборе.</li><li><strong>Собирай без спешки.</strong> Добавление и перестановка блоков бесплатны. Одна энергия тратится только при отправке готового решения. Для начала квиза нужно пять энергии.</li><li><strong>Можно продолжить позже.</strong> Сохраняются ответы, порядок вопросов и незавершённая сборка. Через восемь часов после первого потраченного балла энергия восстановится до 60.</li><li><strong>Награды — за новые правильные решения.</strong> За первый верный ответ на задание: одна монета и 10 XP. Повторные ошибки не отменяют зачёт. Монеты пока коллекционные.</li></ol><p class="dialog-note">Прогресс хранится в этом браузере. Книги на странице литературы дополняют практику.</p><button class="primary full" id="rulesDone">Понятно, к навыкам →</button>`, 'rules');
  $('#rulesDone').onclick = closeDialog;
}
$('#help').onclick = showRules; $('#rules').onclick = showRules;
$('#reset').onclick = () => {
  show(`${heading('Начать заново?')}<p class="dialog-copy">Будут сброшены уровни, награды, статистика и текущий квиз в этом браузере. Вернуть их после сброса не получится.</p><div class="dialog-actions"><button class="primary" id="cancelReset">Сохранить прогресс</button><button class="secondary danger" id="confirmReset">Сбросить всё</button></div>`, 'reset');
  $('#cancelReset').onclick = closeDialog; $('#confirmReset').onclick = () => { state = createState(); openChapters.clear(); openChapters.add(chapters[0].id); persist(); closeDialog(); notice('Прогресс сброшен. Можно начать новый путь.'); };
};
window.addEventListener('storage', e => {
  if (e.key !== STORAGE_KEY) return;
  try { const previousView = view; state = normalizeState(JSON.parse(e.newValue || 'null'), curriculum); render(); if (dialog.open && ['quiz', 'result'].includes(previousView?.kind)) showQuiz(); else if (dialog.open && previousView?.skillId) showSkill(previousView.skillId, previousView.levelId, true); } catch { /* Keep the current session if external data is invalid. */ }
});
setInterval(() => { const refreshed = refreshEnergy(state); if (refreshed !== state) { state = refreshed; persist(); render(); if (dialog.open && view?.kind === 'skill') showSkill(view.skillId, view.levelId, true); } else balances(); }, 30000);
render();
