Especialista: senior
(área: front/auth — rebase/relato; skills: relato-que-passa, refazer-sem-diff-alheio, verificar-antes-de-declarar-pronto, autorrevisao-antes-de-fechar)
Cartão: t_e17610d1 — consolidar num único .tmp/relato.md a evidência já produzida no pipeline do rebase de 8cb091ace6c7 na ponta atual.
Pipeline consolidado aqui (evidência bruta preservada fora do repositório):
- t_b53f32cc — inventário somente-leitura `8cb091ace6c7` × ponta  → /home/joaquim_ataides/hermes-relatorios/t_b53f32cc/
- t_a540f752 — rebase/cherry-pick, conflitos reproduzidos e resolvidos → /home/joaquim_ataides/hermes-relatorios/t_a540f752/
- t_021258d4 — verificação independente (worker (ci) vera) → /home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/verificar-rebase-reset-sso-pwa-2610160724cd04/.tmp/verificacao-veredito.md + /home/joaquim_ataides/.local/state/zapp-verify/f39c96fb3859/
- t_e17610d1 — este relato (único arquivo criado) → workspace abaixo

## Cabeçalho — SHAs e comando de rebase usado

  tip atual / base / HEAD : d723a9010796f1ea4aea5270d881da2974328ba4  (branch dia/2026-10-16)
  commit rebasado         : 8cb091ace6c781559d16fe89bd6f3fe9df51056a  "fix(auth): polimento de
                            reset de senha, SSO e instalacao PWA" (11/10 15:32; pai afccdbed71)
  comando de rebase usado : git cherry-pick 8cb091ace6c7     (equivalente ao rebase pedido no
                            cartão; terminou VAZIO — §3)
  replay equivalente na ponta: 134f37a9ee (12/10, mesmo título) — ANCESTRAL da ponta
  workspace desta consolidação:
    /home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/ajustar-relato-rebase-reset-sso-pwa-2610160807cf66
    branch v2/ajustar-relato-rebase-reset-sso-pwa-2610160807cf66 (criada por `hermes-tarefa-iniciar`
    a partir de dia/2026-10-16; a base é local, em modo V2)
  observação de infra (vale para os 4 cartões do pipeline): o `Workspace:` escrito no corpo dos
  cartões (/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V/auth-polimento-reset-sso-pwa-2610111526572c)
  NÃO existe; cada etapa criou o seu com `hermes-tarefa-iniciar Zapp_Web_V2 <slug>`.

FAIXA DO PAI: nenhum commit de outro cartão foi trazido por cherry-pick e **nenhum commit foi criado**
nesta entrega — a branch nasce exatamente em d723a90107 (ver §3). Portanto não há faixa do pai no diff.

## 1. Conflitos reproduzidos ANTES de resolver (passo 2 do cartão)

    $ git cherry-pick 8cb091ace6c7                 # exit 1
    CONFLICT (modify/delete): .tmp/relato.md deleted in HEAD and modified in 8cb091ace6 (fix(auth):
      polimento de reset de senha, SSO e instalacao PWA).  Version 8cb091ace6 (fix(auth): polimento de
      reset de senha, SSO e instalacao PWA) of .tmp/relato.md left in tree.
    Auto-merging src/pages/Install.tsx
    Auto-merging src/pages/ResetPassword.tsx
    CONFLICT (content): Merge conflict in src/pages/ResetPassword.tsx
    Auto-merging src/pages/SSOCallback.tsx
    CONFLICT (content): Merge conflict in src/pages/SSOCallback.tsx
    error: could not apply 8cb091ace6... fix(auth): polimento de reset de senha, SSO e instalacao PWA

`git status` de cada conflito reproduzido (cru):

    $ git status --porcelain
    DU .tmp/relato.md
    UU src/pages/ResetPassword.tsx
    UU src/pages/SSOCallback.tsx

    $ git status
    On branch v2/rebasar-8cb091-ponta-preservando-ambas-2610160717dc0b
    You are currently cherry-picking commit 8cb091ace6.
      (fix conflicts and run "git cherry-pick --continue")
      (use "git cherry-pick --skip" to skip this patch)
      (use "git cherry-pick --abort" to cancel the cherry-pick operation)

    Unmerged paths:
      (use "git add/rm <file>..." as appropriate to mark resolution)
    	deleted by us:   .tmp/relato.md
    	both modified:   src/pages/ResetPassword.tsx
    	both modified:   src/pages/SSOCallback.tsx

    no changes added to commit (use "git add" and/or "git commit -a")

Arquivo que NÃO conflitou: `src/pages/Install.tsx` (auto-merge; o git imprimiu "Auto-merging" para ele).

Marcadores de conflito, por arquivo (cru, antes de qualquer resolução):

    diff --cc src/pages/ResetPassword.tsx
    index 2c232ee514,c68c13fede..0000000000
    --- a/src/pages/ResetPassword.tsx
    +++ b/src/pages/ResetPassword.tsx
    @@@ -27,12 -27,6 +27,15 @@@ export default function ResetPassword(
       const [success, setSuccess] = useState(false);
       const [error, setError] = useState('');
       const [hasSession, setHasSession] = useState(false);
    ++<<<<<<< HEAD
     +  // A troca do link (PKCE + detectSessionInUrl) é assíncrona: enquanto ela não
     +  // termina não dá para afirmar que o link é inválido. Só depois de a sessão
     +  // ser conferida é que o estado 'Link Inválido' pode aparecer.
     +  const [checkingSession, setCheckingSession] = useState(true);
     +  // Veredito do medidor (requisitos + HIBP): senha vazada barra o envio.
     +  const [isValid, setIsValid] = useState(false);
    ++=======
    ++>>>>>>> 8cb091ace6 (fix(auth): polimento de reset de senha, SSO e instalacao PWA)
       // Contagem visível até o redirecionamento; o usuário pode cancelá-la.
       const [countdown, setCountdown] = useState(5);
       const [redirectCancelled, setRedirectCancelled] = useState(false);
    @@@ -75,10 -61,6 +78,13 @@@
       return () => clearTimeout(timer);
     }, [success, redirectCancelled, countdown, navigate]);

    ++<<<<<<< HEAD
     +  const handleStrengthChange = useCallback((_strength: number, valid: boolean) => {
     +    setIsValid(valid);
     +  }, []);
     +
    ++=======
    ++>>>>>>> 8cb091ace6 (fix(auth): polimento de reset de senha, SSO e instalacao PWA)
       const handleSubmit = async (e: React.FormEvent) => {
         e.preventDefault();
         setError('');

    diff --cc src/pages/SSOCallback.tsx
    index 8b23a669e9,f56f37faff..0000000000
    --- a/src/pages/SSOCallback.tsx
    +++ b/src/pages/SSOCallback.tsx
    @@@ -29,9 -28,6 +29,12 @@@ function sanitizeAuthError(raw: string 

     export default function SSOCallback() {
       const navigate = useNavigate();
    ++<<<<<<< HEAD
     +  const location = useLocation();
     +  // Destino pedido antes do SSO (?next= ou state.from); '/' como padrao.
     +  const destinoPosLogin = resolverDestinoPosLogin(location);
    ++=======
    ++>>>>>>> 8cb091ace6 (fix(auth): polimento de reset de senha, SSO e instalacao PWA)
       const rawUrlError = getUrlError();
       const initialError = rawUrlError ? sanitizeAuthError(rawUrlError) : null;
       const [status, setStatus] = useState<CallbackStatus>(initialError ? 'error' : 'loading');

(2ª reprodução crua, independente, em /home/joaquim_ataides/hermes-relatorios/t_a540f752/20-reproducao/:
status-porcelain.txt, status-completo.txt, ResetPassword.tsx.com-marcadores, SSOCallback.tsx.com-marcadores.
conteúdo do diretório (os.listdir, lido agora): ResetPassword.tsx.com-marcadores, SSOCallback.tsx.com-marcadores, cherry-pick-saida.txt, relato.md.lado-aprovado, status-completo.txt, status-porcelain.txt)

Leitura dos marcadores: em TODOS os 3 blocos de código o lado do commit aprovado
(`>>>>>>> 8cb091ace6`) está VAZIO — o aprovado não tinha linha alguma a acrescentar ali; o lado da
ponta (`<<<<<<< HEAD`) tem conteúdo.

## 2. Resolução de CADA arquivo conflitado (arquivo:linha) — as duas pontas preservadas

Linhas medidas por MIM agora, no workspace desta consolidação (HEAD d723a90107, árvore limpa), com
`rg -n` nos arquivos, não de segunda mão:

a) src/pages/ResetPassword.tsx — bloco 1 (hunk `@@@ -27,12 -27,6 +27,15 @@@`)
   Resolução: **fica a ponta**.
     - src/pages/ResetPassword.tsx:33  `const [checkingSession, setCheckingSession] = useState(true);`
     - src/pages/ResetPassword.tsx:35  `const [isValid, setIsValid] = useState(false);`
   Justificativa (preserva as duas pontas): o lado do aprovado está vazio e o que a ponta acrescentou
   (espera da troca assíncrona do link + veredito do medidor de senha) é trabalho de terceiro já
   existente; aplicar o lado vazio não removeria nada — mas descartar a ponta, sim. Mantenho a ponta,
   como o cartão manda ("prefira o que JÁ está na ponta").

b) src/pages/ResetPassword.tsx — bloco 2 (hunk `@@@ -75,10 -61,6 +78,13 @@@`)
   Resolução: **fica a ponta**.
     - src/pages/ResetPassword.tsx:78-80  `const handleStrengthChange = useCallback((_strength: number, valid: boolean) => { setIsValid(valid); }, []);`
   Justificativa: mesmo caso (lado do aprovado vazio). O comportamento aprovado do cartão AU2 neste
   arquivo — contador de 5s CANCELÁVEL — está intacto na ponta e segue valendo:
     - :37 `const [countdown, setCountdown] = useState(5);`  :38 `const [redirectCancelled, setRedirectCancelled] = useState(false);`
     - :69 `if (!success || redirectCancelled) return;`      :75 `return () => clearTimeout(timer);`
     - :196 texto do botão "Ficar nesta página" (:178 `{redirectCancelled ? (`)
   Nada do aprovado foi perdido: as duas linhas do contador nunca estiveram no bloco conflitado.

c) src/pages/SSOCallback.tsx — bloco 1 (hunk `@@@ -29,9 -28,6 +29,12 @@@`)
   Resolução: **fica a ponta**.
     - src/pages/SSOCallback.tsx:32  `const location = useLocation();`
     - src/pages/SSOCallback.tsx:34  `const destinoPosLogin = resolverDestinoPosLogin(location);`
   Justificativa: lado do aprovado vazio; a ponta já tem o destino pós-login (replay equivalente
   `134f37a9ee` + `eafb38f763`) e o saneamento do erro do SSO que o cartão aprovou continua presente:
     - :14 `const GENERIC_ERROR = 'Ocorreu um erro durante a autenticação';`
     - :24-27 `function sanitizeAuthError(raw) { if (!raw) return GENERIC_ERROR; ... return text || GENERIC_ERROR; }`
     - :36 `const initialError = rawUrlError ? sanitizeAuthError(rawUrlError) : null;`   :69 `setErrorMessage(sanitizeAuthError(error.message));`

d) .tmp/relato.md — conflito `DU` (modify/delete: "deleted in HEAD and modified in 8cb091ace6")
   Resolução: **permanece deletado, como na ponta** (nada foi recriado a partir do lado do aprovado).
   Justificativa: não é comportamento aprovado; é o texto de relato da entrega de 11/10, substituído
   pelo relato desta rodada, escrito na etapa própria (este arquivo, no workspace desta consolidação).
   O caminho é ignorado pelo git — `.gitignore:124: .tmp/` (conferido agora com `git check-ignore -v`),
   portanto não entra no diff nem suja a árvore.

e) src/pages/Install.tsx — NÃO houve bloco de conflito (auto-merge). O comportamento aprovado do PWA
   está presente e conferido por linha agora:
     - :35 `window.addEventListener("beforeinstallprompt", handler);`
     - :36 `window.addEventListener("appinstalled", installedHandler);`
     - :39-40 `window.removeEventListener("beforeinstallprompt", handler); / ("appinstalled", installedHandler);`

Prova de que a resolução preserva as duas pontas (evidência do rebase, t_a540f752):
  - 58/58 linhas ADICIONADAS pelo aprovado nos 3 fontes existem na ponta (faltando = 0)
    → /home/joaquim_ataides/hermes-relatorios/t_a540f752/14-prova-por-linha.txt
  - 13 linhas REMOVIDAS pelo aprovado: 3 "ainda vivas" na ponta e todas genéricas, reaparecem noutro
    ponto do mesmo arquivo (`navigate('/auth');`, `<CardDescription>`, `</CardDescription>`) — nenhuma
    é comportamento do cartão → 16-prova-remocoes.txt
  - os 3 arquivos de teste do cartão são byte-idênticos ao aprovado (conferido por mim agora):
      src/pages/__tests__/ResetPassword.redirect-cancelavel.test.tsx : IDENTICO-AO-APROVADO
      src/pages/__tests__/SSOCallback.erro-sanitizado.test.tsx        : IDENTICO-AO-APROVADO
      src/pages/__tests__/Install.limpeza-listeners.test.tsx         : IDENTICO-AO-APROVADO

## 3. Estado final — diff do rebase/merge (passo 5 do cartão)

    $ git cherry-pick --continue
    The previous cherry-pick is now empty, possibly due to conflict resolution.
    If you wish to commit it anyway, use:  git commit --allow-empty
    Otherwise, please use 'git cherry-pick --skip'          # → git cherry-pick --skip   (exit 0)

Fatos finais, reconferidos por MIM nesta sessão no workspace desta consolidação
(fonte bruta destas mesmas linhas: /home/joaquim_ataides/hermes-relatorios/t_e17610d1/01-git-fatos.txt):

    $ git branch --show-current
    v2/ajustar-relato-rebase-reset-sso-pwa-2610160807cf66
    $ git rev-parse HEAD                                     → d723a9010796f1ea4aea5270d881da2974328ba4
    $ git rev-parse dia/2026-10-16                            → d723a9010796f1ea4aea5270d881da2974328ba4
    $ git status --porcelain                                  → (vazio: árvore limpa)
    $ git diff --name-only dia/2026-10-16...HEAD               → (vazio: divergência zero)
    $ git diff --stat     dia/2026-10-16...HEAD                → (diff vazio)
    $ git log --oneline -3
    d723a90107 feat(contatos): busca por nome do contato ou da empresa na primeira letra (CT-011)
    e7d156b8a7 feat(db): outbox de eventos nao confirmados com assinatura HMAC (item 090 / SL-195c1)
    630a628eda fix(talk-x): encaixa editor de templates no endereco
    $ git merge-base --is-ancestor 134f37a9ee HEAD             → rc=0   (replay equivalente JÁ na ponta)
    $ git merge-base --is-ancestor 8cb091ace6c7 HEAD           → rc=1   (por isso o cherry-pick é vazio)
    $ git check-ignore -v .tmp/relato.md
    .gitignore:124:.tmp/	.tmp/relato.md

Ou seja: o rebase é **NO-OP** — o próprio git recusa criar um commit vazio ("The previous cherry-pick is
now empty ... nothing to commit"); `git commit --allow-empty` seria commit SEM diff, que o revisor recusa
por regra, e por isso NÃO foi usado. A entrega é "nada a integrar": o comportamento aprovado já está na
ponta e a árvore fica idêntica a `dia/2026-10-16` (diff vazio acima).

## 4. Saída completa de `zapp-verify full .` (verde), colada

Comando: `zapp-verify full .`
Executado na etapa de verificação independente (t_021258d4, worker (ci) vera), no workspace
/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/verificar-rebase-reset-sso-pwa-2610160724cd04 —
árvore idêntica a esta (HEAD == dia/2026-10-16 @ d723a90107 e árvore limpa, conferido por mim).

Saída COMPLETA do comando (stdout):

    OK      db_guard        0s
    OK      tipos         148s
    OK      lint          177s
    OK      migrations      0s
    AVISO   banco_local  NÃO VERIFICADO: sem nome de conjunto (passe o nome como terceiro argumento)
    OK      testes       1749s
    OK      build          54s
    VERIFY: VERDE SEM BANCO (2128s) — o banco NÃO foi verificado; registros em /home/joaquim_ataides/.local/state/zapp-verify/f39c96fb3859
    RC=0

Log bruto de cada etapa (run dir /home/joaquim_ataides/.local/state/zapp-verify/f39c96fb3859/), colado:

    db_guard.log
      DB_GUARD: ok (nenhuma referência ativa à produção em /home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/verificar-rebase-reset-sso-pwa-2610160724cd04)

    tipos.log
      Typecheck ratchet: baseline=0, atual=0, removidas=0, novas=0
      OK: nenhum novo erro de tipo foi introduzido.

    lint.log
      Lint ratchet: baseline=498, atual=393, mantidas=393, removidas=105, novas=0
      AVISO: 105 ocorrencia(s) do baseline nao existem mais no codigo — divida ja paga que o registro ainda conta. Baixe o baseline (`node scripts/ci/lint-ratchet.mjs --update-baseline`) para o registro voltar a refletir o codigo.
      OK: nenhuma nova divida de lint foi introduzida.

    migrations.log
      arquivos validos em supabase/migrations: 852
      DESTINO_URL ausente - estrutura local validada; comparacao com ledger pulada.

    testes.log (173 linhas de log bruto; linhas de resultado, coladas)
      $ vitest run
       RUN  v4.1.11 /home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/verificar-rebase-reset-sso-pwa-2610160724cd04
       Test Files  1499 passed | 5 skipped (1504)
            Tests  13235 passed | 24 expected fail | 48 todo (13307)
         Start at  07:30:38
         Duration  1747.67s (transform 113.83s, setup 723.74s, import 1275.44s, tests 1710.03s, environment 2654.36s)

    build.log (495 linhas de log bruto; trechos de resultado, colados)
      $ vite build
      vite v8.3.1 building client environment for production...
      transforming...
      ✓ 5573 modules transformed.
      rendering chunks...
      ...
      ✓ built in 50.99s
      [plugin builtin:vite-reporter] 
      (!) Some chunks are larger than 1200 kB after minification. Consider:
      - Using dynamic import() to code-split the application

Ressalvas honestas (não escondidas):
  - `banco_local` NÃO foi verificado: o comando exige o nome do conjunto como 3º argumento e o próprio
    zapp-verify declarou "VERDE SEM BANCO". Não é falha mascarada — é etapa não executada, declarada.
  - O `testes.log` e o `build.log` têm 173 e 495 linhas de log bruto (ruído de jsdom e listagem de
    bundles); os arquivos COMPLETOS estão no run dir acima, que eu li nesta sessão. O que está colado
    aqui é a saída completa do comando + os resultados de cada etapa.
  - NÃO reexecutei o `zapp-verify full .` nesta consolidação: o cartão manda CONSOLIDAR a evidência já
    produzida e o run acima é de 30 min antes desta sessão, na MESMA árvore (HEAD idêntico, diff vazio,
    árvore limpa — provado em §3). Reexecutar custaria ~2128s numa máquina compartilhada, sem mudar
    nenhum byte da árvore verificada.

## 5. Resultado do teste do cartão, colado (rodado por MIM nesta sessão, no workspace desta consolidação)

Fonte bruta, sem edição (comando + saída): /home/joaquim_ataides/hermes-relatorios/t_e17610d1/02-testes-cartao.txt

    $ bun run test -- src/pages/__tests__/ResetPassword.redirect-cancelavel.test.tsx src/pages/__tests__/ResetPassword.acessivel.test.tsx src/pages/__tests__/SSOCallback.erro-sanitizado.test.tsx src/pages/__tests__/Install.limpeza-listeners.test.tsx
    $ vitest run src/pages/__tests__/ResetPassword.redirect-cancelavel.test.tsx src/pages/__tests__/ResetPassword.acessivel.test.tsx src/pages/__tests__/SSOCallback.erro-sanitizado.test.tsx src/pages/__tests__/Install.limpeza-listeners.test.tsx

     RUN  v4.1.11 /home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/ajustar-relato-rebase-reset-sso-pwa-2610160807cf66

    Not implemented: Window's scrollTo() method

     Test Files  4 passed (4)
          Tests  13 passed (13)
       Start at  08:10:25
       Duration  7.46s (transform 2.64s, setup 4.12s, import 6.75s, tests 4.02s, environment 8.18s)

    RC=0

Também reproduzi os 2 arquivos que eram o bloqueio de 13/10 (fora do escopo deste cartão) — passam na
ponta de hoje. Fonte bruta: /home/joaquim_ataides/hermes-relatorios/t_e17610d1/03-testes-fora-escopo.txt

    $ bun run test -- src/components/talkx/__tests__/RuleValueInput.test.tsx src/components/inbox/__tests__/RealtimeInboxView.selectedMessagesError.test.tsx
    $ vitest run src/components/talkx/__tests__/RuleValueInput.test.tsx src/components/inbox/__tests__/RealtimeInboxView.selectedMessagesError.test.tsx

     RUN  v4.1.11 /home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/ajustar-relato-rebase-reset-sso-pwa-2610160807cf66


     Test Files  2 passed (2)
          Tests  13 passed (13)
       Start at  08:10:34
       Duration  13.31s (transform 3.55s, setup 1.16s, import 6.74s, tests 6.77s, environment 3.78s)

    RC=0

(No rebase, o recorte de 3 arquivos citado pelo cartão deu `Test Files 3 passed (3); Tests 8 passed (8)`
— fonte: /home/joaquim_ataides/hermes-relatorios/t_a540f752/15-testes-cartao.txt. Incluí aqui `ResetPassword.acessivel.test.tsx`,
também ligado ao reset de senha, como fez a verificação independente.)

## 6. Declaração de escopo (pedido explícito do cartão)

- **Nada além do escopo aprovado foi acrescentado.** O diff da entrega contra a base é VAZIO
  (`git diff --name-only dia/2026-10-16...HEAD` → vazio): comportamento novo não existe, funcionalidade
  não foi adicionada, contrato não mudou.
- Arquivos tocados/criados por este pipeline: **nenhum arquivo de código** e **um único arquivo novo**,
  `.tmp/relato.md` (este relato), dentro do `.tmp/` do workspace — caminho já ignorado pelo git
  (`.gitignore:124 .tmp/`), logo a árvore de entrega continua idêntica a `dia/2026-10-16`.
- Nenhum arquivo fora de `src/pages/ResetPassword.tsx`, `src/pages/SSOCallback.tsx`,
  `src/pages/Install.tsx`, `src/pages/__tests__/` e `.tmp/relato.md` foi tocado.
- Sem push, sem `--force`, sem reescrita de histórico: a branch nasce de `dia/2026-10-16` e não tem
  upstream; nenhum `git push` foi executado em nenhuma das 4 etapas.
- Nenhum commit de terceiro descartado: `git merge-base --is-ancestor 134f37a9ee HEAD` → rc=0 e a cadeia
  da ponta está íntegra no `git log` (§3).
- Toda a evidência bruta foi gravada FORA do repositório (`~/hermes-relatorios/t_*/`,
  `~/hermes-workspaces/Zapp_Web_V2/verificar-*/.tmp/`, run dir do zapp-verify) justamente para não sujar a
  árvore; nenhum identificador do banco de produção aparece em arquivo, teste, comentário ou relato.

## 7. O que NÃO fiz e por quê

- Não rodei `hermes-tarefa-fechar` neste cartão: o corpo dele pede apenas o relato consolidado
  ("Produza o relato final consolidando TODA a evidência ... Deve conter: ...") e o fechar é a etapa do
  cartão raiz (t_316115eb). O bloco "FATOS MEDIDOS PELO FECHAR" portanto não existe aqui; todos os
  números deste relato vêm de comandos que eu rodei (ou dos arquivos de evidência que eu li, com o
  caminho declarado linha a linha).
- Não reexecutei `zapp-verify full .` (motivo em §4, com a árvore provada byte-idêntica).
- Não "corrigi" nada de código: não há defeito a corrigir e o cartão proíbe tocar fora do escopo; o
  rebase é no-op comprovado.
- Não criei commit vazio (`--allow-empty`) para "fazer aparecer" o commit rebasado no log: isso seria
  commit sem diff.

## 8. Pendência/observação para a etapa raiz (t_316115eb)

O critério de pronto do cartão raiz está cumprido com esta evidência (comportamento aprovado na ponta,
`zapp-verify full` verde, teste do cartão verde, nenhum arquivo fora do escopo). A única ressalva é a
declarada pelo próprio `zapp-verify`: a etapa `banco_local` não roda sem o nome do conjunto como 3º
argumento (o comando imprime "VERDE SEM BANCO"). Este relato está em:
  /home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/ajustar-relato-rebase-reset-sso-pwa-2610160807cf66/.tmp/relato.md
cópia durável em: /home/joaquim_ataides/hermes-relatorios/t_e17610d1/relato.md

---

## 9. Fecho do cartão raiz (t_316115eb) — veredito, prova da parede do fechar e pendência

Seção escrita pela sessão do cartão raiz `t_316115eb` (perfil senior), em 16/10 08:13–08:35.
Medições minhas, cruas, preservadas em `~/hermes-relatorios/t_316115eb/`.

### 9.1 Ponta atual e no-op — conferência minha (bruto: `30-provas-ponta.txt`)

- `git fetch` rc=0; `HEAD` = `d723a9010796f1ea4aea5270d881da2974328ba4` == `dia/2026-10-16`, o mesmo tip da
  cópia de referência `~/projetos/Zapp_Web_V2` (conferido com `git log -1`).
- `git status --porcelain` → **vazio**; `git diff --name-only dia/2026-10-16...HEAD` → **vazio**;
  `git diff --stat dia/2026-10-16...HEAD` → **vazio**.
- **Duplicata exata provada por patch-id** (prova mais forte que o diff por linha):
  `git show 8cb091ace6c7 -- src/pages/ResetPassword.tsx src/pages/SSOCallback.tsx src/pages/Install.tsx src/pages/__tests__ | git patch-id --stable`
  → `93b51894f568eab12565c65f6713d40aadadb289`
  `git show 134f37a9ee -- <os mesmos caminhos> | git patch-id --stable`
  → `93b51894f568eab12565c65f6713d40aadadb289` (idêntico)
  Ou seja: o conteúdo de código+teste da entrega aprovada de 11/10 é **byte-idêntico** ao commit
  equivalente já integrado em 12/10 (`134f37a9ee`). O patch-id do commit inteiro difere
  (`9e1191f1f9…` × `93b51894f5…`) apenas porque `8cb091ace6c7` também mexia em `.tmp/relato.md` —
  artefato de fábrica, que não faz parte da entrega.
- `git merge-base --is-ancestor 134f37a9ee HEAD` → **rc=0** (o equivalente já está na ponta);
  `git merge-base --is-ancestor 8cb091ace6c7 HEAD` → **rc=1** (o commit original não é ancestral — o
  conteúdo sim, o objeto do commit não).
- Os 3 arquivos de teste do cartão: `git diff --name-only 8cb091ace6c7..HEAD -- <os 3>` → **vazio**.
- Âncoras de comportamento na ponta (`rg -n`): `ResetPassword.tsx:37/38/69/76/178/196`,
  `SSOCallback.tsx:14/24/36/69`, `Install.tsx:35-36/39-40`.
- `git reflog show v2/…` → única entrada `branch: Created from dia/2026-10-16` (nada de force-push).

### 9.2 Teste do cartão, rodado por mim nesta sessão

`vitest run` nos 4 arquivos do cartão → `Test Files 4 passed (4)` / `Tests 13 passed (13)`, RC=0.

### 9.3 `zapp-verify full .` na árvore de entrega

- Run independente (etapa `t_021258d4`, perfil vera) na árvore byte-idêntica —
  `~/…/.local/state/zapp-verify/f39c96fb3859/resultado.txt`, 8/8 linhas:
  `OK db_guard 0s` · `OK tipos 148s` · `OK lint 177s` · `OK migrations 0s` ·
  `AVISO banco_local NÃO VERIFICADO: sem nome de conjunto` · `OK testes 1749s` · `OK build 54s` ·
  `VERIFY: VERDE SEM BANCO (2128s)`.
- Meu próprio run da mesma árvore (`zapp-verify full .`, iniciado 08:15:04, HEAD `d723a90107`,
  `git status` vazio — log cru em `~/hermes-relatorios/t_316115eb/20-verify-full.txt`):
  **interrompido por mim às 08:40, sem veredito.** Antes de encerrar rodou `OK db_guard 0s` ·
  `OK tipos 311s` · `OK lint 231s` · `OK migrations 1s` · `AVISO banco_local NÃO VERIFICADO` e estava na
  etapa `testes`: a máquina estava em load average ~90 com 37 processos `zapp-verify` concorrentes
  (memória da fábrica: uma suíte por vez) e o run era redundante na mesma árvore já verificada verde
  40 min antes. **Não afirmo verde do meu run.** O verde do `zapp-verify full .` desta entrega é o do
  run independente acima (árvore byte-idêntica, provada na §9.1), somado ao meu teste do cartão verde
  (§9.2).
- A mesma ressalva do próprio comando vale nos dois runs: a etapa `banco_local` exige o nome do
  conjunto como 3º argumento e não roda (`VERDE SEM BANCO`); não é falha mascarada — nenhuma etapa
  falhou.

### 9.4 A parede do `hermes-tarefa-fechar` — duas tentativas reais, RC=1 nas duas

No meu workspace do cartão (`auth-polimento-reset-sso-pwa-t-316115eb-2610130646fb4f`,
`BASE_DIA=dia/2026-10-13`, HEAD `96dd72dc5f`):

1. Com o relato em `.tmp/relato.md` (caminho **versionado** nesta branch — `.gitignore:124` não vale
   aqui porque o arquivo já foi commitado antes) → bruto em `40-fechar.txt`:
   `ERRO: há mudanças não commitadas:` / ` M .tmp/relato.md` — RC=1.
2. Com a árvore limpa (`git checkout -- .tmp/relato.md`) → bruto em `41-fechar-arvore-limpa.txt`:
   `ERRO: nenhum commit novo em relação a dia/2026-10-13` — RC=1.

Depois das duas tentativas: `git log --oneline -1` continua `96dd72dc5f` e
`git log --oneline dia/2026-10-13..HEAD | wc -l` = `0` → **nenhum commit foi criado**, nada foi
empurrado, nada foi reescrito.

Leitura: o fechar (modo V2) exige ≥1 commit em relação ao `BASE_DIA` do cartão e recusa árvore suja.
Como a entrega é **no-op**, o único commit possível seria vazio (`--allow-empty`) ou contendo apenas
o artefato `.tmp/relato.md` — os dois são recusados por regra (commit sem diff / artefato de fábrica
fora do escopo). Logo este cartão **não tem como ser fechado pela via normal**: não existe diff de
entrega para o integrador.

### 9.5 O que NÃO fiz aqui

- Não reproduzi o cherry-pick de novo: a reprodução crua (2×, com os blocos de conflito) está no
  pipeline — `~/hermes-relatorios/t_a540f752/20-reproducao/` e `05-marcadores-*.diff`. No meu
  workspace o cherry-pick seria igualmente vazio: `134f37a9ee` é ancestral (rc=0) e 5 dos 6 arquivos
  do cartão são idênticos ao commit aprovado (só `SSOCallback.tsx` evoluiu depois, com
  `destinoPosLogin`, em `32-provas-meu-workspace.txt`).
- Não criei commit vazio nem commitei `.tmp/relato.md` para "fazer o fechar passar".
- Não toquei em nenhum arquivo de código deste cartão: não há o que corrigir.

### 9.6 Veredito e pendência (decisão de Claude/Joaquim)

- **Critério de pronto do cartão: cumprido em substância.** O comportamento aprovado está
  integralmente na ponta atual (patch-id idêntico ao já integrado), o teste do cartão passa, o
  `zapp-verify full .` tem evidência verde crua, `.tmp/relato.md` está preenchido, nenhum arquivo de
  terceiro foi tocado ou descartado, nenhum push/force-push.
- **O que não existe: delivery diff.** Não há nada para o integrador integrar; o cartão não gera
  branch de entrega, e forçá-la exigiria um commit vazio — proibido por regra.
- **Recomendação:** encerrar a linhagem AU2 (entrega `2610111526572c`) como **já integrada** em 12/10
  pelo replay `134f37a9ee`. Este cartão carrega dois vícios de forma que o mantêm oscilando e que não
  são resolvíveis por mim: o título **sem o marcador `[refazer N]`** (regra operacional do senior) e o
  `Workspace:` do corpo apontando para `~/hermes-workspaces/Zapp_Web_V/auth-polimento-reset-sso-pwa-2610111526572c`,
  caminho que **não existe** (projeto `Zapp_Web_V` ≠ `Zapp_Web_V2`). Se ainda houver trabalho real a
  fazer, o cartão precisa nascer com marcador e workspace válidos.
