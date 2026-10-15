# 🤝 Guia de Contribuição — Zapp_Web_V2

Repositório: `adm01-debug/Zapp_Web_V2` · Branch principal: `main` · Runtime: **Bun**

---

## 🚀 Quick Start

```bash
# 1. Clone o repositório
git clone https://github.com/adm01-debug/Zapp_Web_V2.git
cd Zapp_Web_V2

# 2. Instale dependências (bun, não npm)
bun install

# 3. Configure ambiente local
cp .env.example .env.local
# Edite .env.local com VITE_ZAPP_LOCAL_SUPABASE_URL e VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY
# SEM essas variáveis, o servidor de dev aponta para a PRODUÇÃO — confira antes de testar.

# 4. Rode em desenvolvimento
bun dev
```

## 📐 Stack Tecnológico

| Camada | Tecnologia |
|--------|------------|
| Frontend | React 18 + TypeScript + Vite |
| Estilo | Tailwind CSS + shadcn/ui |
| Backend | Supabase (PostgreSQL 17 + Auth + Realtime + Storage) |
| Edge Functions | Deno (Supabase Functions) |
| WhatsApp | Evolution GO (VPS Hostinger) |
| Runtime | **Bun** (`bun.lock`; não usar `npm install`) |

---

## 🔄 Fluxo de trabalho — lote diário

O trabalho acontece em **banco local** (Supabase local por cópia de trabalho), não contra produção.

```
branch dia/AAAA-MM-DD
    ↓  commits + CI verde
    PR  (6 checks obrigatórios)
    ↓  merge (squash)
    main
    ↓  deploy automático (Vercel)
    ↓  db-migrate.yml (dry-run + aprovação humana no environment producao-ddl)
```

**Regras essenciais (seção 0 do CLAUDE.md):**

1. Trabalhar sempre em banco **local** — nunca testar contra produção.
2. Um PR por lote; o nome da branch segue `dia/AAAA-MM-DD`.
3. Migrations: arquivo em `supabase/migrations/` → PR → merge → apply (nunca DDL direto sem PR).
4. Push só quando o Joaquim pedir — o CI cuida do merge via auto-merge quando os 6 checks ficam verdes.

---

## ✅ Os 6 required checks da `main`

Todo PR precisa ter todos esses checks verdes antes do merge:

| Check | Job |
|-------|-----|
| `🔍 Lint & TypeCheck` | lint-and-typecheck |
| `🧪 Unit Tests` | test |
| `🏗️ Build` | build |
| `🔒 Security Audit` | security |
| `Contrato DB offline` | db-guard |
| `🎭 E2E Tests (Playwright)` | e2e |

O `strict=true` na branch protection garante que o CI rode contra a versão mais recente da `main`.

---

## 🗄️ Migrations

```bash
# Verificar a versão mais recente (antes de criar arquivo)
# SELECT max(version) FROM supabase_migrations.schema_migrations;

# Registrar migration (gera SQL de INSERT, não aplica)
node scripts/db-audit/register-migration.mjs supabase/migrations/<arquivo>.sql

# Validar guard de uso
node scripts/db-audit/supabase-usage-guard.mjs  # deve sair com "novas: 0"
```

Veja as regras completas na seção 1 do `CLAUDE.md`.

---

## 🧪 Rodando testes localmente

```bash
# Unit tests
bun test

# Lint + TypeCheck
bun run lint
bun run typecheck

# Build de produção
bun run build

# E2E (requer banco local configurado)
bun run e2e
```

---

## 🔐 Secrets e segurança

- **Nunca** commitar `.env*` ou credenciais.
- Secrets vivem em GitHub Environments e nos cofres do Supabase.
- Edge Functions não expõem secrets ao front — sempre via server-side.
- Actions fixadas por SHA de 40 caracteres (verificado por `check-workflow-pins.mjs`).

---

## 📋 Antes de abrir um PR

- [ ] `bun install --frozen-lockfile` sem erros
- [ ] `bun run lint` sem erros novos (ratchet)
- [ ] `bun test` verde
- [ ] `bun run build` sem erros
- [ ] Se mudou `supabase/migrations/`: arquivo registrado no ledger + `supabase-usage-guard.mjs` saindo com `novas: 0`
- [ ] PR no modelo de lote (`dia/AAAA-MM-DD`) ou branch temática com CI verde

---

*Atualizado em 2026-10-15 (W95). Para dúvidas sobre infra, banco ou fluxo de deploy, veja o `CLAUDE.md`.*
