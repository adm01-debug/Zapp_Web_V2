import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * IA-055 (aceite): o relatorio usa a TARIFA APLICAVEL e diferencia estimativa
 * interna de custo reconciliado.
 *
 * O contrato olha CODIGO, nunca prosa: comentario que EXPLICA o defeito nao pode
 * fazer o teste passar nem falhar (licao paga na IA-056).
 */
const semComentarios = (fonte: string) =>
  fonte
    .split('\n')
    .filter(l => !/^\s*(--|\/\/|\*|\/\*)/.test(l))
    .join('\n');

const ler = (...p: string[]) => semComentarios(readFileSync(resolve(process.cwd(), ...p), 'utf8'));

const SQL = ler('supabase/migrations/20261003102707_ia055_custo_no_relatorio.sql');
const HOOK = ler('src/hooks/analytics/useAIUsageDashboard.ts');
const TELA = ler('src/components/admin/AIUsageDashboard.tsx');

describe('IA-055 — custo pela tarifa vigente, sem inventar numero', () => {
  it('a vigencia e meio-aberta: valid_from <= created_at < valid_to', () => {
    expect(SQL).toMatch(/p\.valid_from\s*<=\s*j\.created_at/);
    expect(SQL).toMatch(/p\.valid_to\s+is\s+null\s+or\s+j\.created_at\s*<\s*p\.valid_to/);
  });

  it('vigencia aberta (valid_to nulo) continua valendo', () => {
    expect(SQL).toMatch(/valid_to\s+is\s+null/i);
  });

  it('empate de vigencia e resolvido pela tarifa reconciliada, nao pela ordem do array', () => {
    // Sem esta regra o mesmo dado daria dois numeros conforme a ordem de leitura.
    expect(SQL).toMatch(/order by[\s\S]{0,120}valid_from desc[\s\S]{0,120}source\s*=\s*'provider_statement'\s*\)\s*desc/);
  });

  it('a funcao e de quem chama (security invoker) — a RLS decide o escopo', () => {
    expect(SQL).toMatch(/security invoker/);
    expect(SQL).not.toMatch(/security definer/);
  });

  it('sem tarifa nao entra como zero: e contado e nomeado', () => {
    expect(SQL).toMatch(/count\(\*\)\s+filter\s+\(where\s+c\.unit_price\s+is\s+null\)/);
    expect(SQL).toMatch(/modelo_sem_tarifa/);
    expect(SQL).toMatch(/sem_quantidade_medida/);
    // o custo so existe onde ha preco E quantidade; o resto nao vira 0
    expect(SQL).toMatch(/where c\.unit_price is not null\s+and c\.total_tokens is not null/);
  });

  it('nao soma moedas diferentes: com duas moedas o total e nulo', () => {
    expect(SQL).toMatch(/count\(distinct currency\)/);
    expect(SQL).toMatch(/quantas\s*=\s*1/);
    expect(SQL).toMatch(/'moedas'/);
    // o total tem de USAR a guarda (nao basta ela existir): com moeda unica soma,
    // com mais de uma devolve nulo.
    expect(SQL).toMatch(/'custo_medido',\s*case when \(select sim from somente_uma_moeda\)[\s\S]{0,80}else null end/);
    expect(SQL).toMatch(/'custo_interno',\s*case when \(select sim from somente_uma_moeda\)/);
    expect(SQL).toMatch(/'custo_reconciliado',\s*case when \(select sim from somente_uma_moeda\)/);
  });

  it('so a unidade que o log mede e aplicavel: caracteres e segundos sao declarados', () => {
    expect(SQL).toMatch(/p\.unit\s*=\s*'token'/);
    expect(SQL).toMatch(/unidades_nao_aplicaveis/);
    expect(SQL).toMatch(/'character',\s*'second'/);
  });

  it('a migracao declara rollback e nao deixa a execucao em PUBLIC', () => {
    const bruto = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20261003102707_ia055_custo_no_relatorio.sql'),
      'utf8',
    );
    expect(bruto).toMatch(/^-- rollback: .*;$|^-- rollback:/m);
    expect(bruto).toMatch(/revoke all on function[\s\S]*?from public, anon/);
    expect(bruto).toMatch(/grant execute on function[\s\S]*?to authenticated, service_role/);
  });
});

describe('IA-055 — o cliente nao faz conta de custo', () => {
  it('o hook busca o custo no servidor e nao multiplica preco localmente', () => {
    expect(HOOK).toMatch(/rpc as unknown as/);
    expect(HOOK).toMatch(/'ai_usage_cost_summary'/);
    // O p_since do CUSTO tem de ser a janela relativa, ancorado na PROPRIA RPC do
    // custo: o regex antigo (/p_since:\s*since/) casava com o `p_since` do resumo
    // (ai_usage_summary) e teria passado mesmo se o custo perdesse o seu p_since.
    // O #264 (cartao 26100607191443) trocou o `since` memoizado na montagem por
    // `janelaAtual()`, que recalcula o limite a cada atualizacao; a garantia do
    // contrato e a mesma (a janela vai para o servidor), so a forma mudou.
    expect(HOOK).toMatch(/ai_usage_cost_summary',\s*\{[\s\S]{0,160}?p_since:\s*janelaAtual\(\)/);
    // a RPC do CUSTO pede a janela inteira (p_until nulo), ancorado na propria RPC
    expect(HOOK).toMatch(/ai_usage_cost_summary',\s*\{[\s\S]{0,140}?p_until:\s*null/);
    // invariante: nenhum preco entra no cliente
    expect(HOOK).not.toMatch(/unit_price/);
    expect(HOOK).not.toMatch(/price/);
    expect(HOOK).not.toMatch(/ai_model_prices/);
  });

  it('o custo so aparece quando veio do servidor (nada de zero fabricado)', () => {
    expect(HOOK).toMatch(/if \(!custos\) return null/);
    expect(HOOK).toMatch(/v == null \? null/);
  });

  it('expoe o custo e o texto ja formatado', () => {
    expect(HOOK).toMatch(/custos:\s*custos\s*\?\?\s*null/);
    expect(HOOK).toMatch(/custoTexto/);
    expect(HOOK).toMatch(/refetchCustos/);
  });

  it('moeda so aparece quando o servidor declarou uma (nao inventa simbolo)', () => {
    expect(HOOK).toMatch(/custos\.moeda[\s\S]{0,120}style:\s*'currency'/);
    expect(HOOK).toMatch(/minimumFractionDigits/);
  });

  it('a tela mostra custo, quebra interno/reconciliado e conta o que ficou sem tarifa', () => {
    expect(TELA).toMatch(/custoTexto\.medido/);
    expect(TELA).toMatch(/custoTexto\.interno/);
    expect(TELA).toMatch(/custoTexto\.reconciliado/);
    expect(TELA).toMatch(/custoTexto\.semTarifa/);
    // "sem total de custo" em vez de zero: zero afirmaria "mediu e deu zero".
    expect(TELA).toMatch(/sem total de custo/);
    // e o ramo e escolhido por VERACIDADE do valor do servidor, nao por comparacao
    // com zero: `=== null ?` (ou `?? 0`) mostraria o ramo errado quando ha custo.
    expect(TELA).toMatch(/custoTexto\.medido\s*\n\s*\?/);
    expect(TELA).not.toMatch(/custoTexto\.medido\s*(===|==)\s*(null|0)/);
    expect(TELA).not.toMatch(/medido\s*\?\?\s*['"]?0/);
  });
});
