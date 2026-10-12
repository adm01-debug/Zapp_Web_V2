Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
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
