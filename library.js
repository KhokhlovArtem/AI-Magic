import { books, bookCategories } from './books.js';
const $ = s => document.querySelector(s);
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let category = 'all';
$('#starters').innerHTML = books.filter(b => b.featured).map(b => `<a class="starter" href="#book-${b.id}"><span>${bookCategories.find(c => c.id === b.category).short}</span><strong>${esc(b.title)}</strong><small>${esc(b.author)}</small></a>`).join('');
$('#bookFilters').innerHTML = [{ id: 'all', short: 'Все книги' }, ...bookCategories].map(c => `<button class="book-filter" data-category="${c.id}" aria-pressed="${category === c.id}">${c.short}</button>`).join('');
function render() {
  const term = $('#bookSearch').value.trim().toLocaleLowerCase('ru');
  const filtered = books.filter(b => (category === 'all' || b.category === category) && `${b.title} ${b.author} ${b.topic} ${b.description}`.toLocaleLowerCase('ru').includes(term));
  $('#bookCount').textContent = `Показано ${filtered.length} из ${books.length}`;
  $('#books').innerHTML = filtered.length ? filtered.map(b => {
    const group = bookCategories.find(c => c.id === b.category);
    return `<article class="book-card ${group.color}" id="book-${b.id}"><div class="book-card-top"><span class="book-category">${group.title}</span><span class="book-level">${b.level}</span></div><div class="book-symbol" aria-hidden="true">${b.category === 'ai' ? '✳' : b.category === 'product' ? '◇' : '↗'}</div><h3>${esc(b.title)}</h3><p class="book-author">${esc(b.author)}</p><p class="book-topic">${esc(b.topic)}</p><p class="book-description">${esc(b.description)}</p><p class="book-when"><strong>Когда читать</strong>${esc(b.when)}</p><a class="book-source" href="${esc(b.url)}" target="_blank" rel="noopener noreferrer">${esc(b.source)} ↗</a>${b.free ? '<span class="free-reading">Бесплатно онлайн</span>' : ''}</article>`;
  }).join('') : '<div class="books-empty"><h3>Пока ничего не найдено</h3><p>Попробуй другое название, автора или выбери «Все книги».</p><button class="secondary" id="clearSearch">Сбросить поиск</button></div>';
  document.querySelectorAll('[data-category]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.category === category)));
  if ($('#clearSearch')) $('#clearSearch').onclick = () => { category = 'all'; $('#bookSearch').value = ''; render(); $('#bookSearch').focus(); };
}
$('#bookFilters').addEventListener('click', e => { const b = e.target.closest('[data-category]'); if (b) { category = b.dataset.category; render(); } });
$('#bookSearch').addEventListener('input', render);
// Starter links reset filters so their destination is always present.
$('#starters').addEventListener('click', () => { category = 'all'; $('#bookSearch').value = ''; render(); });
render();
