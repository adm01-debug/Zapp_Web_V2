Especialista: semisenior (area-front-componentes)

[refazer 1] fix(admin): Modo Treinamento — trata erro de perfil, encerra sessão abandonada e mostra resultados da equipe

Commit do refazer: e92a55289f (sobre o trabalho anterior 078c825f5e, mesmos arquivos do cartão).

Ponto 1 — `loadTeamSessions` sem `.limit()`, lendo a tabela inteira.
O que mudei: `src/components/admin/TrainingMode.tsx` — a consulta da equipe agora termina com `.limit(50)` (antes sem limite; a lista pessoal já tinha `.limit(10)`).
Teste: `limite-equipe-50` em `TrainingMode.erro-abandono.test.tsx` (mock registra cada `limit`; abre a aba da equipe e exige `{ tabela: 'training_sessions', n: 50 }`).
Saída vermelha antes (componente antigo): FAIL — nenhum `limit` registrado para a consulta da equipe. Verde depois: passa.

Ponto 2 — busca fora da aba + "Nenhuma sessão" sem gate.
O que mudei: `src/components/admin/TrainingMode.tsx` — (a) conferi no código que a busca já tem um único ponto de chamada, o `onValueChange` da aba (`setAba` + `loadTeamSessions` só quando `valor === 'equipe'`); nenhum `useEffect` a dispara, e o Radix não emite `onValueChange` na montagem (que abre em "meus"). Tentei um `useEffect` guiado pela aba e o pre-commit barrou (`react-hooks/set-state-in-effect`, ratchet: novas=0 exigido), então mantive o handler da aba com comentário documentando o ponto único; (b) novo estado `equipeCarregada` (inicia `false`, vira `true` no retorno com sucesso ou erro): antes do retorno a aba mostra "Carregando resultados da equipe…" em vez de afirmar o vazio.
Teste: `equipe-carregando` (resposta da equipe adiada por promise controlada; exige `consultasEquipe === 0` após montar, "Carregando…" visível e "Nenhuma sessão…" ausente antes do retorno, e "Nenhuma sessão…" após resolver vazio).
Saída vermelha antes: FAIL — exibia "Nenhuma sessão de treinamento registrada." antes do retorno e não havia "Carregando…". Verde depois: passa.

Ponto 3 — conteúdo de /admin condicionado ao papel, testemunha `papel-*`.
O que mudei: `src/components/admin/TrainingMode.tsx` — mesmo padrão do `AdminView` (Cartão 06-PGR-26): `const { isSupervisor, loading: papelCarregando } = useUserRole()` e padrão-negar na busca (`if (papelCarregando || !isSupervisor) return;` em `loadTeamSessions`). O atendente comum vê o que pode usar (cenários + aba "Meus resultados"); só supervisor vê a aba "Resultados da equipe".
Teste: `papel-atendente-equipe` substitui o antigo `atendente comum não vê a aba da equipe` — com `isSupervisor=false` exige ausência da aba + presença dos cenários e de "Meus resultados"; após `unmount` e `isSupervisor=true` exige a aba presente (falha se o componente ignorar o hook para qualquer lado). Verde antes e depois (o código antigo já lia o hook; o teste testemunha a fiação nos dois sentidos).

Arquivos (`git diff --name-only 338a420d1e...HEAD`, colado do comando):
.tmp/relato.md
src/components/admin/TrainingMode.tsx
src/components/admin/__tests__/TrainingMode.avaliacao.test.tsx
src/components/admin/__tests__/TrainingMode.erro-abandono.test.tsx

Verificação:
- `npx vitest run src/components/admin/__tests__/TrainingMode.erro-abandono.test.tsx src/components/admin/__tests__/TrainingMode.avaliacao.test.tsx` → Test Files 2 passed (2), Tests 17 passed (17).
- Pre-commit lint ratchet no commit e92a55289f → baseline=3, atual=3, novas=0.
- Nenhum teste existente removido, pulado ou afrouxado; `TrainingMode.avaliacao.test.tsx` intocado neste refazer (5/5 verdes).
