# AI Magic

Статическое приложение: запустите HTTP-сервер в корне проекта, например `python -m http.server 8000`, и откройте `http://localhost:8000/`. Для GitHub Pages публикуются файлы из корня репозитория.

## Авторизация Supabase

1. В `auth-config.js` укажите `supabaseUrl` и `supabasePublishableKey`: URL проекта и **публичный** publishable key (или legacy anon key) из Supabase Project Settings → API Keys. Пустой ключ отключает вход; обучение остаётся доступным. Этот файл загружается браузером и публикуется на GitHub Pages. Никогда не записывайте в него secret key, service_role, OAuth Client Secret или другие секреты.
2. В Supabase Authentication → Providers включите GitHub и/или Google. Создайте OAuth-клиентов у соответствующих провайдеров и укажите их Client ID и Client Secret только в настройках Supabase. В настройках провайдера в качестве callback используйте URL из Supabase, вида `https://<project-ref>.supabase.co/auth/v1/callback`.
3. В Supabase Authentication → URL Configuration добавьте точные адреса возврата: `http://localhost:8000/` для указанного локального сервера и `https://khokhlovartem.github.io/AI-Magic/` для Pages. При другом хосте или порте добавьте соответствующий URL. Site URL укажите как адрес опубликованного приложения. В Google Auth Platform может потребоваться добавить тестовых пользователей, пока приложение в режиме Testing.
4. Кнопка «Войти» открывает вход через GitHub или Google; после возврата доступен кабинет и выход. Для OAuth используется PKCE, поэтому вход нужно завершать в том же браузере, в котором он был начат. Сессия сохраняется в хранилище браузера. Для загрузки Supabase SDK необходим доступ к `esm.sh`.

Авторизация пока не синхронизирует учебный прогресс: он остаётся в локальном хранилище браузера. SQL в `supabase/progress.sql` предварительный; проверка политик RLS и облачная синхронизация ещё не завершены.
