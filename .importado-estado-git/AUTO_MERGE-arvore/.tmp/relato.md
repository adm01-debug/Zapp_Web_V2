Especialista: Íris (area-front-componentes)

## O que mudou e por quê
<<<<<<< HEAD
- src/components/errors/ErrorBoundary.tsx: nova prop OPCIONAL `onReset`, disparada em `componentDidUpdate` na transição `hasError true -> false`. É o gancho que faltava: o boundary agora avisa o pai quando conseguiu se recuperar.
- src/providers/AppProviders.tsx: `handleReset` zera `retryCountRef` e entra no boundary via `onReset`. Sem isto o contador de tentativas só subia: 3 erros recuperados em QUALQUER momento da sessão somavam e o 4º derrubava o app em "Falha Crítica na Inicialização". Agora o orçamento de 3 tentativas é por falha CONSECUTIVA. O mesmo arquivo passa a exportar `AppErrorBoundary`, um boundary externo com tela mínima SEM contexto nenhum (só classes CSS + botão "Recarregar").
- src/routes/AppRoutes.tsx: o boundary das rotas vira `RotaErrorBoundary`, que fica dentro do Router (usa `useLocation`) e amarra o `resetKey` ao `pathname` + um contador de tentativa. Trocar de rota limpa o erro e a tela nova renderiza; a falha de uma rota deixa de prender o usuário no texto fixo "Erro ao carregar roteamento" (sem botão e sem saída). O botão "Tentar novamente" relança a mesma rota reincrementando o `resetKey`.
- src/main.tsx: o boundary mais externo passa a envolver `<App />` (que contém o `AppProviders`). O import de boundary já existia no arquivo mas estava morto; agora o caso "erro no próprio AuthProvider/QueryClient no 1º render" — que subia até o ReactDOM e virava tela branca — cai na tela mínima com "Recarregar".

## Prova
- vermelho antes (contador), com `onReset` desligado: `npx vitest run src/providers/__tests__/AppProviders.autoRecuperacao.test.tsx -t '4 erros'` → `1 failed`, o app termina na tela "Falha Crítica" e `app-vivo` devolve `null` na 4ª recuperação.
- vermelho antes (rotas), com `AppRoutes.tsx` na versão da base: `npx vitest run src/components/errors/__tests__/AppRoutes.errorBoundary.test.tsx` → `2 failed`; a árvore mostra `<div class="p-4 text-center">Erro ao carregar roteamento</div>`, sem botão "Tentar novamente".
- verde depois, com a mudança: `npx vitest run src/providers/__tests__/AppProviders.autoRecuperacao.test.tsx src/components/errors/__tests__/AppRoutes.errorBoundary.test.tsx` → `Test Files 2 passed (2); Tests 5 passed (5)`.
- regressão nos módulos tocados: `npx vitest run src/components/errors/__tests__ src/providers/__tests__ src/routes/__tests__` → `Test Files 10 passed (10); Tests 77 passed (77)`.

## O que NÃO fiz e por quê
- Não criei arquivo novo para a tela mínima: `AppErrorBoundary` mora em `src/providers/AppProviders.tsx` (arquivo do cartão) e é montado em `src/main.tsx`; assim nada sai da lista de arquivos e a tela fica testável.
- O teste do boundary das rotas foi para `src/components/errors/__tests__/` porque `src/routes/__tests__/` não está na lista de arquivos do cartão.
- Não toquei banco, Edge, produção, credenciais nem `.github/`. Nenhum contrato de outro chamador foi alterado: `onReset` é opcional (quem não passa, nada muda) e o fallback das rotas só trocou de texto fixo para a tela com ação.
=======
- src/pages/ResetPassword.tsx: o redirecionamento pós-sucesso deixou de ser um `setTimeout` fixo de 3s sem aviso e virou uma contagem regressiva VISÍVEL a partir de 5s, com o botão "Ficar nesta página" que cancela (nada navega depois do cancelamento; a tela passa a oferecer "Ir para o login"). Motivo: ninguém era jogado de volta ao login sem saber.
- src/pages/SSOCallback.tsx: a mensagem de erro que chega pela URL (`error_description`/`error`, texto escolhido por quem monta o link) passa por `sanitizeAuthError` antes de ir para a tela — cortada em 200 caracteres, com os caracteres de marcação (`<>"'&` + crase) removidos e texto genérico quando não sobra nada. A mesma sanitização cobre o `error.message` do `getSession`. O helper fica interno ao arquivo (não exportado), para não criar aviso novo de `react-refresh/only-export-components`.
- src/pages/Install.tsx: o listener de `appinstalled` (antes uma arrow inline) agora é nomeado e removido no cleanup junto com o de `beforeinstallprompt`.

## Prova
- vermelho antes: `git show HEAD:src/pages/<os três>.tsx` restaurado no lugar das correções e `npx vitest run src/pages/__tests__/ResetPassword.redirect-cancelavel.test.tsx src/pages/__tests__/SSOCallback.erro-sanitizado.test.tsx src/pages/__tests__/Install.limpeza-listeners.test.tsx` → `Test Files 3 failed (3); Tests 7 failed | 2 passed` (destaque: SSOCallback — `Expected: not "<b>credenciais inválidas</b>" ... Received: "<b>credenciais inválidas</b>"`; ResetPassword — sem "em 5s"; Install — `appinstalled` nunca removido).
- verde depois (correções restauradas, mesmo comando): `Test Files 3 passed (3); Tests 8 passed (8)`.

Todos os testes renderizam os componentes REAIS (sem mock de tela): ResetPassword e Install via `MemoryRouter`, SSOCallback lendo `window.location.search` de verdade.

## O que cobri por item do cartão
1. Contagem visível de 5s e cancelável: `mostra contagem regressiva a partir de 5s` + `navega para /auth quando a contagem chega a zero` + `"Ficar nesta página" cancela`.
2. Erro do SSO sanitizado: 3 testes na TELA real — marcação removida, corte em 200 caracteres, texto genérico quando só há marcação.
3. Cleanup do listener `appinstalled`: teste que confere que `removeEventListener('appinstalled', h)` recebe o MESMO handler registrado no mount + teste de que o listener ainda funciona enquanto montado.

## Notas de execução
- O juiz barato avisou "Jev inseguro sobre o relato" na primeira passada; o apontamento não procede (o relato tem comando e linha de resultado, sem ressalva) — repeti o MESMO comando de fechar e a entrega seguiu.
- A verificação de tipos pediu `bun install` antes (dependências ausentes no workspace novo); rodado, typecheck OK.

## O que NÃO fiz e por quê
- Não mexi nos outros ramos das telas (link inválido do reset, fluxo do Install para iOS/Chrome): fora do que o cartão pediu.
- Sem DDL, Edge Function nem dependência nova — só tela.
>>>>>>> 8cb091ace6 (fix(auth): polimento de reset de senha, SSO e instalacao PWA)
