# UpHunter — Инструкции для Claude Code

## Проект

AI-платформа автоматизации поиска и отклика на вакансии Upwork. Поиск → скоринг → cover letter → отклик → аналитика.

**Путь**: `e:/!UpHunter`

---

## Архитектура

Микросервисы. Все на Python/FastAPI, фронтенд — Next.js.

| Сервис | Порт | Роль |
|--------|------|------|
| jobs | 8101 | Поиск вакансий Upwork (GraphQL API + фоновый Poller) |
| ai-scoring | 8102 | Скоринг вакансий через GPT-4o (temp=0.3) |
| client-intel | 8103 | Анализ рисков клиентов (payment, spend, rating) |
| letter-gen | 8104 | Генерация cover letters GPT-4o (temp=0.7) + перевод (temp=0.3) |
| auth | 8105 | Регистрация, JWT, Upwork OAuth 2.0, team profile |
| analytics | 8106 | Kafka consumer + воронка + Telegram alerts |
| frontend | 3000 (3002 в compose) | Next.js 15 / React 19 |
| nginx | 8080 | Reverse proxy (публичный вход) |

**Инфраструктура**: PostgreSQL 16 (5438), Redis 7 (6381), Kafka (9093), Prometheus (9090), Grafana (3003), Jaeger (16687), MinIO (9000/9001).

**Default login**: `admin@uphunter.local / admin`

---

## Ключевые пути

```
services/
  auth/app/          # main.py, routes.py, models.py, config.py, db.py
  jobs/app/          # + upwork_client.py (GraphQL), poller.py, kafka_producer.py
  ai-scoring/app/    # + scorer.py (GPT-4o scoring logic)
  client-intel/app/  # risk analysis logic в routes.py
  letter-gen/app/    # + generator.py (GPT-4o letter generation)
  analytics/app/     # + kafka_consumer.py, telegram.py

frontend/src/
  app/               # Pages: dashboard, jobs/[id], pipeline, analytics, clients, settings, system
  components/        # Header, Sidebar
  lib/api.ts         # Axios client — ВСЕ API-вызовы только через этот файл
  lib/auth.ts        # JWT helpers

nginx/nginx.conf     # Reverse proxy routing
docker-compose.yml   # Вся инфраструктура
.env.example         # Шаблон переменных окружения

tests/               # Интеграционные тесты (pytest)
.github/workflows/   # CI/CD (tests.yml)
monitoring/          # Prometheus + Grafana configs
```

---

## Базы данных

| БД | Владелец | Что хранит |
|----|----------|------------|
| auth_db | auth | users, upwork_tokens, team_profiles |
| jobs_db | jobs, ai-scoring | jobs, search_filters, job_scores |
| clients_db | client-intel | client_info, risk_scores |
| letters_db | letter-gen | cover_letters |
| analytics_db | analytics | analytics_events |

**Важно**: каждый сервис работает только со своей БД. Межсервисное взаимодействие — только через HTTP API.

---

## Пайплайн (воронка)

1. **Discover** — Poller ищет вакансии через Upwork GraphQL API (каждые 300 сек)
2. **Score** — AI Scoring оценивает match (skill_match, budget_fit, scope_clarity, win_probability, client_risk)
3. **Letter** — Letter Gen создаёт cover letter (draft → review → approved/rejected)
4. **Apply** — Отклик на вакансию
5. **Analytics** — Воронка, time-series, heatmap, Telegram alerts при high scores

---

## Межсервисные зависимости

| Что меняешь | Что затрагивается |
|-------------|-------------------|
| Auth API / модели | jobs (AUTH_SERVICE_URL), client-intel (AUTH_SERVICE_URL), фронтенд |
| Jobs API / модели | letter-gen (JOBS_SERVICE_URL), analytics (JOBS_SERVICE_URL), ai-scoring, фронтенд |
| AI Scoring API | фронтенд (scoring endpoints) |
| Client Intel API | jobs (CLIENT_INTEL_SERVICE_URL), ai-scoring (CLIENT_INTEL_SERVICE_URL), фронтенд |
| Letter Gen API | фронтенд |
| Analytics API | фронтенд |
| Kafka events | kafka_producer.py (jobs, ai-scoring, letter-gen) → kafka_consumer.py (analytics) |
| Pydantic-схема сервиса | Фронтенд `lib/api.ts` |
| ENV переменная | `.env.example`, `docker-compose.yml`, `config.py` нужного сервиса |

---

## Коммуникация между сервисами

- **HTTP (sync)**: Сервисы вызывают друг друга через внутренние URL (docker network)
- **Kafka (async)**: jobs/ai-scoring/letter-gen → `kafka_producer.py` → analytics `kafka_consumer.py`
- **Kafka events**: `job:discovered`, `job:scored`, `letter:generated`, `job:applied`
- **Redis**: кэширование
- **Nginx**: `/api/{service}/` → прокси на нужный сервис

---

## Nginx routing (через `/api/`)

| Frontend URL | Backend |
|-------------|---------|
| `/api/auth/` | auth:8105 |
| `/api/team/profile` | auth:8105/team-profile |
| `/api/jobs/` | jobs:8101 |
| `/api/scoring/` | ai-scoring:8102 |
| `/api/clients/` | client-intel:8103 |
| `/api/cover-letters/`, `/api/letters/` | letter-gen:8104 |
| `/api/analytics/` | analytics:8106 |

---

## Паттерны и соглашения

**Python-сервисы:**
- Конфиг через `config.py` + Pydantic Settings (из ENV)
- SQLAlchemy 2.0 async сессии через `db.py`
- Pydantic v2 для схем запросов/ответов
- OpenAI GPT-4o для LLM tasks
- Каждый сервис: свой Dockerfile, свой requirements.txt

**Фронтенд:**
- Все API-вызовы только через `lib/api.ts`
- Tailwind CSS
- React Query (@tanstack/react-query) для data fetching
- recharts для графиков

**Docker:**
- Все сервисы описаны в `docker-compose.yml`
- ENV переменные дублируются в `.env.example`
- Секреты никогда не хардкодятся в коде

---

## Обязательные проверки при задачах

### Добавление нового поля в API сервиса
- [ ] Pydantic-схема в `models.py` сервиса
- [ ] Если поле в БД — Alembic миграция
- [ ] `lib/api.ts` на фронтенде
- [ ] TypeScript-типы в компонентах

### Изменение DB-модели
- [ ] Alembic-миграция
- [ ] Все места использования модели в коде

### Добавление нового Kafka event
- [ ] `kafka_producer.py` на стороне эмитента
- [ ] `kafka_consumer.py` в analytics
- [ ] `telegram.py` если нужен alert

### Изменение ENV-переменной
- [ ] `.env.example`
- [ ] `docker-compose.yml` (environment секция нужного сервиса)
- [ ] `config.py` сервиса

### Добавление нового сервиса
- [ ] `docker-compose.yml`
- [ ] `.env.example`
- [ ] `nginx/nginx.conf` (routing)
- [ ] `frontend/src/lib/api.ts` (API client)

---

## Key Commands

```bash
docker-compose up -d              # Start all
docker-compose up -d db redis     # Infra only
cd frontend && npm run dev        # Frontend dev
pytest tests/ -v                  # Run tests
```

## Entry Points для разработки

- **API (через nginx)**: http://localhost:8080
- **Frontend**: http://localhost:3002
- **Grafana**: http://localhost:3003
- **Prometheus**: http://localhost:9090
- **Jaeger traces**: http://localhost:16687
- **MinIO console**: http://localhost:9001
