#!/usr/bin/env python3
"""Consolida os resultados das frentes de auditoria num relatorio unico.

Le todo $DIR/resultados/*.json (saida bruta de cada Workflow) e emite markdown:
- censo por frente (quantas entradas, veredito mantido/derrubado)
- tabela dos itens confirmados, por impacto e bloqueio
Nao inventa nada: so agrega o que os agentes devolveram com evidencia.
"""
import json
import os
import sys
import collections

DIR = os.path.dirname(os.path.abspath(__file__))
RES = os.path.join(DIR, 'resultados')

ROTULO = {
    'nenhum': 'eu executo',
    'ci_workflow': 'CI/workflow — para com o dono',
    'migration_producao': 'migration em producao — para com o dono',
    'talkx_freeze': 'congelamento do Talk X — para com o dono',
    'decisao_dono': 'decisao do dono',
}
ORDEM_VALOR = {'alto': 0, 'medio': 1, 'baixo': 2}


def carregar(path):
    with open(path, encoding='utf-8') as fh:
        d = json.load(fh)
    return d.get('result', d)


def main():
    frentes = []
    itens = []
    for nome in sorted(os.listdir(RES)):
        if not nome.endswith('.json'):
            continue
        r = carregar(os.path.join(RES, nome))
        c = r.get('contagem', {})
        if 'pendentes_confirmados' in r:          # frente de revalidacao de lacunas
            lst = r['pendentes_confirmados']
            frentes.append({
                'arquivo': nome, 'tipo': 'lacunas',
                # o total de branches do lote nao vem no resultado; nao inventar numero
                'entradas': None,
                'ja_na_main': c.get('ja_na_main', 0), 'obsoleta': c.get('obsoleta', 0),
                'alegados': c.get('pendente', 0), 'refutados': c.get('refutados', 0),
                'confirmados': c.get('confirmados', 0), 'indeciso': c.get('indeciso', 0),
            })
            for x in lst:
                itens.append({**x, 'prova': x.get('evidencia', ''), 'frente': nome})
        else:                                      # frente de auditoria de veredito
            lst = r.get('a_recuperar', [])
            frentes.append({
                'arquivo': nome, 'tipo': 'veredito', 'modo': r.get('modo'),
                'entradas': c.get('branches', 0), 'sem_resultado': c.get('sem_resultado', 0),
                'veredito_ok': c.get('veredito_ok', 0), 'derrubado': c.get('veredito_derrubado', 0),
                'alegados': c.get('achados_brutos', 0), 'refutados': c.get('refutados', 0),
                'confirmados': c.get('confirmados', 0),
            })
            for x in lst:
                itens.append({**x, 'frente': nome})

    itens.sort(key=lambda x: (ORDEM_VALOR.get(x.get('valor'), 9), x.get('branch', '')))

    out = []
    out.append('## Frentes')
    out.append('')
    out.append('| frente | entradas | veredito mantido | derrubado | alegados | refutados | confirmados |')
    out.append('|---|---|---|---|---|---|---|')
    tot = collections.Counter()
    for f in frentes:
        out.append('| `{}` | {} | {} | {} | {} | {} | {} |'.format(
            f['arquivo'], f.get('entradas') or '-', f.get('veredito_ok', '-'),
            f.get('derrubado', '-'), f.get('alegados', 0), f.get('refutados', 0), f.get('confirmados', 0)))
        for k in ('entradas', 'veredito_ok', 'derrubado', 'alegados', 'refutados', 'confirmados'):
            v = f.get(k)
            if isinstance(v, int):
                tot[k] += v
    out.append('| **total** | **{}** | **{}** | **{}** | **{}** | **{}** | **{}** |'.format(
        tot['entradas'], tot['veredito_ok'], tot['derrubado'], tot['alegados'], tot['refutados'], tot['confirmados']))
    out.append('')
    out.append('## Itens confirmados (sobreviveram ao revisor adversarial)')
    out.append('')
    for bl in ('nenhum', 'ci_workflow', 'migration_producao', 'talkx_freeze', 'decisao_dono'):
        grupo = [x for x in itens if x.get('bloqueio') == bl]
        if not grupo:
            continue
        out.append('### {} — {} item(ns)'.format(ROTULO[bl], len(grupo)))
        out.append('')
        out.append('| valor | o que falta | arquivos | prova na main | branch |')
        out.append('|---|---|---|---|---|')
        for x in grupo:
            out.append('| {} | {} | `{}` | {} | `{}` |'.format(
                x.get('valor', '?'), x.get('titulo', '').replace('|', '/'),
                '`, `'.join(x.get('arquivos', [])[:3]),
                x.get('prova', '').replace('|', '/')[:180],
                x.get('branch', '')))
        out.append('')
    print('\n'.join(out))
    print('<!-- itens: {} · frentes: {} -->'.format(len(itens), len(frentes)), file=sys.stderr)


if __name__ == '__main__':
    main()
