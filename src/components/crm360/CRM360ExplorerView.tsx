/**
 * CRM360ExplorerView — Full CRM 360° data explorer
 */
import { useState, useCallback } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Building2, Pencil } from 'lucide-react';
import { isExternalConfigured } from '@/integrations/supabase/externalClient';
import { CRM360StatsCards } from './CRM360StatsCards';
import { CompanyFormDialog } from './CompanyFormDialog';
import { ContactFormDialog } from './ContactFormDialog';
import { DataExplorerTable } from './DataExplorerTable';
import { TABS } from './crm360TabsConfig';

export function CRM360ExplorerView() {
  const [activeTab, setActiveTab] = useState<string>(TABS[0].id);
  const [companyDialogOpen, setCompanyDialogOpen] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Record<string, unknown> | null>(null);
  const [editingContact, setEditingContact] = useState<Record<string, unknown> | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRowClick = useCallback((tabId: string, row: Record<string, unknown>) => {
    if (tabId === 'companies') { setEditingCompany(row); setCompanyDialogOpen(true); }
    else if (tabId === 'contacts') { setEditingContact(row); setContactDialogOpen(true); }
  }, []);

  const handleCreateClick = useCallback((tabId: string) => {
    if (tabId === 'companies') { setEditingCompany(null); setCompanyDialogOpen(true); }
    else if (tabId === 'contacts') { setEditingContact(null); setContactDialogOpen(true); }
  }, []);

  const handleSuccess = useCallback(() => setRefreshKey(k => k + 1), []);

  if (!isExternalConfigured) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold text-lg mb-2">CRM Externo Não Configurado</h3>
            <p className="text-muted-foreground text-sm">Configure as variáveis de ambiente para acessar os dados do CRM 360°.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Building2 className="h-6 w-6 text-primary" />CRM 360° Explorer</h1>
          <p className="text-sm text-muted-foreground mt-1">Acesso completo a todas as tabelas do banco de dados CRM externo</p>
        </div>
        <Badge variant="outline" className="text-xs">{TABS.length} tabelas</Badge>
      </div>

      <CRM360StatsCards />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <ScrollArea className="w-full overflow-x-auto">
          <TabsList className="inline-flex w-auto h-auto p-1 gap-0.5 flex-nowrap">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger key={tab.id} value={tab.id} className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 whitespace-nowrap">
                  <Icon className="h-3 w-3" />{tab.label}
                  {tab.editable && <Pencil className="h-2.5 w-2.5 text-primary/60" />}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </ScrollArea>

        <div className="flex-1 min-h-0 mt-3">
          {TABS.map((tab) => {
            if (tab.id !== activeTab) return null;
            return (
              <TabsContent key={tab.id} value={tab.id} className="h-full mt-0">
                <Card className="h-full">
                  <CardHeader className="py-2.5 px-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-sm flex items-center gap-2">
                          {(() => { const Icon = tab.icon; return <Icon className="h-4 w-4 text-primary" />; })()}
                          {tab.label}
                          {tab.editable && <Badge variant="secondary" className="text-[9px] px-1.5 py-0"><Pencil className="h-2.5 w-2.5 mr-0.5" /> Editável</Badge>}
                        </CardTitle>
                        <CardDescription className="text-[11px] mt-0.5">{tab.description}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <DataExplorerTable
                      key={refreshKey}
                      tabConfig={tab}
                      onRowClick={tab.editable ? (row) => handleRowClick(tab.id, row) : undefined}
                      onCreateClick={tab.editable ? () => handleCreateClick(tab.id) : undefined}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            );
          })}
        </div>
      </Tabs>

      <CompanyFormDialog open={companyDialogOpen} onOpenChange={setCompanyDialogOpen} company={editingCompany} onSuccess={handleSuccess} />
      <ContactFormDialog open={contactDialogOpen} onOpenChange={setContactDialogOpen} contact={editingContact} onSuccess={handleSuccess} />
    </div>
  );
}
