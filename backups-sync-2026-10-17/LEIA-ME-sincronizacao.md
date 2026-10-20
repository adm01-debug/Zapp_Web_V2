# Sincronizar ANTES de limpar — Zapp Web V2
Atualizado em 2026-10-17 08:00 (Hora oficial do Brasil). **Todos os números foram medidos, nenhum estimado.**

## O número que decide tudo
**8.909 commits existem SÓ nesta máquina. O GitHub não tem nenhum deles.**
E o disco Linux (`/dev/sdd`, 1 TB) está em **99% cheio** — 946 GB usados, **9,9 GB livres**.

> Observação honesta: às 07:45 o disco tinha **1,33 GB livres**; às 07:57 tinha **11 GB**. Não fui eu que apaguei
> nada. A hipótese é limpeza automática do `/tmp` (um `FIM` truncado de um script meu mostrou o `/tmp` sendo
> varrido). Trato como **mudança não explicada**, não como ganho garantido — e é por isso que nada foi apagado.

## O COFRE: `~/backups-sync-2026-10-17/` — 980 MB, 536 arquivos, CONFERIDO

### 1. Bundles do git — cópia completa e restaurável do repositório
Cada um passou por `git bundle verify` e respondeu **"The bundle records a complete history."**:

| Arquivo | Tamanho | Refs | Veredito |
|---|---|---|---|
| `zapp-referencia.bundle` (cópia de referência) | 137 MB | 8.955 | completo |
| `bundles/Zapp_Web_V2.bundle` (checkout nível 1) | 116 MB | 5.065 | completo |
| `bundles/n142-banco-leitura-...bundle` | 131 MB | 7.612 | completo |
| `bundles/retomar-automation-...bundle` | 131 MB | 7.615 | completo |
| `bundles/t_682cc676_v2.bundle` | 112 MB | 5.029 | completo |

Incluem as refs `worktrees/*/HEAD` — o estado de cada worktree está registrado.

**Por que 5 bundles e não 1:** a referência tem 4.123 branches mas **não cobre tudo**. Comparação medida
(branches que existem no clone e **não** na referência): `t_682cc676_v2` **669**, `Zapp_Web_V2` (nível 1)
**670**, n142 **69**, retomar **69**, ws1/seed/repo 0. Um bundle só perderia ~670 branches.

### 2. Trabalho NÃO COMMITADO — 156 workspaces, todos os 156 capturados
`trabalho-nao-commitado/<workspace>/`:
- `status.txt` — `git status --porcelain`
- `diff.patch.gz` — diff dos arquivos rastreados (o maior: `t_5f4496a6` 30 MB, `t-1f93b947` 21 MB, `q02-volume-midias` 15 MB)
- `untracked.txt` — lista dos não rastreados
- `untracked.tar.gz` — **conteúdo** dos não rastreados, em 32 workspaces (os de até 50 arquivos: ~62 arquivos no total, 4–116 KB cada)

Total: 17.183 arquivos sujos, 4.670 não rastreados.

### 3. Índices e o script do push
- `branches-exclusivas.txt` — **3.799 das 4.123 branches têm commits que nenhum remoto tem**
- `branches-referencia.txt` (4.123 branches + SHA), `clones.txt` (11.657 linhas)
- `inventario-sujo.txt` — os 156 sujos de 3.304 repositórios com `.git` · `inventario-workspaces.txt`
- `push-branches.sh` — script do push, **`DRY=1` por padrão** (só mostra, não envia), sem `--force`, conflito é registrado e pulado
- `exportar-restante.sh` — refaz a captura do trabalho sujo (idempotente)

## O que NÃO está capturado (e por isso ainda não pode ser apagado)
Três workspaces ficaram de fora da captura de conteúdo dos não rastreados, de propósito, porque a contagem
indica **workspaces aninhados** (escombro), não trabalho de cartão:
`retomar-automation-suggest-reply` (887), `t_682cc676_v2` (1.556), `t-1f93b947` (2.165).
Nos dois primeiros é escombro conhecido; **`t-1f93b947` ainda não foi conferido** e tem 5.069 arquivos sujos
+ patch de 21 MB — conferir antes de apagar.

## Os dois sentidos de "sincronizar" — e o que trava
1. **Trazer do GitHub para cá:** funciona; `git fetch` rodou limpo e o `main` local está **17 commits atrás**
   — falta o `pull`. Mexe na árvore de trabalho: não executo sem ordem sua.
2. **Levar daqui para o GitHub:** **eu não posso.** Guarda:
   `HERMES-GUARD: git push direto é proibido. Feche a tarefa com: hermes-tarefa-fechar ...`
   O caminho existe (cartão + `hermes-tarefa-fechar`), mas é por você ou pelo Claude. Não contorno guarda.

## Ordem correta
1. ~~bundle + captura do trabalho não commitado~~ — **FEITO E CONFERIDO** (980 MB, 5 bundles completos, 156/156)
2. **Push das 3.799 branches** (`push-branches.sh`) — você ou o Claude
3. Só depois: limpeza (Docker build cache 0,72 GB → imagens não usadas 6,6 GB → caches regeneráveis ~25 GB →
   workspaces de cartão fechado)
4. Volumes Docker **por último, um a um**: 68,5 GB "recuperáveis", mas há banco de `atomica-platform`
   (Supabase self-hosted) e `Evolution_Api_Stack` — `docker volume prune` pode apagar dado.

## Achado que explica o disco cheio
Dentro de `~/hermes-workspaces/Zapp_Web_V2/` existem **workspaces aninhados** — `__scratch-t_66e9e2ac`
(17.490 arquivos), `__scratch-t_9b19d420` (11.650), `base-check-*`, `refazer-*` — cada um com `node_modules`.
Somados aos 3.298 worktrees, é o que encheu 1 TB.

## Erros meus, corrigidos (valem como aviso)
1. **"3.303 repositórios git"** → são **6 clones (`.git` pasta) + 3.298 worktrees (`.git` arquivo)**: eu tinha
   usado `-d` no teste e ignorado os worktrees.
2. **O mesmo erro, de novo:** o primeiro script de export também testava `.git` com `-d` e **pulou 3.298
   worktrees em silêncio** — exportou 3 de 156 e "terminou com sucesso". Corrigido para `-e`; reconferido 156/156.
3. **"203.630 arquivos não rastreados"** → não é trabalho: são workspaces aninhados dentro do checkout.
4. **Jobs em background morriam** com o SSH resetando (`Connection reset by peer`, porta 2222) — não era o
   comando, era a sessão. Contornado rodando em primeiro plano.
5. **`du` da árvore inteira morre** (`exit -1`) — e a soma de `du` por workspace **mente para cima** (~1,1–1,4 GB
   cada × 3.196 daria 3,8 TB num disco de 1 TB), porque `bun` instala `node_modules` com *hardlink* para o cache
   global e os worktrees compartilham objetos do git. **O tamanho real de `hermes-workspaces` segue não medido.**
