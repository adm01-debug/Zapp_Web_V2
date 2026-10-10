import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, X, User } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ContactService } from '@/services/contact.service';
import { getInitials } from '@/lib/formatters';

export interface ContatoEscolhido {
  id: string;
  name: string;
  phone: string;
}

interface ContactPickerProps {
  /** Contato ja escolhido (chip). */
  selecionado: ContatoEscolhido | null;
  onEscolher: (contato: ContatoEscolhido) => void;
  onLimpar: () => void;
}

const ESPERA_BUSCA_MS = 300;
const LIMITE = 6;

function telefoneDoContato(linha: Record<string, unknown>): string {
  const bruto = (linha.phone ?? linha.mobile ?? linha.whatsapp ?? linha.telefone) as string | undefined;
  return typeof bruto === 'string' ? bruto : '';
}

/**
 * Busca de contato do painel de nova ligacao (T57).
 *
 * Duas portas de entrada, de proposito: o agente pode escolher um contato (que traz o
 * telefone junto) ou simplesmente digitar um numero. Por isso a lista e um ATALHO, nao
 * uma obrigacao - e por isso `navegarPorTeclado` existe em vez de um `<select>` (o agente
 * digita, ve os 6 primeiros e escolhe com as setas sem largar o teclado).
 */
export function ContactPicker({ selecionado, onEscolher, onLimpar }: ContactPickerProps) {
  const [termo, setTermo] = useState('');
  const [resultados, setResultados] = useState<ContatoEscolhido[]>([]);
  const [destaque, setDestaque] = useState(0);
  const [buscando, setBuscando] = useState(false);
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const texto = termo.trim();
    let vivo = true;
    // A limpeza vive DENTRO do callback do timer: setState sincrono no corpo do efeito
    // causaria render em cascata (e a guarda de react-hooks do repo reprova, com razao).
    const t = setTimeout(async () => {
      if (texto.length < 2) {
        setResultados([]);
        setAberto(false);
        return;
      }
      setBuscando(true);
      try {
        const { data } = await ContactService.searchContacts({ search_term: texto, page_size: LIMITE, page_offset: 0 });
        if (!vivo) return;
        const linhas = (data ?? []) as unknown as Record<string, unknown>[];
        setResultados(
          linhas
            .map((linha) => ({
              id: String(linha.id ?? ''),
              name: String(linha.name ?? linha.nome ?? ''),
              phone: telefoneDoContato(linha),
            }))
            .filter((c) => c.id && c.phone)
            .slice(0, LIMITE),
        );
        setDestaque(0);
        setAberto(true);
      } catch {
        if (vivo) setResultados([]);
      } finally {
        if (vivo) setBuscando(false);
      }
    }, ESPERA_BUSCA_MS);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [termo]);

  // Fecha ao clicar fora (o agente segue digitando o numero direto).
  useEffect(() => {
    const aoClicar = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', aoClicar);
    return () => document.removeEventListener('mousedown', aoClicar);
  }, []);

  const escolher = useCallback(
    (contato: ContatoEscolhido) => {
      onEscolher(contato);
      setTermo('');
      setResultados([]);
      setAberto(false);
    },
    [onEscolher],
  );

  const aoTeclar = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!aberto || resultados.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setDestaque((d) => Math.min(d + 1, resultados.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setDestaque((d) => Math.max(d - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      escolher(resultados[destaque]);
    } else if (e.key === 'Escape') {
      setAberto(false);
    }
  };

  if (selecionado) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2" data-testid="tel-contact-chip">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {getInitials(selecionado.name) || <User className="h-3.5 w-3.5" />}
          </span>
          <span className="truncate text-sm font-medium text-foreground">{selecionado.name}</span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={onLimpar} aria-label="Remover contato">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div ref={caixa} className="relative w-full" data-testid="tel-contact-picker">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onKeyDown={aoTeclar}
          onFocus={() => resultados.length > 0 && setAberto(true)}
          placeholder="Buscar contato ou digitar número"
          aria-label="Buscar contato"
          className="pl-9"
        />
      </div>
      {aberto && (
        <ul
          role="listbox"
          aria-label="Contatos encontrados"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-popover shadow-md"
          data-testid="tel-contact-results"
        >
          {resultados.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">{buscando ? 'Buscando...' : 'Nenhum contato'}</li>
          ) : (
            resultados.map((c, i) => (
              <li key={c.id} role="option" aria-selected={i === destaque}>
                <button
                  type="button"
                  onClick={() => escolher(c)}
                  onMouseEnter={() => setDestaque(i)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                    i === destaque ? 'bg-accent text-accent-foreground' : 'text-foreground'
                  }`}
                >
                  <span className="truncate">{c.name}</span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">{c.phone}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
