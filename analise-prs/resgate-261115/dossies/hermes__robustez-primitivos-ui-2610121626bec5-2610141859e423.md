# hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423

- ref: `origin/hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- tip: `8781671739e45b25bc589f845e9cc0fdff78acea` · merge_base: `088a52382d3da4a2381ebd088e3e646545a11763`
- PRs: nenhuma. Veredito: **PERDIDA_PARCIAL** · `apagar_branch_seguro = false`

## Propósito
Dois commits (`18f65b5b3`, `878167173`): portar da V3 sete lacunas de robustez/acessibilidade dos
primitivos de `src/components/ui` + um arquivo de teste por papel (`robustez-primitivos.test.tsx`, 360 linhas).
Lacunas: (a) descrição de fallback no `DialogContent`; (b) `tabindex=-1` no alvo do skip link;
(c) `setTimeout` limpos no desmonte em `useAnnounce`, `SkipLinks` e `useOfflineStatus`;
(d) `scope="col"` no `TableHead`; (e) `Sparkline` decorativo `aria-hidden`; (f) chave estável no
`AvatarGroup`; (g) `SkipLinks` só renderiza link de alvo existente, sem setState em laço.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `src/components/ui/dialog.tsx` | **PERDIDO** — injeção de descrição de fallback não existe na main. A main mexeu no mesmo arquivo por outro motivo (prop `container` do portal, `z-10`, "Fechar"), daí o CONFLICT. | `git grep -n "describedby\|temFilhoDescricao\|useId" origin/main -- src/components/ui/dialog.tsx` → nada. `git grep -ln "Conteúdo da caixa de diálogo" origin/main -- src/` → nada. `git diff 088a523 origin/main -- src/components/ui/dialog.tsx` mostra só portal/`z-10`/texto do botão. |
| `src/components/ui/skip-link.tsx` | **PARCIAL**: (c) timer do aviso de Tab e (g) guarda de conjunto **já estão na main** (a main foi além: trocou o `setInterval` de 1,5 s por `MutationObserver`); **(b) `tabindex=-1` continua PERDIDO**. | main `src/components/ui/skip-link.tsx:64` `indicatorTimerRef`, cleanup no unmount; `MutationObserver` no lugar do intervalo (`git diff 088a523 origin/main -- src/components/ui/skip-link.tsx`). `git grep -n "tabindex\|tabIndex" origin/main -- src/components/ui/skip-link.tsx` → nada; `handleClick` da main (linhas 20-27) só faz `scrollIntoView` + `focus?.()`. Impacto real: `<nav id="main-navigation">` em `src/components/layout/Sidebar.tsx:101` **não tem** `tabIndex`, então o atalho "pular para navegação" não move o foco (o `<main id="main-content">` de `AppShell.tsx:128` e o de `Auth.tsx:29` já têm `tabIndex={-1}`). O teste da main (`src/components/ui/__tests__/skip-link.test.tsx:20-28`) põe `tabIndex = -1` nos alvos da fixture, então não cobre o caso. |
| `src/components/ui/offline-indicator.tsx` | **INCORPORADA** (implementação diferente). Resta só o refactor `isOnlineRef` + efeito com deps `[]` — a main mantém `}, [isOnline])`; valor baixo (re-assina listeners, sem bug de comportamento). | main linhas 86-100: `wasOfflineTimerRef` + `useEffect(() => () => clearTimeout…, [])`; deps `[isOnline]` em `src/components/ui/offline-indicator.tsx:125`. Teste na main: `src/components/ui/__tests__/timers-unmount.test.tsx:142-174`. |
| `src/components/ui/visually-hidden.tsx` | **PERDIDO** — `useAnnounce` ainda agenda `setTimeout(…, 100)` solto, sem ref nem cleanup. | `git show origin/main:src/components/ui/visually-hidden.tsx` linhas 30-42: `setTimeout(() => setAnnouncement(message), 100);` sem `useRef`/`useEffect` de limpeza. `timers-unmount.test.tsx` da main cobre skip-link, command-palette, buttons, offline-indicator, quick-peek — **não** `useAnnounce`. |
| `src/components/ui/table.tsx` | **PERDIDO** — `TableHead` sem `scope`. | `origin/main:src/components/ui/table.tsx:44-45` → `({ className, ...props }, ref)`, `<th>` sem `scope`. |
| `src/components/ui/sparkline.tsx` | **PERDIDO** — SVG sem `aria-hidden`. | `origin/main:src/components/ui/sparkline.tsx:31` → `<svg … viewBox={…}>`. |
| `src/components/ui/avatar.tsx` | **PERDIDO** — `key={index}`. | `origin/main:src/components/ui/avatar.tsx:173` → `key={index}`. |
| `src/components/ui/__tests__/robustez-primitivos.test.tsx` | **PERDIDO em parte / OBSOLETO em parte**. Não existe na main. Os blocos (a),(b),(c-`useAnnounce`),(d),(e),(f) são portáveis; o bloco **(g) é obsoleto e quebraria**: afirma polling de 1,5 s ("usa polling de 1,5 s com limpeza no desmonte", "alvo montado DEPOIS ganha o link no próximo ciclo de 1,5 s") e a main trocou por `MutationObserver` — e já tem teste que exige o contrário (`timers-unmount.test.tsx:71` "a detecção de alvo é por mutação do documento, não por intervalo"). Os casos de `useOfflineStatus` e do timer do aviso de Tab também já estão cobertos na main. | `git ls-tree -r --name-only origin/main -- src/components/ui/__tests__/` (sem `robustez-primitivos.test.tsx`). |

## O que recuperar (porte sem reler a branch)

### 1. `src/components/ui/dialog.tsx` — descrição de fallback (valor: médio, a11y)
Atenção: a main já alterou esse `DialogContent` (prop `container`, `DialogPortal container={container}`); portar **por cima** da versão da main, não substituir o arquivo. Mover `DialogDescription` para antes de `DialogContent` (é referenciado por `temFilhoDescricao`).

```tsx
const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

function temFilhoDescricao(children: React.ReactNode): boolean {
  let achou = false;
  React.Children.forEach(children, (child) => {
    if (achou || !React.isValidElement(child)) return;
    const tipo = child.type as unknown;
    if (tipo === DialogDescription || tipo === DialogPrimitive.Description) {
      achou = true;
      return;
    }
    const filhos = (child.props as { children?: React.ReactNode } | undefined)?.children;
    if (filhos && temFilhoDescricao(filhos)) achou = true;
  });
  return achou;
}
```

Dentro do `DialogContent` (virou corpo de função com `return`, não arrow implícita):

```tsx
  // A chave é conferida no objeto de props (e não por valor) porque vários diálogos da V2
  // passam `aria-describedby={undefined}` de propósito para silenciar o aviso do Radix.
  const temDescribedByProp = Object.prototype.hasOwnProperty.call(props, 'aria-describedby');
  const autoDescriptionId = React.useId();
  const temDescricaoFilha = temFilhoDescricao(children);
  const needsFallbackDescription = !temDescribedByProp && !temDescricaoFilha;
  // Com <DialogDescription> filho e sem a prop, omitir `aria-describedby` de propósito:
  // passar `undefined` explícito inibe a resolução automática do Radix.
  const describedByProps = temDescribedByProp
    ? { 'aria-describedby': props['aria-describedby'] as string | undefined }
    : needsFallbackDescription
      ? { 'aria-describedby': autoDescriptionId }
      : {};
```
e no `<DialogPrimitive.Content … {...props} {...describedByProps}>`:
```tsx
      {needsFallbackDescription && (
        <DialogPrimitive.Description id={autoDescriptionId} className="sr-only">
          Conteúdo da caixa de diálogo
        </DialogPrimitive.Description>
      )}
```

### 2. `src/components/ui/skip-link.tsx` — alvo focável (valor: médio, a11y)
No `handleClick` da main (antes do `scrollIntoView`):
```tsx
      // Alvos como <main>/<section> não são focáveis por padrão: sem o tabindex=-1
      // o `.focus()` não movia o foco e o atalho não cumpria o papel.
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
```

### 3. `src/components/ui/visually-hidden.tsx` — `useAnnounce` sem timer órfão (valor: médio)
```tsx
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
```
e no `announce`, trocar `setTimeout(() => setAnnouncement(message), 100);` por:
```tsx
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setAnnouncement(message), 100);
```

### 4. `src/components/ui/table.tsx` — `scope="col"` (valor: médio, a11y de tabelas)
```tsx
const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, scope = "col", ...props }, ref) => (
    <th
      ref={ref}
      scope={scope}
```

### 5. `src/components/ui/sparkline.tsx` — decorativo (valor: baixo)
```tsx
    <svg width={width} height={height} className={className} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
```

### 6. `src/components/ui/avatar.tsx` — chave estável (valor: baixo)
```tsx
          key={`${avatar.src ?? ''}-${avatar.alt ?? ''}-${avatar.fallback ?? ''}-${index}`}
```

### 7. Teste — portar SÓ os blocos (a),(b),(c-useAnnounce),(d),(e),(f); **descartar o bloco (g)** (polling obsoleto)
Imports:
```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { SkipLinks } from '@/components/ui/skip-link';
import { useAnnounce } from '@/components/ui/visually-hidden';
import { Table, TableHeader, TableRow, TableHead } from '@/components/ui/table';
import { Sparkline } from '@/components/ui/sparkline';
import { AvatarGroup } from '@/components/ui/avatar';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); document.body.innerHTML = ''; });
```

(a) quatro casos do diálogo:
```tsx
describe('(a) DialogContent — descrição acessível de fallback', () => {
  it('diálogo SEM aria-describedby ganha a descrição oculta em pt-BR', () => {
    render(<Dialog open><DialogContent><DialogTitle>Aviso</DialogTitle></DialogContent></Dialog>);
    const dialogo = screen.getByRole('dialog');
    const id = dialogo.getAttribute('aria-describedby');
    expect(id).toBeTruthy();
    const descricao = document.getElementById(id as string);
    expect(descricao).toHaveTextContent('Conteúdo da caixa de diálogo');
    expect(descricao).toHaveClass('sr-only');
  });

  it('diálogo com aria-describedby={undefined} de propósito NÃO ganha descrição injetada', () => {
    const propsDeProposito = { 'aria-describedby': undefined };
    render(<Dialog open><DialogContent {...propsDeProposito}><DialogTitle>Sem descrição de propósito</DialogTitle></DialogContent></Dialog>);
    expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByText('Conteúdo da caixa de diálogo')).toBeNull();
  });

  it('diálogo com aria-describedby do chamador preserva o valor e não duplica', () => {
    render(<Dialog open><DialogContent aria-describedby="ajuda-do-dialogo"><DialogTitle>Com descrição própria</DialogTitle></DialogContent></Dialog>);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-describedby', 'ajuda-do-dialogo');
    expect(screen.queryByText('Conteúdo da caixa de diálogo')).toBeNull();
  });

  it('diálogo com DialogDescription filho NÃO recebe fallback e mantém o vínculo do Radix', () => {
    render(<Dialog open><DialogContent><DialogTitle>Com descrição real</DialogTitle><DialogDescription>Descrição real do diálogo</DialogDescription></DialogContent></Dialog>);
    const idReal = screen.getByText('Descrição real do diálogo').getAttribute('id');
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-describedby', idReal);
    expect(screen.queryByText('Conteúdo da caixa de diálogo')).toBeNull();
  });
});
```

(b) alvo não focável:
```tsx
describe('(b) SkipLink — alvo não focável', () => {
  it('põe tabindex=-1 no alvo sem tabindex e move o foco para ele', () => {
    Element.prototype.scrollIntoView = vi.fn() as unknown as Element['scrollIntoView'];
    const alvo = document.createElement('section');
    alvo.id = 'main-content';
    document.body.appendChild(alvo);
    expect(alvo.hasAttribute('tabindex')).toBe(false);
    render(<SkipLinks />);
    fireEvent.click(screen.getByRole('link', { name: /pular para conteúdo principal/i }));
    expect(alvo.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(alvo);
  });
});
```

(c) `useAnnounce`:
```tsx
  it('useAnnounce não deixa o temporizador do anúncio pendente ao desmontar', () => {
    vi.useFakeTimers();
    function Harness() { const { announce } = useAnnounce(); return <button onClick={() => announce('pronto')}>anunciar</button>; }
    const { unmount } = render(<Harness />);
    fireEvent.click(screen.getByText('anunciar'));
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
```

(d)/(e)/(f):
```tsx
  it('emite scope="col" por padrão e aceita override', () => {
    render(<table><thead><TableRow><TableHead>Nome</TableHead><TableHead scope="row">Valor</TableHead></TableRow></thead></table>);
    const colunas = screen.getAllByRole('columnheader');
    expect(colunas).toHaveLength(1);
    expect(colunas[0]).toHaveAttribute('scope', 'col');
    expect(screen.getAllByRole('rowheader')[0]).toHaveAttribute('scope', 'row');
  });

  it('marca o SVG como aria-hidden', () => {
    const { container } = render(<Sparkline data={[1, 3, 2]} />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('usa chave derivada do conteúdo: trocar o avatar recria o nó em vez de reusar o índice', () => {
    const { rerender } = render(<AvatarGroup avatars={[{ fallback: 'A' }]} />);
    const antes = screen.getByText('A');
    rerender(<AvatarGroup avatars={[{ fallback: 'Z' }]} />);
    expect(screen.getByText('Z')).not.toBe(antes);
  });
```

Cópia íntegra da versão da branch (para consulta): `/tmp/claude-0/-home-user-Zapp-Web-V2/19ff5006-3a0f-568b-84a1-eb12d2182604/scratchpad/robustez-primitivos.test.tsx.ref`

## Riscos do porte
- `scope="col"` no `TableHead` muda o papel acessível de `cell` para `columnheader`: testes existentes que buscam cabeçalho de tabela por `getByRole('cell')` podem quebrar. Rodar a suíte de componentes que usam `Table` antes da PR.
- `aria-describedby` automático no `DialogContent`: 60+ chamadores já passam `aria-describedby` em `src/components/**` (ver `git grep -c "aria-describedby" origin/main -- src/`); a lógica respeita quem passa a prop (inclusive `undefined`), por isso o `hasOwnProperty` é obrigatório — não trocar por checagem de valor.
- Nada de banco, edge ou workflow neste item.

## Verificação adversarial

Parecer: **CONCORDO com PERDIDA_PARCIAL**. Branch NÃO pode ser apagada. Tentei refutar a triagem procurando
cobertura na main para cada lacuna e não achei nenhuma; e confirmei que as 2 alegadas como já resolvidas de
fato estão resolvidas. `origin/main` em `dac285f62`.

### As 6 lacunas confirmadas ausentes na main (grep contra `origin/main`)
| Lacuna | Comando | Resultado |
|---|---|---|
| dialog fallback a11y | `git grep -nE "describedby\|temFilhoDescricao\|useId" origin/main -- src/components/ui/dialog.tsx` | vazio |
| string do fallback | `git grep -rln "Conteúdo da caixa de diálogo" origin/main -- src/` | vazio |
| skip-link tabindex | `git grep -niE "tabindex" origin/main -- src/components/ui/skip-link.tsx` | vazio |
| TableHead scope | `git grep -n "scope" origin/main -- src/components/ui/table.tsx` | vazio |
| Sparkline aria-hidden | `git grep -n "aria-hidden" origin/main -- src/components/ui/sparkline.tsx` | vazio |
| AvatarGroup chave | `git grep -n "key=" origin/main -- src/components/ui/avatar.tsx` | `avatar.tsx:173: key={index}` (chave por índice intacta) |
| useAnnounce timer | `git grep -nE "timerRef\|clearTimeout" origin/main -- src/components/ui/visually-hidden.tsx` | só `visually-hidden.tsx:37: setTimeout(... , 100)`, sem ref nem cleanup |

Trechos lidos na main que provam a ausência: `origin/main:src/components/ui/dialog.tsx:67-88` (DialogContent só
com `container`/`showCloseButton`, nenhum `aria-describedby`); `origin/main:src/components/ui/skip-link.tsx:20-27`
(handleClick = `scrollIntoView` + `focus?.()`); `origin/main:src/components/ui/table.tsx:44-55` (TableHead sem
`scope`); `origin/main:src/components/ui/avatar.tsx:165-180`; `origin/main:src/components/ui/visually-hidden.tsx:31-38`.

### Não foi remoção deliberada
- `git log -S"tabindex" --oneline origin/main -- src/components/ui/skip-link.tsx` → vazio
- `git log -S"temFilhoDescricao" --oneline origin/main` → vazio
- `git log -S'scope = "col"' --oneline origin/main -- src/components/ui/table.tsx` → vazio
Nunca entraram na main; não há revert/remove desse trabalho. O `312bd5992 revert: desfaz o lote #1976` toca
esses arquivos mas é de outro lote (o lote 880 cartões), não desta paridade a11y.

### Ainda encaixa na main
React `^19.3.1` e `@radix-ui/react-dialog ^1.3.1` (`origin/main:package.json`) → `React.useId` e o aviso do
Radix existem; `DialogPrimitive.Description` continua exportado (`dialog.tsx:112-118`); `TableHead` já usa
`React.ThHTMLAttributes` (aceita `scope` sem mudar o tipo).

### As 2 INCORPORADAS: confirmadas (não são lacuna)
- `useOfflineStatus`: `origin/main:src/components/ui/offline-indicator.tsx:84-125` tem `wasOfflineTimerRef`,
  `useEffect` de cleanup com deps `[]` e o `clearTimeout` antes de reagendar — o vazamento está corrigido por
  caminho próprio. O que a branch tem a mais (`isOnlineRef` para deps `[]`) é refatoração, valor baixo.
- timer do indicador do `SkipLinks`: `origin/main:src/components/ui/skip-link.tsx:64,70-77` (`indicatorTimerRef`
  + `clearTimeout` no cleanup). A detecção de alvo foi trocada por `MutationObserver`
  (`skip-link.tsx:94-108`), não por polling.

### Reforço do impacto do tabindex (confirmado)
`origin/main:src/components/layout/Sidebar.tsx:101` → `<nav id="main-navigation" aria-label="Menu de navegação principal"`
sem `tabIndex`; `AppShell.tsx:128` e `Auth.tsx:29` têm `tabIndex={-1}`. Logo hoje "Pular para navegação" não
move o foco. O teste da main `src/components/ui/__tests__/skip-link.test.tsx:23,26` injeta `main.tabIndex = -1`
e `nav.tabIndex = -1` na fixture — mascara exatamente o bug. Nenhum teste da main cobre `scope`, `aria-hidden`
ou `tabindex` em primitivo (`git grep -nE "scope|aria-hidden|tabIndex"` nos 4 testes de a11y/timers da main →
só as 2 linhas da fixture).

### Achado NOVO para o porte (não estava no dossiê)
O arquivo de teste da branch **não pode ser portado literal**: o bloco `(g) SkipLinks` (linhas 277-345) assume
o polling antigo — `vi.advanceTimersByTime(1500)` e
`expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), 1500)` — e a main usa `MutationObserver`. Esses
5 casos falham na main e devem ser descartados (ou reescritos para mutação). Os casos `(c)` de `SkipLinks` e de
`useOfflineStatus` (linhas 139-246) já estão cobertos por `src/components/ui/__tests__/timers-unmount.test.tsx`.
Aproveitável: `(a)` 4 casos, `(b)` 1, `(c)` useAnnounce 1, `(d)` 1, `(e)` 1, `(f)` 1 — ~9 casos.

### Risco do `scope="col"` — dimensionado
As únicas buscas por `getByRole('cell')` na main são `e2e/multiplix.spec.ts:362,490` e
`e2e/multiplix-responsivo.spec.ts:271`, todas por nome de empresa (célula de corpo, `<td>`), não cabeçalho.
Risco real baixo; ainda assim rodar a suíte de componentes com `Table`.
