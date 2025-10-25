# Maketa — Backend Flask + PostgreSQL

Este repositório contém a aplicação Flask (backend) e uma instância PostgreSQL orquestrada por Docker Compose. A configuração foi preparada para três cenários:

1) Desenvolvimento local (localhost) com acesso ao banco via Docker
2) Autodeploy via GitHub (push para main)
3) Acesso público na internet (porta dedicada ou via Nginx)

## Requisitos
- Windows: Python 3.11+, PowerShell, Docker Desktop (com WSL2) para rodar o banco localmente
- VPS: Docker + Docker Compose instalados, acesso SSH, repositório em `~/Maketa/MAKETA`

## Variáveis de ambiente (backend/.env)
Exemplo em `backend/.env.example`:

```
POSTGRES_USER=maketa
POSTGRES_PASSWORD=troque_esta_senha
POSTGRES_DB=maketa_db

# Local (Python fora do Docker, banco via porta mapeada)
DATABASE_URL_LOCAL=postgresql+psycopg://maketa:troque_esta_senha@localhost:5434/maketa_db

# Docker (app fala com o serviço "maketa_db" na rede do Compose)
DATABASE_URL=postgresql+psycopg://maketa:troque_esta_senha@maketa_db:5432/maketa_db
```

Importante:
- Use `postgresql+psycopg` (psycopg v3) no driver.
- `backend/.env` não é versionado (listado no `.gitignore`).

## 1) Desenvolvimento local com DB do Docker
- Copie `backend/.env.example` para `backend/.env` e ajuste credenciais.
- Suba apenas o banco (Docker Desktop necessário):
  - `docker compose up -d maketa_db` (na raiz do projeto)
- Instale dependências e rode a app localmente (fora do Docker):
  - `cd backend`
  - `pip install -r requirements.txt`
  - `python app.py`
- Acesse `http://localhost:5000/health`. Esperado: `{"app":"ok","db":"ok"}`.

Atalho (Windows): use `scripts/dev.ps1` para automatizar subir banco e iniciar a aplicação.

## 2) Autodeploy via GitHub
- Workflow: `.github/workflows/deploy.yml` dispara no `push` para `main`.
- A ação SSH no VPS executa:
  - Backup do banco (`pg_dump` pelo container `maketa_db`)
  - `git pull` no diretório `~/Maketa/MAKETA`
  - `docker compose down && docker compose up -d --build --remove-orphans`
  - Health-check em `http://localhost:5001/health` validando `app` e `db` `ok`
- Secrets necessários no repositório:
  - `SSH_HOST`, `SSH_USER`, `SSH_KEY` (chave privada do usuário com acesso ao VPS)

## 3) Acesso público na internet
Há duas opções:
- Expor diretamente a porta mapeada pelo Compose: `5001` (firewall liberado; acessar `http://SEU_IP:5001/`)
- Usar Nginx reverso com domínio e TLS, redirecionando para `http://127.0.0.1:5001`:

Exemplo de bloco Nginx:
```
server {
  listen 80;
  server_name exemplo.seudominio.com;
  location / {
    proxy_pass http://127.0.0.1:5001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```
Use Certbot para HTTPS e ajuste `server_name`.

## Docker Compose (resumo)
`docker-compose.yml`:
- `maketa_app`: porta `5001:5000`, usa `backend/Dockerfile`, `env_file: backend/.env`, volume `./backend:/app`
- `maketa_db`: imagem `postgres:16`, porta `5434:5432`, volume persistente `postgres_data`

## Troubleshooting
- Erro `ModuleNotFoundError: psycopg2`
  - Corrigido usando `psycopg[binary]` (v3) e URLs `postgresql+psycopg://` no `.env`.
- Health retorna `db:error`
  - Verifique `DATABASE_URL`/`DATABASE_URL_LOCAL`, credenciais, e se o Postgres está pronto (`docker logs maketa_db`).
- Deploy falha por `jq`
  - O workflow agora dispensa `jq` e valida por `grep` caso não esteja instalado.

## Estrutura
```
MAKETA/
├── .github/workflows/deploy.yml
├── docker-compose.yml
└── backend/
    ├── Dockerfile
    ├── requirements.txt
    ├── app.py
    ├── templates/index.html
    ├── .env (não versionado)
    └── .env.example
```