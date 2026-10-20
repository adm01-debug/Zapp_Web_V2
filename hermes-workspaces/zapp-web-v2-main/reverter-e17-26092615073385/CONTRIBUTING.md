# 🤝 Guia de Contribuição — ZAPP-WEB

Obrigado pelo interesse em contribuir! Este guia explica como participar do desenvolvimento.

## 🚀 Quick Start

```bash
# 1. Clone o repositório
git clone https://github.com/adm01-debug/zapp-web.git
cd zapp-web

# 2. Instale dependências
npm install

# 3. Configure ambiente
cp .env.example .env
# Edite .env com suas credenciais Supabase

# 4. Rode em desenvolvimento
npm run dev
```

## 📐 Stack Tecnológico

| Camada | Tecnologia |
|--------|------------|
| Frontend | React 18 + TypeScript + Vite |
| Estilo | Tailwind CSS + shadcn/ui |
| Backend | Supabase (PostgreSQL + Auth + Realtime + Storage) |
| Edge Functions | Deno (Supabase Functions) |
| WhatsApp | Evolution API |
| Deploy | Lovable |

## 📁 Estrutura do Projeto

```
zapp-web/
├── src/
│   ├── components/     # Componentes React
│   ├── hooks/          # Custom hooks
│   ├── lib/            # Utilitários
│   ├── pages/          # Páginas/rotas
│   ├── integrations/   # Clientes Supabase
│   └── types/          # Tipos TypeScript
├── supabase/
│   ├── functions/      # Edge Functions (Deno)
│   └── migrations/     # Migrations SQL
├── docs/               # Documentação
└── public/             # Assets estáticos
```

## 🔀 Workflow de Desenvolvimento

### Branches

- `main` — Produção (protegida)
- `develop` — Desenvolvimento
- `feature/*` — Novas funcionalidades
- `fix/*` — Correções
- `hotfix/*` — Correções urgentes em produção

### Fluxo

1. Crie branch a partir de `develop`
2. Desenvolva e teste localmente
3. Commit com mensagem padronizada
4. Abra PR para `develop`
5. Aguarde review e CI passar
6. Merge!

## 📝 Padrão de Commits

Usamos [Conventional Commits](https://www.conventionalcommits.org/):

```
<tipo>(<escopo>): <descrição>

[corpo opcional]

[rodapé opcional]
```

### Tipos

| Tipo | Descrição |
|------|----------|
| `feat` | Nova funcionalidade |
| `fix` | Correção de bug |
| `docs` | Documentação |
| `style` | Formatação (sem mudança de código) |
| `refactor` | Refatoração |
| `perf` | Performance |
| `test` | Testes |
| `chore` | Manutenção |
| `ci` | CI/CD |

### Exemplos

```bash
feat(chat): adicionar botão de anexar arquivo
fix(auth): corrigir loop de redirect no login
docs(readme): atualizar instruções de setup
perf(messages): otimizar query de histórico
```

## ✅ Checklist de PR

Antes de abrir um PR, verifique:

- [ ] Código compila sem erros (`npm run build`)
- [ ] Linter passa (`npm run lint`)
- [ ] Tipos corretos (`npm run typecheck`)
- [ ] Testes passam (`npm run test`)
- [ ] Sem `console.log` ou debug code
- [ ] Sem secrets hardcoded
- [ ] Documentação atualizada (se necessário)
- [ ] Screenshots para mudanças visuais

## 🧪 Testes

```bash
# Rodar todos os testes
npm run test

# Rodar com coverage
npm run test:coverage

# Rodar em watch mode
npm run test:watch
```

## 🎨 Padrões de Código

### TypeScript

- Sempre tipar props e retornos
- Evitar `any` — usar `unknown` se necessário
- Preferência por interfaces sobre types

### React

- Componentes funcionais com hooks
- Preferência por composição sobre herança
- Usar shadcn/ui components quando possível

### CSS/Tailwind

- Usar classes Tailwind, evitar CSS custom
- Seguir design tokens do projeto
- Mobile-first responsive design

### Supabase

- Sempre testar RLS policies
- Usar prepared statements
- Documentar migrations

## 🔐 Segurança

- **NUNCA** commitar secrets ou tokens
- Usar `.env` para variáveis sensíveis
- Reportar vulnerabilidades conforme `SECURITY.md`

## 📚 Recursos

- [Documentação Técnica](./docs/)
- [Supabase Docs](https://supabase.com/docs)
- [Evolution API Docs](https://doc.evolution-api.com/)
- [shadcn/ui](https://ui.shadcn.com/)

## 📧 Contato

- **Issues:** Abra uma issue no GitHub
- **Email:** dev@promobrindes.com.br

---

🙏 Obrigado por contribuir!
