import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Store } from 'lucide-react';
import { toast } from 'sonner';
import { useEvolutionApi } from '@/hooks/integrations/useEvolutionApi';
import { useConnectionOptions } from '@/hooks/connections/useConnectionOptions';
import { useUserRole } from '@/hooks/system/useUserRole';
import { ConnectionSelect } from '@/components/evolution/ConnectionSelect';
import { conexaoEfetiva, instanciaDa, listaDe, mensagemDeErro, texto } from '@/components/evolution/evolutionUi';

/**
 * Catálogo e coleções do WhatsApp Business do CONTATO (`get-catalog` e
 * `get-collections`, Evolution v2), restauradas após o #2054 por decisão do dono.
 * Útil para fornecedores/lojas: ver o que o contato vende sem sair da conversa.
 * As rotas são de admin/supervisor na Edge — a seção só aparece para esses papéis.
 * Contato sem WhatsApp Business volta lista vazia; na Evolution GO, `notSupported`.
 */
export function WhatsAppCatalogSection({ phone }: { phone: string }) {
  const { isSupervisor } = useUserRole();
  if (!isSupervisor || !phone) return null;
  return <CatalogoDoContato phone={phone} />;
}

function CatalogoDoContato({ phone }: { phone: string }) {
  const { getBusinessCatalog, getBusinessCollections } = useEvolutionApi();
  const [aberto, setAberto] = useState(false);
  const { data: conexoes = [] } = useConnectionOptions(aberto);
  const [escolhida, setEscolhida] = useState('');
  const [produtos, setProdutos] = useState<Record<string, unknown>[] | null>(null);
  const [colecoes, setColecoes] = useState<Record<string, unknown>[]>([]);
  const [carregando, setCarregando] = useState(false);

  const conexao = conexaoEfetiva(escolhida, conexoes);
  const numero = phone.replace(/\D/g, '');

  const carregar = async () => {
    const instancia = instanciaDa(conexao, conexoes);
    if (!instancia) { toast.error('Escolha a conexão.'); return; }
    setCarregando(true);
    try {
      const [catalogo, grupos] = await Promise.all([
        getBusinessCatalog(instancia, numero, 20),
        getBusinessCollections(instancia, numero, 20),
      ]);
      setProdutos(listaDe(catalogo, 'products', 'catalog'));
      setColecoes(listaDe(grupos, 'collections'));
    } catch (err) {
      setProdutos(null);
      toast.error(mensagemDeErro(err, 'Não foi possível ler o catálogo do contato'));
    } finally {
      setCarregando(false);
    }
  };

  if (!aberto) {
    return (
      <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => setAberto(true)} data-testid="catalogo-whatsapp-abrir">
        <Store className="w-4 h-4 mr-2" />Ver catálogo WhatsApp do contato
      </Button>
    );
  }

  return (
    <section className="mt-2 space-y-2 rounded-md border p-3" aria-labelledby="catalogo-whatsapp-titulo">
      <h3 id="catalogo-whatsapp-titulo" className="text-sm font-medium flex items-center gap-2"><Store className="w-4 h-4" />Catálogo WhatsApp</h3>
      <ConnectionSelect id="catalogo-conexao" connections={conexoes} value={conexao} onChange={(v) => { setEscolhida(v); setProdutos(null); }} />
      <Button size="sm" className="w-full" onClick={() => { void carregar(); }} disabled={carregando}>
        {carregando && <Loader2 className="w-4 h-4 mr-2 motion-safe:animate-spin" />}Carregar catálogo
      </Button>
      {produtos !== null && (
        produtos.length === 0
          ? <p className="text-xs text-muted-foreground">Este contato não tem catálogo publicado no WhatsApp Business.</p>
          : (
            <>
              {colecoes.length > 0 && (
                <p className="text-xs text-muted-foreground">Coleções: {colecoes.map((c) => texto(c.name)).filter(Boolean).join(', ')}</p>
              )}
              <ul className="divide-y rounded-md border" aria-label="Produtos do catálogo">
                {produtos.map((p, i) => (
                  <li key={`${texto(p.id)}-${i}`} className="px-2 py-1.5 text-sm">
                    <span className="block font-medium truncate">{texto(p.name) || 'Produto sem nome'}</span>
                    {(texto(p.price) || texto(p.currency)) && <span className="block text-xs text-muted-foreground">{texto(p.currency)} {texto(p.price)}</span>}
                  </li>
                ))}
              </ul>
            </>
          )
      )}
    </section>
  );
}
