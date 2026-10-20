import { useState } from 'react';
import { Filter, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  RULE_FIELDS, RULE_OPS, emptyRules,
  type RuleField, type RuleOp, type SegmentRule, type SegmentRules,
} from '@/hooks/integrations/useTalkXSegments';

/**
 * X126 — trilha "Filtros de audiência" do passo 1 (mock 08).
 *
 * Os 7 controles na ordem do mock — Tags (múltipla), Status do contato, Empresa,
 * Estágio no funil, Vendedor, RFM, Localização (UF e cidade) — e TODOS leem
 * opções e operadores do catálogo de filtros da trilha de segmentos
 * (`RULE_FIELDS`/`RULE_OPS`), o mesmo que o construtor de segmentos usa. Cada
 * escolha vira uma regra no MESMO JSON de `audience_filters`, então a regra
 * montada aqui é a que o motor (`talkx_resolve_audience`) compila.
 *
 * Campo cuja coluna da projeção ainda não entra no motor continua na ordem do
 * mock, DESABILITADO com "sem dados ainda" (A9) — em vez de sumir como faziam
 * os selects de Empresa/Tag antigos. A lista de campos aceitos pelo motor é a
 * whitelist da migration `20261002391230_talkx_audience_rpc.sql` (linhas
 * 140-163): mandar um campo fora dela derruba a consulta com
 * `invalid_talkx_audience_field`, então um controle sem coluna nunca emite
 * regra.
 */

/** Rótulo único do estado "a coluna ainda não tem dado" (A9). */
const NO_DATA_LABEL = 'sem dados ainda';

/** Valor do item "todos" nos selects (o Radix não aceita item de valor vazio). */
const ANY_VALUE = 'all';

export type AudienceFilterKey =
  | 'tags' | 'contact_status' | 'company' | 'funnel_stage' | 'seller' | 'rfm' | 'location';

export interface AudienceFilterSpec {
  key: AudienceFilterKey;
  label: string;
  /** Campo do catálogo dos segmentos; `null` = a coluna ainda não existe no motor. */
  field: RuleField | null;
  /** Seleção múltipla: uma regra por valor escolhido (Tags). */
  multi?: boolean;
}

/** Os 7 controles, na ordem do mock 08. */
const AUDIENCE_FILTERS: AudienceFilterSpec[] = [
  { key: 'tags', label: 'Tags', field: 'tags', multi: true },
  { key: 'contact_status', label: 'Status do contato', field: 'conversation_status' },
  { key: 'company', label: 'Empresa', field: 'company' },
  // `dados:estagio_funil` e `dados:segmento_rfm` são colunas da projeção que o
  // motor de audiência ainda não aceita (nem existem no catálogo dos segmentos).
  { key: 'funnel_stage', label: 'Estágio no funil', field: null },
  { key: 'seller', label: 'Vendedor', field: 'assigned_to' },
  { key: 'rfm', label: 'RFM', field: null },
  { key: 'location', label: 'Localização', field: 'state' },
];

export interface AudienceFilterOptions {
  /** Tags que existem na base carregada (opções do controle "Tags"). */
  tags: string[];
  /** Empresas que existem na base carregada (opções do controle "Empresa"). */
  companies: string[];
  /** Perfis ativos que podem ser responsáveis (opções do controle "Vendedor"). */
  sellers: { id: string; name: string }[];
}

/* ------------------------------------------------------------------ */
/* Regras: leitura e escrita (mesmo formato do motor dos segmentos)    */
/* ------------------------------------------------------------------ */

const freshId = () => globalThis.crypto.randomUUID();

/**
 * Campos que os 7 controles escrevem. Um controle só é dono da regra do seu
 * campo com o operador do catálogo (`catalogOp`) e no PRIMEIRO grupo — o mesmo
 * grupo em que ele grava. Qualquer outra regra do rascunho (outro operador,
 * campo date/number, regra de outro grupo) fica intocada pelos controles e
 * aparece em "Outras regras", com remover.
 */
const CONTROLLED_FIELDS: RuleField[] = ['tags', 'conversation_status', 'company', 'assigned_to', 'state', 'city'];

function firstGroup(rules: SegmentRules) {
  return rules.groups.length > 0
    ? rules.groups
    : [{ id: freshId(), match: 'and' as const, rules: [] as SegmentRule[] }];
}

function mapFirstGroup(rules: SegmentRules, mutate: (rules: SegmentRule[]) => SegmentRule[]): SegmentRules {
  const [first, ...rest] = firstGroup(rules);
  return { groups: [{ ...first, rules: mutate(first.rules) }, ...rest] };
}

/** Entrada do catálogo dos segmentos para o campo. */
function catalogField(field: RuleField) {
  return RULE_FIELDS.find((definition) => definition.value === field) ?? null;
}

/** Operador que o catálogo oferece para o campo (o mesmo do editor de segmentos). */
function catalogOp(field: RuleField): RuleOp {
  const ops = RULE_OPS[catalogField(field)?.kind ?? 'text'] ?? RULE_OPS.text;
  return (ops.find((op) => op.value === 'eq') ?? ops[0]).value;
}

/** A regra é de um dos controles (campo + operador do controle)? */
function isControlledRule(rule: SegmentRule): boolean {
  return CONTROLLED_FIELDS.includes(rule.field) && rule.op === catalogOp(rule.field);
}

/** Regra do controle `field` (mesmo campo e mesmo operador do controle). */
function isFieldControlRule(rule: SegmentRule, field: RuleField): boolean {
  return rule.field === field && rule.op === catalogOp(field);
}

/**
 * Valor digitado → valor da regra. A classe CSS `uppercase` do campo UF só muda
 * o desenho: o valor gravado precisa sair normalizado ('sp' → 'SP'), e espaço
 * nas pontas nunca entra na regra (o motor compara com `eq`).
 */
function normalizeValue(field: RuleField, value: string): string {
  const trimmed = value.trim();
  return field === 'state' ? trimmed.toUpperCase() : trimmed;
}

/**
 * Valores do controle — lidos do PRIMEIRO grupo, o mesmo em que `setFilterValue`
 * e `toggleFilterValue` gravam (ler de um grupo e escrever em outro deixaria
 * na tela um valor que o controle não consegue tirar).
 */
function filterValues(rules: SegmentRules, field: RuleField): string[] {
  const [first] = rules.groups;
  return (first?.rules ?? [])
    .filter((rule) => isFieldControlRule(rule, field) && rule.value.trim())
    .map((rule) => rule.value);
}

/**
 * Substitui o valor do controle (vazio = remove a regra). Só mexe na regra do
 * próprio controle: uma regra do mesmo campo com outro operador (ex.: Empresa
 * "contém") é preservada como está, com o operador salvo, em "Outras regras".
 */
function setFilterValue(rules: SegmentRules, field: RuleField, value: string): SegmentRules {
  const normalized = normalizeValue(field, value);
  return mapFirstGroup(rules, (kept) => {
    const withoutControl = kept.filter((rule) => !isFieldControlRule(rule, field));
    return normalized
      ? [...withoutControl, { id: freshId(), field, op: catalogOp(field), value: normalized }]
      : withoutControl;
  });
}

/** Liga/desliga um valor de campo múltiplo — uma regra por valor. */
function toggleFilterValue(rules: SegmentRules, field: RuleField, value: string): SegmentRules {
  const normalized = normalizeValue(field, value);
  return mapFirstGroup(rules, (kept) => {
    const withoutValue = kept.filter((rule) => !(isFieldControlRule(rule, field) && rule.value === normalized));
    return withoutValue.length === kept.length
      ? [...kept, { id: freshId(), field, op: catalogOp(field), value: normalized }]
      : withoutValue;
  });
}

/** Remove uma regra pelo id; grupo extra que fica vazio sai junto. */
function removeRule(rules: SegmentRules, id: string): SegmentRules {
  return {
    groups: rules.groups
      .map((group) => ({ ...group, rules: group.rules.filter((rule) => rule.id !== id) }))
      .filter((group, index) => index === 0 || group.rules.length > 0),
  };
}

function hasAudienceRules(rules: SegmentRules): boolean {
  return rules.groups.some((group) => group.rules.length > 0);
}

/** Junta as opções da base com os valores já gravados (valor gravado nunca some da tela). */
function withSaved(list: string[], saved: string[]): string[] {
  return Array.from(new Set([...list, ...saved]));
}

const MATCH_LABEL = { and: 'todas as regras (E)', or: 'qualquer regra (OU)' } as const;

/** "Campo · operador · valor" com os rótulos do catálogo. */
function describeRule(rule: SegmentRule, options: AudienceFilterOptions): string {
  const definition = catalogField(rule.field);
  const ops = RULE_OPS[definition?.kind ?? 'text'] ?? RULE_OPS.text;
  const opLabel = ops.find((op) => op.value === rule.op)?.label ?? rule.op;
  const parts = [definition?.label ?? rule.field, opLabel];
  if (rule.op !== 'is_set' && rule.op !== 'is_empty') {
    const value = rule.value.trim();
    const seller = rule.field === 'assigned_to' ? options.sellers.find((item) => item.id === value) : undefined;
    parts.push(seller?.name ?? (value || '(sem valor)'));
  }
  return parts.join(' · ');
}

/* ------------------------------------------------------------------ */
/* UI                                                                  */
/* ------------------------------------------------------------------ */

interface Props {
  rules: SegmentRules;
  onChange: (rules: SegmentRules) => void;
  options: AudienceFilterOptions;
  /** Limpezas adicionais do consumidor ao "Limpar filtros" (ex.: busca textual). */
  onClear?: () => void;
}

/** A9 — controle desabilitado, mas presente e dito em voz alta. */
function NoDataFilter() {
  return (
    <button
      type="button"
      disabled
      className="h-9 w-full rounded-lg border border-dashed border-border/70 bg-input/20 px-2.5 text-left text-2xs text-muted-foreground cursor-not-allowed"
    >
      {NO_DATA_LABEL}
    </button>
  );
}

function TextFilter({ field, label, placeholder, maxLength, upper, rules, onChange }: {
  field: RuleField; label: string; placeholder: string; maxLength?: number; upper?: boolean;
  rules: SegmentRules; onChange: (rules: SegmentRules) => void;
}) {
  // A regra guarda o valor normalizado (sem espaço nas pontas); o campo mostra
  // o que a pessoa digitou enquanto equivaler à regra — assim o espaço entre
  // palavras ("São Paulo") não some na tecla seguinte. Se a regra mudar por
  // fora (ex.: "Limpar filtros"), o campo passa a mostrar a regra.
  const saved = filterValues(rules, field)[0] ?? '';
  const [draft, setDraft] = useState(saved);
  const shown = normalizeValue(field, draft) === saved ? draft : saved;
  return (
    <Input
      value={shown}
      onChange={(event) => {
        setDraft(event.target.value);
        onChange(setFilterValue(rules, field, event.target.value));
      }}
      aria-label={label}
      placeholder={placeholder}
      maxLength={maxLength}
      className={upper ? 'h-9 text-xs bg-input/40 border-border/70 uppercase' : 'h-9 text-xs bg-input/40 border-border/70'}
    />
  );
}

function SelectFilter({ label, value, optionList, rules, field, onChange }: {
  label: string;
  value: string;
  optionList: { value: string; label: string }[];
  rules: SegmentRules;
  field: RuleField;
  onChange: (rules: SegmentRules) => void;
}) {
  return (
    <Select
      value={value || ANY_VALUE}
      onValueChange={(next) => onChange(setFilterValue(rules, field, next === ANY_VALUE ? '' : next))}
    >
      <SelectTrigger aria-label={label} className="h-9 text-xs bg-input/40 border-border/70">
        <SelectValue placeholder="Todos" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY_VALUE}>Todos</SelectItem>
        {optionList.map((option) => (
          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function FilterControl({ spec, rules, onChange, options }: {
  spec: AudienceFilterSpec; rules: SegmentRules; onChange: (rules: SegmentRules) => void; options: AudienceFilterOptions;
}) {
  // A9 — a coluna não existe no motor ainda: continua na ordem do mock, desabilitado.
  if (!spec.field) return <NoDataFilter />;
  const field = spec.field;

  if (spec.key === 'tags') {
    const selected = filterValues(rules, field);
    const tagList = withSaved(options.tags, selected);
    if (tagList.length === 0) return <NoDataFilter />;
    return (
      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
        {tagList.map((tag) => (
          <label key={tag} className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer">
            <Checkbox
              checked={selected.includes(tag)}
              onCheckedChange={() => onChange(toggleFilterValue(rules, field, tag))}
              aria-label={tag}
            />
            <span className="truncate max-w-[140px]">{tag}</span>
          </label>
        ))}
      </div>
    );
  }

  if (spec.key === 'location') {
    return (
      <div className="space-y-2">
        <TextFilter field="state" label="UF" placeholder="UF" maxLength={2} upper rules={rules} onChange={onChange} />
        <TextFilter field="city" label="Cidade" placeholder="Cidade" rules={rules} onChange={onChange} />
      </div>
    );
  }

  const savedValues = filterValues(rules, field);

  if (spec.key === 'company') {
    const companyList = withSaved(options.companies, savedValues);
    if (companyList.length === 0) return <NoDataFilter />;
    return (
      <SelectFilter
        label="Empresa"
        field={field}
        value={savedValues[0] ?? ''}
        optionList={companyList.map((company) => ({ value: company, label: company }))}
        rules={rules}
        onChange={onChange}
      />
    );
  }

  if (spec.key === 'seller') {
    const sellerList = [
      ...options.sellers.map((seller) => ({ value: seller.id, label: seller.name })),
      ...savedValues
        .filter((id) => !options.sellers.some((seller) => seller.id === id))
        .map((id) => ({ value: id, label: 'Responsável fora da lista' })),
    ];
    if (sellerList.length === 0) return <NoDataFilter />;
    return (
      <SelectFilter
        label="Vendedor"
        field={field}
        value={savedValues[0] ?? ''}
        optionList={sellerList}
        rules={rules}
        onChange={onChange}
      />
    );
  }

  // Status do contato: opções e operador vêm do catálogo dos segmentos.
  const catalogEntry = catalogField(field);
  const catalogOptions = withSaved(catalogEntry?.options ?? [], savedValues);
  if (catalogOptions.length === 0) return <NoDataFilter />;
  return (
    <SelectFilter
      label="Status do contato"
      field={field}
      value={savedValues[0] ?? ''}
      optionList={catalogOptions.map((option) => ({ value: option, label: option }))}
      rules={rules}
      onChange={onChange}
    />
  );
}

/**
 * Regras do rascunho que os 7 controles não mostram: campo fora deles (ex.:
 * date/number do catálogo), outro operador, ou regra de um grupo além do
 * primeiro. Elas continuam filtrando o público, então ficam à vista, com o
 * modo de combinação do grupo, e podem ser removidas uma a uma.
 */
function OtherRules({ rules, onChange, options }: {
  rules: SegmentRules; onChange: (rules: SegmentRules) => void; options: AudienceFilterOptions;
}) {
  const firstIsOr = rules.groups[0]?.match === 'or' && rules.groups[0].rules.length > 1;
  const sections = rules.groups
    .map((group, index) => ({
      group,
      index,
      items: group.rules.filter((rule) => index > 0 || !isControlledRule(rule)),
    }))
    .filter((section) => section.items.length > 0 || (section.index === 0 && firstIsOr));
  if (sections.length === 0) return null;
  const showGroups = rules.groups.length > 1 || firstIsOr;

  return (
    <div
      role="group"
      aria-label="Outras regras"
      data-talkx-other-rules
      className="space-y-2 rounded-xl border border-border/70 bg-input/30 p-3"
    >
      <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Outras regras</p>
      <p className="text-2xs text-muted-foreground">
        Regras deste rascunho que os filtros acima não mostram. Elas continuam valendo no público.
        {rules.groups.length > 1 && ' Os grupos se somam: o contato entra se atender a qualquer um deles.'}
      </p>
      {sections.map(({ group, index, items }) => (
        <div key={group.id} className="space-y-1.5" data-talkx-rule-group={index + 1}>
          {showGroups && (
            <p className="text-2xs font-medium text-foreground">
              {`Grupo ${index + 1}${index === 0 ? ' (o dos filtros acima)' : ''} · ${MATCH_LABEL[group.match]}`}
            </p>
          )}
          {items.map((rule) => {
            const text = describeRule(rule, options);
            return (
              <div key={rule.id} className="flex items-center justify-between gap-2 text-xs text-foreground">
                <span className="truncate">{text}</span>
                <button
                  type="button"
                  onClick={() => onChange(removeRule(rules, rule.id))}
                  aria-label={`Remover regra ${text}`}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function TalkXAudienceFilters({ rules, onChange, options, onClear }: Props) {
  const active = hasAudienceRules(rules);
  return (
    <div className="space-y-3" data-talkx-audience-filters>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5" /> Filtros de audiência
        </p>
        <button
          type="button"
          onClick={() => { onChange(emptyRules()); onClear?.(); }}
          disabled={!active}
          className="text-xs font-medium text-primary-glow hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Limpar filtros
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {AUDIENCE_FILTERS.map((spec) => (
          <div
            key={spec.key}
            role="group"
            aria-label={spec.label}
            data-talkx-filter={spec.key}
            className="space-y-2 rounded-xl border border-border/70 bg-input/30 p-3"
          >
            <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">{spec.label}</p>
            <FilterControl spec={spec} rules={rules} onChange={onChange} options={options} />
          </div>
        ))}
      </div>
      <OtherRules rules={rules} onChange={onChange} options={options} />
    </div>
  );
}
