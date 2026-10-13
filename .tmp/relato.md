Especialista: worker (design) (design-system-zapp)

## O que mudou e por quê
Retomada [refazer 1] do L4 (coluna do login: marca, botões e rodapé como na V3), que estava aprovado mas conflitava
com a ponta de `dia/2026-10-12`. Trabalho anterior: `b83ab41d2`. Base nova do workspace: `dia/2026-10-12` (`96dd72dc5`).

- `src/pages/Auth.tsx`: trouxe a coluna V3 para a base nova — marca centralizada (ícone grande no quadrado com
  `var(--gradient-primary)`, `rounded-[2rem]`, `h1` "ZAPP Web" + subtítulo "Plataforma omnichannel para atendimento"),
  botões de entrada alternativa em largura total na ordem `Entrar → ou → Entrar com Passkey → ou continue com →
  Entrar com Google`, cada separador só quando há botão depois dele, e rodapé
  "© {ano} Promo Brindes. Todos os direitos reservados.". Conflito do `git cherry-pick` resolvido em 2 blocos
  (imports e miolo da marca), ficando com o lado da V3 e descartando o lado antigo.
- `src/pages/__tests__/Auth.coluna-v3.test.tsx`: teste do cartão, ajustado ao novo fato da base — o cadastro público
  foi removido em `dia/2026-10-12` (`Auth.sem-cadastro.test.tsx`), então o caso "sem regressão" passou a exigir as
  abas AUSENTES (`queryByRole('tab')` nulo) em vez de presentes. Nada de aba reintroduzida.
- `src/pages/__tests__/Auth.fundo-mapa.test.tsx`: o heading esperado passou de "Bem-vindo de volta" para "ZAPP Web".

Sem tipo novo, sem gate novo, sem arquivo gerado grande; só tokens/classes já existentes
(`--gradient-primary` em `src/styles/tokens.css:234` claro / `:518` escuro; `text-3xs` em `tailwind.config.ts:27`).

## Prova
- vermelho antes (Auth.tsx da base, sem a mudança): `npx vitest run src/pages/__tests__/Auth.coluna-v3.test.tsx`
  → `Tests 6 failed | 1 passed (7)` (bate primeiro no rodapé "Promo Brindes" e na marca "ZAPP Web", que a base não tem).
- verde depois: `npx vitest run src/pages/__tests__/Auth.coluna-v3.test.tsx src/pages/__tests__/Auth.fundo-mapa.test.tsx
  src/pages/__tests__/Auth.sem-cadastro.test.tsx` → `Test Files 3 passed (3); Tests 16 passed (16)`.
- `npx tsc --noEmit` → exit 0; `npx eslint` nos 3 arquivos → 0 erros (1 warning pré-existente do import
  `@/integrations/supabase/client`, já presente na base).

## Pontos do revisor ([refazer 1])
- Ponto 1: conflito de base resolvido. Em vez de rebase manual, apliquei `git cherry-pick b83ab41d2` sobre a ponta
  `dia/2026-10-12` (`96dd72dc5`) neste workspace; houve 1 conflito real em `src/pages/Auth.tsx` (imports e miolo da
  marca V3) e resolvi mantendo o desenho da V3; resultado em `1dba1b0c8`, só `src/pages/Auth.tsx` + 2 testes. Sem
  tipo novo nem gate novo.
- Ponto 2: "as abas Entrar/Criar Conta continuam funcionando" não procede nesta base. `dia/2026-10-12` removeu o
  cadastro público da tela (`src/pages/__tests__/Auth.sem-cadastro.test.tsx` exige 1 único formulário e nenhuma aba
  "Criar Conta"). Reintroduzir as abas contradiria a base; então preservei o comportamento novo: nenhuma aba, login
  intacto (Email/Senha/Entrar) — provado no caso "sem regressão" do teste do cartão e por `Auth.sem-cadastro.test.tsx`
  (verde).

## O que NÃO fiz
- Não mexi em tokens, componentes compartilhados nem no hook `useAuthForm`.
- Não conferi contraste por captura de tela (o cartão pede prova por teste estrutural; a cor vem de
  `var(--gradient-primary)`, já existente e usada na base).
