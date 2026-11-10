import { supabaseUrl, supabasePublishableKey } from './auth-config.js';

const button = document.querySelector('#accountButton');
const dialog = document.querySelector('#accountDialog');
const status = document.querySelector('#accountStatus');
const profile = document.querySelector('#accountProfile');
const name = document.querySelector('#accountName');
const email = document.querySelector('#accountEmail');
const login = document.querySelector('#accountLogin');
const logout = document.querySelector('#accountLogout');
let client;
let busy = true;

function message(text) { status.textContent = text; }
function setBusy(value) {
  busy = value;
  dialog.querySelectorAll('[data-provider], #accountLogout').forEach(element => { element.disabled = value; });
}
function showSession(session) {
  const user = session?.user;
  window.dispatchEvent(new CustomEvent('ai-magic-auth', { detail: { signedIn: Boolean(user) } }));
  login.hidden = Boolean(user);
  profile.hidden = !user;
  button.textContent = user ? 'Кабинет' : 'Войти';
  if (user) {
    name.textContent = user.user_metadata?.full_name || user.user_metadata?.name || user.user_metadata?.user_name || 'Пользователь';
    email.textContent = user.email || 'Email не предоставлен';
    message('Вы вошли в аккаунт.');
  }
}

button.addEventListener('click', () => { if (!dialog.open) dialog.showModal(); });
document.querySelector('#accountClose').addEventListener('click', () => dialog.close());

async function init() {
  const url = new URL(location.href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const hadCode = url.searchParams.has('code');
  const error = url.searchParams.get('error') || fragment.get('error');
  if (error) {
    for (const key of ['error', 'error_code', 'error_description']) url.searchParams.delete(key);
    if (fragment.has('error')) url.hash = '';
    history.replaceState(history.state, '', url);
    message('Вход отменён или не выполнен. Попробуйте ещё раз.');
    dialog.showModal();
  }
  if (!supabaseUrl || !supabasePublishableKey) {
    message('Вход пока не настроен: укажите публичный ключ Supabase в auth-config.js.');
    return;
  }
  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.49.8');
    client = createClient(supabaseUrl, supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' }
    });
    client.auth.onAuthStateChange((_event, session) => { showSession(session); });
    const { data, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    showSession(data.session);
    if (hadCode && !data.session) {
      message('Не удалось завершить вход. Вернитесь в браузер, в котором начали вход, и попробуйте снова.');
      if (!dialog.open) dialog.showModal();
    }
    setBusy(false);
  } catch {
    message('Не удалось восстановить вход. Проверьте подключение к интернету и настройки Supabase.');
  }
}

dialog.querySelectorAll('[data-provider]').forEach(element => {
  element.addEventListener('click', async () => {
    if (!client || busy) return;
    setBusy(true);
    message('Переходим к провайдеру входа…');
    try {
      const redirectTo = new URL('./', location.href).href;
      const { error } = await client.auth.signInWithOAuth({ provider: element.dataset.provider, options: { redirectTo } });
      if (error) throw error;
    } catch {
      message('Не удалось начать вход. Проверьте настройки провайдера и попробуйте снова.');
      setBusy(false);
    }
  });
});
logout.addEventListener('click', async () => {
  if (!client || busy) return;
  setBusy(true);
  try {
    const { error } = await client.auth.signOut();
    if (error) throw error;
    showSession(null);
    message('Вы вышли из аккаунта.');
  } catch {
    message('Не удалось выйти. Проверьте подключение и попробуйте снова.');
  } finally { setBusy(false); }
});

setBusy(true);
init();
