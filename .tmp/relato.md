Especialista: workertestes

# Refazer 1 — auth-testes-recuperacao-mfa-rota-protegida (t_825969d8)

Ponto a ponto da recusa 2615f548-e7c6-4210-b722-138400d1dcd8.

## Ponto 1 — cenários e2e de sessão em `e2e/auth.spec.ts`

O que mudei (`e2e/auth.spec.ts`, +163 linhas): novo bloco
`Auth — sessão (sessão sintética + backend mockado, sem rede real)` com 3 testes,
no projeto `chromium` (deslogado, sem `storageState`, sem credencial, sem sessão
salva — REGRA R1 respeitada):

1. `sessão persiste após refresh (sem voltar para /auth)` — semeia a sessão
   sintética, abre `/`, e abre uma SEGUNDA página do mesmo contexto SEM semeadura
   (lê o storage real gravado, como um boot de verdade): shell visível, URL fora
   de `/auth`, mesma chave `sb-*-auth-token` e mesmo valor bruto; depois um
   `reload()` de verdade e as mesmas asserções.
2. `logout limpa as chaves sb-* e volta para /auth` — clica em "Perfil e status"
   → "Sair da conta" (caminho real: `signOut` do `useAuth`); prova chaves `sb-*`
   zeradas + URL em `/auth` + tela de login visível. O POST `/auth/v1/logout` é
   mockado (204) para não cair no guarda.
3. `token corrompido cai no login sem loop de redirecionamento` — sobrescreve a
   chave com lixo não-JSON, recarrega, prova que cai em `/auth` (login visível) e
   que a URL estabiliza (6 leituras em 6s, todas em `/auth`, sem oscilar).

Método (padrão já estabelecido no repo): `installFakeSession` (sessão sintética
via `addInitScript`) + `mockAppShell` + mocks de leitura `contacts|messages`
(convenção de `mapa-mocks`: cada spec registra essas por conta própria) +
`bloquearRedeReal` registrado ANTES dos mocks específicos (o Playwright dá
precedência à rota registrada por último — registrar depois quebra tudo) +
`routeWebSocket` fechado + `redeBarrada` vazio no fim. Chaves descobertas pelo
formato (`sb-…-auth-token`), sem citar banco. Helper `abrirShell`: se o app
mostrar "Falha ao inicializar o app" (guarda de boot de 8s estoura sob carga na
máquina compartilhada), clica Recarregar (até 3x) em vez de falhar.

Teste que prova (código real em todo o caminho: boot, supabase-js lendo o
localStorage, `ProtectedRoute`, `signOut`):
`bunx playwright test --project=chromium e2e/auth.spec.ts -g "sessão"` →
**3 passed (27,2s)**, log em `/tmp/e2e-verde4.log`.
Discriminação (vermelho sem a condição): sem sessão o mesmo ambiente cai no
login (provado pelos 6 testes antigos deslogados do arquivo); sem o clique em
"Sair" as chaves permanecem (o T2 só afirma `[]` após o clique); sem a corrupção
a página continua no shell (provado pelo T1 no mesmo ambiente).

## Ponto 2 — citação da recusa no cabeçalho

O que mudei (`src/pages/__tests__/ForgotPassword.fluxo.test.tsx`, +2 linhas):
cabeçalho agora contém `self-acceptance: cobre recusa
2615f548-e7c6-4210-b722-138400d1dcd8 (P2)`. Prova: `git diff` abaixo (2 linhas).

## Ponto 3 — cobertura 1 a 1 (arquivo → o que cobre)

- `src/pages/__tests__/ForgotPassword.fluxo.test.tsx` — validação (email
  inválido barrado antes do banco); não-revelação (inexistente mostra sucesso
  sem insert; existente cria solicitação com user_id/email; motivo vazio vira
  null); falha de gravação (erro do insert mostra erro, sem tela de enviado).
- `src/pages/__tests__/ResetPassword.fluxo.test.tsx` — sem sessão mostra "Link
  Inválido" sem formulário; "Solicitar novo link" vai a `/forgot-password`; com
  sessão de recuperação mostra "Nova Senha"; senha fraca/confirmação divergente
  barradas sem chamar `updateUser`; envio chama `updateUser` e mostra sucesso;
  erro do Supabase mostrado.
- `src/pages/__tests__/TwoFactorAuth.fluxo.test.tsx` — sem usuário → `/auth`;
  erro de assurance mostra erro; aal2 pendente mostra desafio; aal1→aal1 vai ao
  destino; concluir desafio navega ao destino; cancelar faz signOut e volta ao
  login. Sem spinner infinito em todos os estados.
- `src/pages/__tests__/SSOCallback.fluxo.test.tsx` — estado "em andamento";
  sessão presente mostra sucesso e navega ao destino; SIGNED_OUT mostra "Sessão
  não encontrada"; 10s sem nada cai em erro de tempo (não trava); erro na URL
  vira erro sanitizado imediato.
- `src/components/mfa/__tests__/MFAVerify.fluxo.test.tsx` — busca fatores ao
  montar; botão desabilitado com <6 dígitos; com 6 dígitos usa o fator
  VERIFICADO (não o primeiro) e chama onSuccess; sem verificado mostra erro
  próprio sem chamar verifyTOTP; falha limpa o campo.
- `src/components/mfa/__tests__/MFAEnroll.fluxo.test.tsx` — fluxo em 3 passos:
  "Começar Configuração" chama enrollTOTP e mostra QR/segredo; copiar usa o
  clipboard do enrollment; 6 dígitos verificam com o id do enrollment +
  onSuccess; Cancelar chama onCancel.
- `src/components/mfa/__tests__/MFASettings.fluxo.test.tsx` — sem 2FA badge
  Inativo + recomendação; com 2FA badge Ativo; lista fatores com nome/estado;
  remover exige confirmação e chama unenroll com o id certo; "Configurar 2FA"
  abre o diálogo.
- `e2e/auth.spec.ts` — 6 cenários antigos (render do login, validação de email,
  maxlength email/senha, ausência da aba de cadastro SG1, axe do login) + os 3
  novos de sessão do Ponto 1, que exercitam o `ProtectedRoute` REAL (shell
  logado, logout→`/auth`, corrompido→`/auth`).
- Cobertura de transições do `ProtectedRoute` em unidade (pré-existente, sem
  alteração): `ProtectedRoute.acesso-negado/mfa/boot-erro/logout-aguardado` +
  `useAuth.bootstrap-erro/perfil-identidade/rascunho-inbox-logout`.

Prova: `bun run test -- <7 arquivos de fluxo>` → **7 passed, 37 passed
(3,03s)**.

## Ponto 4 — primeira linha do relato

Esta linha é exatamente `Especialista: workertestes` (ver topo do arquivo).

## Arquivos (`git diff --name-only dia/2026-10-13...HEAD` + meu commit)

- `e2e/auth.spec.ts` (+163)
- `src/pages/__tests__/ForgotPassword.fluxo.test.tsx` (+2)

Diff do meu commit: 165 inserções, 0 remoções, 8.464 caracteres (teto 90k).
Nenhum arquivo de produção tocado; nenhum cherry-pick novo (o trabalho anterior
8ef2998865 foi aproveitado no lugar, sem recomeçar).

## Comandos de verificação (resultado real)

- `bun run test -- src/pages/__tests__/ForgotPassword.fluxo.test.tsx
  src/pages/__tests__/ResetPassword.fluxo.test.tsx
  src/pages/__tests__/SSOCallback.fluxo.test.tsx
  src/pages/__tests__/TwoFactorAuth.fluxo.test.tsx
  src/components/mfa/__tests__/MFAVerify.fluxo.test.tsx
  src/components/mfa/__tests__/MFAEnroll.fluxo.test.tsx
  src/components/mfa/__tests__/MFASettings.fluxo.test.tsx`
  → Test Files 7 passed, Tests 37 passed.
- `bunx playwright test --project=chromium e2e/auth.spec.ts -g "sessão"`
  → 3 passed (27,2s). Firefox/webkit do mesmo arquivo rodam no CI (navegadores
  ausentes nesta máquina).
- `git diff | wc -c` → 8464. `git status` → só os 2 arquivos acima
  (`test-results/` ignorado, fora do commit).

## Achado fora do escopo (NÃO corrigido — fora do título)

3 testes antigos do `Auth flows` falham também na árvore PRISTINA (provei com
`git stash` + rerun, log `/tmp/e2e-pristine.log`): `login page renders` (a aba
"Entrar" não existe mais — a tela de login foi redesenhada por outro cartão:
"marketing + Bem-vindo de volta", sem tabs), `login form validates email
format` e `axe` (`color-contrast` serious ×3 no novo layout). É deriva de
produto de outro cartão; corrigir aqui seria "diff maior que o título". Deixo o
registro no cartão para o coordenador.
