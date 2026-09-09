import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, Search, X, Building2, Tag } from 'lucide-react';
import { TalkXCampaign } from '@/hooks/integrations/useTalkX';

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
  campaign: TalkXCampaign | null;
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
  campaign, contacts, filteredContacts, selectedContacts,
  contactSearch, setContactSearch, companyFilter, setCompanyFilter,
  tagFilter, setTagFilter, companies, tags,
  toggleContact, selectAll, clearFilters,
}) => {
  return (
    <Card className="h-fit max-h-[calc(100vh-200px)] flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            Contatos
            <Badge variant="secondary" className="text-[10px]">
              {selectedContacts.length}/{contacts.length}
            </Badge>
          </CardTitle>
          <Button size="sm" variant="ghost" onClick={selectAll} className="text-xs shrink-0">
            {filteredContacts.length > 0 && filteredContacts.every((c) => selectedContacts.includes(c.id)) ? 'Desmarcar' : 'Todos'}
          </Button>
        </div>
        {!campaign && (
          <div className="space-y-2 mt-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={contactSearch} onChange={(e) => setContactSearch(e.target.value)} placeholder="Buscar por nome, telefone, empresa..." className="pl-9 h-9 text-sm" />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {companies.length > 0 && (
                <Select value={companyFilter} onValueChange={setCompanyFilter}>
                  <SelectTrigger className="h-7 text-[11px] w-auto min-w-[100px] max-w-[160px]">
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
                  <SelectTrigger className="h-7 text-[11px] w-auto min-w-[80px] max-w-[140px]">
                    <Tag className="w-3 h-3 mr-1 shrink-0" /><SelectValue placeholder="Tag" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas tags</SelectItem>
                    {tags.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {(companyFilter !== 'all' || tagFilter !== 'all') && (
                <Button size="sm" variant="ghost" className="h-7 text-[11px] text-muted-foreground" onClick={clearFilters}>
                  <X className="w-3 h-3 mr-1" />Limpar
                </Button>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">{filteredContacts.length} contatos filtrados • {selectedContacts.length} selecionados</p>
          </div>
        )}
      </CardHeader>
      <CardContent className="flex-1 overflow-auto min-h-0">
        {campaign ? (
          <p className="text-sm text-muted-foreground text-center py-4">Ver destinatários no monitor.</p>
        ) : (
          <div className="space-y-0.5">
            {filteredContacts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">{contactSearch ? 'Nenhum contato encontrado' : 'Nenhum contato disponível'}</p>
            ) : (
              filteredContacts.map((contact) => {
                const isSelected = selectedContacts.includes(contact.id);
                return (
                  <label key={contact.id} className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all ${isSelected ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted/50 border border-transparent'}`}>
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
                    </div>
                  </label>
                );
              })
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
