import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { LayoutGrid } from 'lucide-react';
import { motion } from 'framer-motion';
import { SCOPE_TABS } from './sla/sla-utils';
import { ScopeRulesList } from './sla/ScopeRulesList';
import { useSLARulesCounts } from '@/hooks/sla/useSLARulesCounts';

export function SLARulesManager() {
  // A contagem por escopo virou o hook compartilhado `useSLARulesCounts`
  // (mesma chave `['sla-rules-counts']` que os mutadores de regra invalidam).
  const { data: ruleCounts } = useSLARulesCounts();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="bg-card/50 border-border/50 rounded-2xl overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-extrabold flex items-center gap-2">
            <LayoutGrid className="w-5 h-5 text-primary" />
            Regras Granulares de SLA
          </CardTitle>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Configure prazos específicos por cliente, empresa, cargo, tipo, fila ou agente.
            Regras mais específicas sobrescrevem as genéricas automaticamente.
          </p>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="contact" className="w-full">
            <TabsList className="w-full flex flex-wrap h-auto gap-1 bg-muted/50 p-1 rounded-xl">
              {SCOPE_TABS.map(tab => {
                const count = ruleCounts?.[tab.value] || 0;
                return (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="flex items-center gap-1.5 text-xs rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm"
                  >
                    <tab.icon className="w-3.5 h-3.5" />
                    {tab.label}
                    {count > 0 && (
                      <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[9px] font-bold rounded-full">
                        {count}
                      </Badge>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>
            {SCOPE_TABS.map(tab => (
              <TabsContent key={tab.value} value={tab.value}>
                <ScopeRulesList scope={tab.value} />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </motion.div>
  );
}
