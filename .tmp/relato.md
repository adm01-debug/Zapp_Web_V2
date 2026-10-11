Especialista: worker (testes) (area-testes-do-produto)

## O que mudou e por quê
- `src/components/tasks/__tests__/kpiBarraEtapas029a047.test.tsx` (novo): fecha as LACUNAS das quatro etapas do cartão — (029) o clique no KPI que FILTRA a Lista de ponta a ponta, módulo + hook + URL, e o segundo clique que remove (§3.1, linhas 41–45 da imagem 01); (030) o contraste AA dos KPIs na tela REAL, nos 4 temas, com o mesmo medidor WCAG do módulo; (047) a ordem de foco da barra `busca → Prioridade → Contato → Filtros`. Traz também a MEDIDA REGISTRADA (não é aprovação) do subtítulo `/80` e dos ícones decorativos dos tiles.
- O que as etapas JÁ tinham é só conferido, não reescrito (regra do cartão): 029 textos/singular-plural/estados 0-atenção-limite/compacto/`1,4 dias` e o callback do clique em `kpiStripTarefas.test.tsx`; 046 busca/dropdowns/popover/chips/sincronia com a URL/toggle de concluídas em `barraFiltros.test.tsx` e a dica "Enter para criar" em `barraCapturaDisposicao.test.tsx`; 047 o atalho `/` em `barraFiltros` e as teclas 1/2/3 em `TasksModule.atalhosDeModo.test.tsx`.
- A faixa dos pais não estava na branch do dia (conferido por conteúdo, não por `.v2-fila`): os commits de `t_0c220fdd` (06e81c9c6) e `t_2a65fbc1` (c572842a3) foram trazidos por cherry-pick, como o cartão manda. Dois conflitos da faixa compartilhada (comentário em `useTasksFilters.ts`, com `case 'due'` repetido, e `workItem.types.ts`) foram resolvidos mantendo o texto já aplicado, sem afrouxar nada.

## Prova
- vermelho antes (mutando a produção, restaurando em seguida; cada teste falha SEM a sua produção):
  - 029 — `alternarRecortePrazo` deixando de aplicar o recorte → `× clicar em "Atrasadas" recorta a Lista e escreve o recorte na URL; clicar de novo remove`.
  - 030 AA — `--muted-foreground: 221 10% 80%` → `× o valor usa o texto cheio do tema e o rótulo, o apoio`.
  - 030 par de TEXTO — remap `.text-destructive` removido de `utilities.css` → `× o subtítulo de atenção usa o par de TEXTO do estado`.
  - 030 decorativo — `aria-hidden` tirado do anel de progresso → `× o ícone dos tiles é decorativo (o nome vem do texto ao lado)`.
  - 047 ordem de foco — `controlesPrioContato` renderizado antes da busca → `× no teclado, a barra vai de busca → Prioridade → Contato → Filtros`.
- verde depois: `npx vitest run src/components/tasks/__tests__/kpiBarraEtapas029a047.test.tsx` → `Test Files 1 passed (1); Tests 6 passed (6)`.
- base inteira do módulo (a faixa herdada + o novo arquivo): `npx vitest run useTasksFilters TasksModule barraFiltros kpiStripTarefas contagensReaisVsFiltradas TasksModule.atalhosDeModo` → `Test Files 6 passed (6); Tests 86 passed (86)`.

## O que NÃO fiz e por quê
- Não toquei produção (o cartão só permite `src/components/tasks/__tests__/`). O subtítulo de apoio `text-muted-foreground/80` do KPI fica em 3,88:1 no tema CLARO — é texto, logo abaixo do AA; o remap do módulo cobre `/70` e `/60`, mas não o `/80`. Fica REGISTRADO no teste (medida travada) e vira `kanban_comment` para a etapa 183 (auditoria do designer), que é de quem muda token.
- Os ícones dos tiles ficam em 2,11 / 1,51 / 1,62 no claro, mas são DECORATIVOS (`aria-hidden`, o nome vem do texto ao lado): a WCAG 1.4.11 (3:1) não se aplica — e o teste trava esse contrato.
- Não reescrevi teste de etapa já coberta nem mexi em arquivo fora da minha lista.
