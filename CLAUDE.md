# UpHunter — AI-платформа поиска и отклика на Upwork

## Project Structure
Микросервисная архитектура (Python/FastAPI + Next.js).
Monorepo: `services/`, `frontend/`.

## Services & Ports
| Service       | Port | DB          |
|---------------|------|-------------|
| jobs          | 8101 | jobs_db     |
| ai-scoring    | 8102 | jobs_db     |
| client-intel  | 8103 | clients_db  |
| letter-gen    | 8104 | letters_db  |
| auth          | 8105 | auth_db     |
| analytics     | 8106 | analytics_db|
| nginx         | 8080 | —           |
| frontend      | 3000 | —           |

## Infra
PostgreSQL (port 5438), Redis (port 6381), Kafka (port 9093), nginx (port 8080).
Default login: admin@uphunter.local / admin

## Conventions
- Python 3.12, FastAPI, SQLAlchemy 2.0 async, Pydantic v2
- Each service: own DB, own Dockerfile, own requirements.txt
- Inter-service: HTTP only (no direct DB access)
- Frontend: Next.js 15, React 19, Tailwind CSS, axios, react-query
- All API calls through `frontend/src/lib/api.ts`
- LLM: OpenAI GPT-4o via API
- Auth: OAuth 2.0 with Upwork + JWT internal

## Key Commands
```bash
docker-compose up -d          # Start all
docker-compose up -d db redis # Infra only
cd frontend && npm run dev    # Frontend dev
```
