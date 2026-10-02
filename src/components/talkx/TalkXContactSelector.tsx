import React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, Search, X, Building2, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCRMIntegrationEnabled } from '@/hooks/system/useCRMIntegrationEnabled';
import { useExternalContact360Batch, type CRMBatchResult } from '@/hooks/crm/useExternalContact360Batch';

const RFM_SEGMENT_COLORS: Record<string, string> = {
  Champions: 'bg-success/15 text-success border-success/30',
  'Loyal Customers': 'bg-info/15 text-info border-info/30',
  'At Risk': 'bg-destructive/15 text-destructive border-destructive/30',
  Hibernating: 'bg-muted text-muted-foreground border-border',
  Lost: 'bg-muted/50 text-muted-foreground border-border/50',
  "Can't Lose Them": 'bg-destructive/15 text-destructive border-destructive/30',
  'Need Attention': 'bg-warning/15 text-warning border-warning/30',
  Promising: 'bg-secondary/15 text-secondary border-secondary/30',
};

// Altura estimada da linha de contato (p-2.5 + nome + telefone ≈ 56px). O
// badge de CRM (opcional, por contato) deixa a linha mais alta; como a altura
// real é medida no DOM via `virtualizer.measureElement`, este valor é só o
// chute inicial que dimensiona a barra de rolagem antes da 1ª medição.
const CONTACT_ROW_ESTIMATE = 56;
const CONTACT_OVERSCAN = 6;

function TalkXCRMBadge({ crmInfo }: { crmInfo: CRMBatchResult | undefined }) {
  if (!crmInfo?.company_name) return null;
  return (
    <div className="flex items-center gap-1 mt-0.5">
      <Building2 className="w-3 h-3 text-primary/60 shrink-0" />
      <span className="text-3xs text-muted-foreground truncate max-w-[110px]">{crmInfo.company_name}</span>
      {crmInfo.rfm_score != null && (
        <Badge variant="outline" className={cn('text-[9px] py-0 px-1 shrink-0', RFM_SEGMENT_COLORS[crmInfo.rfm_segment ?? ''] || 'bg-muted/20')}>
          {crmInfo.rfm_score}
        </Badge>
      )}
    </div>
  );
}

interface ContactItem {
  id: string;
  name: string;
  nickname: string | null;
  phone: string;
  company: string | null;
  avatar_url: string | null;
  tags: string[] | null;
}

interface Props {
  contacts: ContactItem[];
  filteredContacts: ContactItem[];
  selectedContacts: string[];
  contactSearch: string;
  setContactSearch: (v: string) => void;
  companyFilter: string;
  setCompanyFilter: (v: string) => void;
  tagFilter: string;
  setTagFilter: (v: string) => void;
  companies: string[];
  tags: string[];
  toggleContact: (id: string) => void;
  selectAll: () => void;
  clearFilters: () => void;
}

export const TalkXContactSelector: React.FC<Props> = ({
  contacts, filteredContacts, selectedContacts,
  contactSearch, setContactSearch, companyFilter, setCompanyFilter,
  tagFilter, setTagFilter, companies, tags,
  toggleContact, selectAll, clearFilters,
}) => {
  const crmIntegrationEnabled = useCRMIntegrationEnabled();
  const crmContacts = React.useMemo(
    () => filteredContacts.map((c) => ({ id: c.id, phone: c.phone })),
    [filteredContacts]
  );
  const { lookup: crmLookup } = useExternalContact360Batch(crmContacts);

  // V24 — a lista pode vir com milhares de contatos (o número vem do pai via
  // `filteredContacts`); renderizar todos de uma vez trava o passo 1 do
  // wizard. Virtualização com @tanstack/react-virtual (mesmo padrão de
  // ExternalProductCatalog / VirtualizedRealtimeList): só a janela visível +
  // overscan entra no DOM, sobre um espaçador com a altura total para a barra
  // de rolagem continuar correta.
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const getScrollElement = React.useCallback(() => scrollRef.current, []);
  const estimateSize = React.useCallback(() => CONTACT_ROW_ESTIMATE, []);
  // Ref em vez de dependência: mantém `getItemKey` estável mesmo quando o
  // filtro troca a lista (mesmo padrão do ChatMessagesArea).
  const filteredRef = React.useRef(filteredContacts);
  filteredRef.current = filteredContacts;
  const getItemKey = React.useCallback(
    (index: number) => filteredRef.current[index]?.id ?? index,
    []
  );
  // TanStack Virtual devolve funcoes nao memoizaveis pelo React Compiler —
  // mesma limitacao ja aceita nos outros usos deste hook no repo
  // (ExternalProductCatalog, VirtualizedRealtimeList).
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: filteredContacts.length,
    getScrollElement,
    estimateSize,
    overscan: CONTACT_OVERSCAN,
    getItemKey,
  });

  return (
    <Card className="h-fit max-h-[calc(100vh-200px)] flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            Contatos
            <Badge variant="secondary" className="text-3xs">
              {selectedContacts.length}/{contacts.length}
            </Badge>
          </CardTitle>
          <Button size="sm" variant="ghost" onClick={selectAll} className="text-xs shrink-0">
            {filteredContacts.length > 0 && filteredContacts.every((c) => selectedContacts.includes(c.id)) ? 'Desmarcar' : 'Todos'}
          </Button>
        </div>
        <div className="space-y-2 mt-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={contactSearch} onChange={(e) => setContactSearch(e.target.value)} placeholder="Buscar por nome, telefone, empresa..." className="pl-9 h-9 text-sm" />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {companies.length > 0 && (
                <Select value={companyFilter} onValueChange={setCompanyFilter}>
                  <SelectTrigger className="h-7 text-2xs w-auto min-w-[100px] max-w-[160px]">
                    <Building2 className="w-3 h-3 mr-1 shrink-0" /><SelectValue placeholder="Empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas empresas</SelectItem>
                    {companies.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {tags.length > 0 && (
                <Select value={tagFilter} onValueChange={setTagFilter}>
                  <SelectTrigger className="h-7 text-2xs w-auto min-w-[80px] max-w-[140px]">
                    <Tag className="w-3 h-3 mr-1 shrink-0" /><SelectValue placeholder="Tag" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas tags</SelectItem>
                    {tags.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {(companyFilter !== 'all' || tagFilter !== 'all') && (
                <Button size="sm" variant="ghost" className="h-7 text-2xs text-muted-foreground" onClick={clearFilters}>
                  <X className="w-3 h-3 mr-1" />Limpar
                </Button>
              )}
            </div>
            <p className="text-3xs text-muted-foreground">{filteredContacts.length} contatos filtrados • {selectedContacts.length} selecionados</p>
        </div>
      </CardHeader>
      <CardContent ref={scrollRef} className="flex-1 overflow-auto min-h-0">
        {filteredContacts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">{contactSearch ? 'Nenhum contato encontrado' : 'Nenhum contato disponível'}</p>
        ) : (
          <div style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const contact = filteredContacts[virtualRow.index];
              if (!contact) return null;
              const isSelected = selectedContacts.includes(contact.id);
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  className="pb-0.5"
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)` }}
                >
                  <label className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all ${isSelected ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted/50 border border-transparent'}`}>
                    <Checkbox checked={isSelected} onCheckedChange={() => toggleContact(contact.id)} />
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground shrink-0">
                      {contact.avatar_url ? <img src={contact.avatar_url} alt="" className="w-full h-full rounded-full object-cover" /> : (contact.name || '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {contact.name}
                        {contact.nickname && <span className="text-muted-foreground ml-1 font-normal">({contact.nickname})</span>}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{contact.phone}{contact.company && ` · ${contact.company}`}</p>
                      {crmIntegrationEnabled && <TalkXCRMBadge crmInfo={crmLookup(contact.phone)} />}
                    </div>
                  </label>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
