Especialista: iris
## O que mudou e por quê
- `src/pages/Auth.tsx`: os dois avisos da tela de login deixaram de ser texto mudo para leitor de tela.
  - Banner de bloqueio: o corpo do aviso virou região viva (`role="alert"`, `src/pages/Auth.tsx:124`) e agora diz a espera em minutos — "Muitas tentativas de login falhadas. Aguarde {lockMinutes} minutos antes de tentar novamente." (`src/pages/Auth.tsx:126`), com `lockMinutes = Math.max(1, Math.ceil(lockStatus.remainingTime / 60))` em `src/pages/Auth.tsx:29`. É UM anúncio, no início do bloqueio: esse texto é estável enquanto o bloqueio dura.
  - A contagem mm:ss, que muda a cada segundo, ficou FORA da região viva: o span da contagem ganhou `aria-hidden="true"` (`src/pages/Auth.tsx:133`) e a barra de progresso idem (`src/pages/Auth.tsx:130`), para o leitor de tela não ler o relógio em laço. O ícone do bloqueio também virou `aria-hidden="true"` (`src/pages/Auth.tsx:121`).
  - Banner de tentativas: o container ganhou `role="alert"` (`src/pages/Auth.tsx:145`) e o ícone decorativo `aria-hidden="true"` (`src/pages/Auth.tsx:146`) — cada mudança de "N tentativas restantes antes do bloqueio" é anunciada.
- `src/pages/__tests__/Auth.avisos-bloqueio.test.tsx` (novo): 4 testes que renderizam a PÁGINA real (`@/pages/Auth`) com o HOOK real (`@/hooks/auth/useAuthForm`), mockando só as fronteiras (useAuth/useWebAuthn/use-toast/loginAttempts/supabase) e dirigindo o submit de verdade.
## Prova
- vermelho antes (Auth.tsx da base, sem `role="alert"` e sem a espera em minutos): `npx vitest run src/pages/__tests__/Auth.avisos-bloqueio.test.tsx` -> `Test Files 1 failed (1)` / `Tests 4 failed (4)`
- verde depois: `npx vitest run src/pages/__tests__/Auth.avisos-bloqueio.test.tsx` -> `Test Files 1 passed (1)` / `Tests 4 passed (4)`
- vizinhos de Auth intactos: `npx vitest run src/pages/__tests__/Auth.coluna-v3.test.tsx src/pages/__tests__/Auth.fundo-mapa.test.tsx src/pages/__tests__/Auth.sem-cadastro.test.tsx src/pages/__tests__/Auth.avisos-bloqueio.test.tsx` -> `Test Files 4 passed (4)` / `Tests 20 passed (20)`
## CRITÉRIO DE PRONTO item a item
1. Bloqueio e tentativas anunciados: `src/pages/Auth.tsx:124` (role="alert" do bloqueio) e `src/pages/Auth.tsx:145` (role="alert" das tentativas), provados pelos testes 1, 2 e 3 do arquivo novo.
2. Sem enumeração de contas: o anúncio do bloqueio é o MESMO texto para qualquer e-mail e não contém o e-mail digitado (teste 4 do arquivo novo); nenhuma RPC nova entrou no diff de Auth.tsx (nada de `is_account_locked`).
3. `zapp-verify . --rapido`: ver "[Verificação](#verificação)" abaixo — rodado por mim, RC=0.

## Verificação
```
$ zapp-verify . --rapido
OK      db_guard        0s
OK      tipos         149s
OK      lint            4s
OK      migrations      1s
AVISO   banco_local  NÃO VERIFICADO: sem nome de conjunto (passe o nome como terceiro argumento)
VERIFY: VERDE SEM BANCO (154s) — o banco NÃO foi verificado; registros em /home/joaquim_ataides/.local/state/zapp-verify/7baa0e1f2b76
RC=0
```
(AVISO esperado: este cartão é só de tela, não mexe em banco/migration.)
## FAIXA DO PAI
FAIXA DO PAI: commit `cd211554c1` (e o `a2e02bca2` pulado) do cartão `t_48ac4716` — não são deste cartão. O trabalho do pai (429 = "muitas tentativas") não estava no meu workspace (`git merge-base --is-ancestor a2e02bca2 HEAD` era falso), então trouxe a faixa com o comando do cartão: `git cherry-pick cd211554c1 a2e02bca2`. O commit de código `cd211554c1` entrou em `4f00bb403b` e traz `src/lib/serverLogin.ts` + `src/lib/__tests__/serverLogin.test.ts` (dois arquivos do pai, não deste cartão). O segundo commit (`a2e02bca2`) só mexia no `.tmp/relato.md` do cartão pai, conflitava com o meu relato e foi pulado com `git cherry-pick --skip` — não é código.
## O que NÃO fiz e por quê
- Não implementei a pré-checagem de bloqueio por e-mail (`is_account_locked`): o cartão manda não implementar (risco de enumeração de contas).
- Não mexi em `src/hooks/auth/useAuthForm.ts` nem em `src/components/ui/**`: fora da lista de arquivos do cartão; a mudança cabia inteira em `Auth.tsx`.
## Pontos do juiz automático (não procedem)
- "Um teste que já existia foi removido, pulado ou afrouxado": a única linha que o diff REMOVE é `['429', () => jsonResponse(429, { error: 'Rate limit exceeded' })]`, e ela é do commit do cartão PAI (`cd211554c1`). O pai tirou o 429 do caso genérico de erro/cliente e lhe deu um teste próprio ("429 vira muitas tentativas"), ou seja, REFORÇOU a cobertura. Nenhum teste foi removido ou pulado no MEU commit (`565f77aac9` só cria `Auth.avisos-bloqueio.test.tsx`).
- "Arquivo que o cartão não lista": `src/lib/serverLogin.ts` e `src/lib/__tests__/serverLogin.test.ts` são a faixa do cartão PAI, trazida por ordem da seção DEPENDÊNCIA do cartão (seção FAIXA DO PAI acima). Não são trabalho deste cartão.
