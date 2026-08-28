import { useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, Key, Lock, Activity, Users, Bell, Smartphone, LayoutDashboard, Fingerprint, Globe, FileText, Gauge, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SecuritySettingsPanel } from './SecuritySettingsPanel';
import { SecurityOverview } from './SecurityOverview';
import { DevicesPanel } from './DevicesPanel';
import { PasskeysPanel } from './PasskeysPanel';
import { SecurityNotificationsPanel } from './SecurityNotificationsPanel';
import { BlockedIPsPanel } from './BlockedIPsPanel';
import { IPWhitelistPanel } from './IPWhitelistPanel';
import { GeoBlockingPanel } from './GeoBlockingPanel';
import { PasswordResetRequestsPanel } from './PasswordResetRequestsPanel';
import { RateLimitRealtimeAlerts } from './RateLimitRealtimeAlerts';
import { RateLimitConfigPanel } from './RateLimitConfigPanel';
import { AuditLogDashboard } from './AuditLogDashboard';
import { QuarantinePanel } from './QuarantinePanel';
import { useUserRole } from '@/hooks/system/useUserRole';
import { useSecurityPushNotifications } from '@/hooks/system/useSecurityPushNotifications';

export function SecurityView() {
  const { hasRole } = useUserRole();
  const isAdmin = hasRole('admin');
  const [activeTab, setActiveTab] = useState('overview');
  
  // Initialize security push notifications
  useSecurityPushNotifications();

  return (
    <div className="h-full overflow-auto p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-6xl mx-auto space-y-6"
      >
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-primary/10">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold">Central de Segurança</h1>
            <p className="text-muted-foreground">
              Gerencie todas as configurações de segurança da sua conta e sistema
            </p>
          </div>
        </div>

        {/* Realtime Alerts for Admin */}
        {isAdmin && <RateLimitRealtimeAlerts />}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 md:grid-cols-11">
            <TabsTrigger value="overview" className="gap-2">
              <LayoutDashboard className="w-4 h-4" />
              <span className="hidden sm:inline">Visão Geral</span>
            </TabsTrigger>
            <TabsTrigger value="account" className="gap-2">
              <Key className="w-4 h-4" />
              <span className="hidden sm:inline">Conta</span>
            </TabsTrigger>
            <TabsTrigger value="passkeys" className="gap-2">
              <Fingerprint className="w-4 h-4" />
              <span className="hidden sm:inline">Passkeys</span>
            </TabsTrigger>
            <TabsTrigger value="devices" className="gap-2">
              <Smartphone className="w-4 h-4" />
              <span className="hidden sm:inline">Dispositivos</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2">
              <Bell className="w-4 h-4" />
              <span className="hidden sm:inline">Alertas</span>
            </TabsTrigger>
            {isAdmin && (
              <>
                <TabsTrigger value="blocked" className="gap-2">
                  <Lock className="w-4 h-4" />
                  <span className="hidden sm:inline">IPs</span>
                </TabsTrigger>
                <TabsTrigger value="geo" className="gap-2">
                  <Globe className="w-4 h-4" />
                  <span className="hidden sm:inline">Geo</span>
                </TabsTrigger>
                <TabsTrigger value="rate-limit" className="gap-2">
                  <Gauge className="w-4 h-4" />
                  <span className="hidden sm:inline">Rate Limit</span>
                </TabsTrigger>
                <TabsTrigger value="audit" className="gap-2">
                  <FileText className="w-4 h-4" />
                  <span className="hidden sm:inline">Auditoria</span>
                </TabsTrigger>
                <TabsTrigger value="quarantine" className="gap-2">
                  <ShieldAlert className="w-4 h-4" />
                  <span className="hidden sm:inline">Quarentena</span>
                </TabsTrigger>
                <TabsTrigger value="admin" className="gap-2">
                  <Users className="w-4 h-4" />
                  <span className="hidden sm:inline">Admin</span>
                </TabsTrigger>
              </>
            )}
          </TabsList>

          <TabsContent value="overview">
            <SecurityOverview />
          </TabsContent>

          <TabsContent value="account">
            <SecuritySettingsPanel onSwitchTab={setActiveTab} />
          </TabsContent>

          <TabsContent value="passkeys">
            <PasskeysPanel />
          </TabsContent>

          <TabsContent value="devices">
            <DevicesPanel />
          </TabsContent>

          <TabsContent value="notifications">
            <SecurityNotificationsPanel />
          </TabsContent>

          {isAdmin && (
            <>
              <TabsContent value="blocked">
                <div className="space-y-6">
                  <BlockedIPsPanel />
                  <IPWhitelistPanel />
                </div>
              </TabsContent>

              <TabsContent value="geo">
                <GeoBlockingPanel />
              </TabsContent>

              <TabsContent value="rate-limit">
                <RateLimitConfigPanel />
              </TabsContent>

              <TabsContent value="audit">
                <AuditLogDashboard />
              </TabsContent>

              <TabsContent value="quarantine">
                <QuarantinePanel />
              </TabsContent>

              <TabsContent value="admin">
                <div className="space-y-6">
                  <PasswordResetRequestsPanel />
                  
                  <div className="grid gap-6 md:grid-cols-2">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Activity className="w-5 h-5 text-primary" />
                          Rate Limit Dashboard
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">
                          Monitore tentativas de acesso e gerencie rate limiting
                        </p>
                        <Button 
                          variant="outline" 
                          className="mt-4"
                          onClick={() => window.location.href = '/admin/rate-limit'}
                        >
                          Ver Dashboard
                        </Button>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Users className="w-5 h-5 text-primary" />
                          Gerenciamento de Roles
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">
                          Configure roles e permissões para usuários
                        </p>
                        <Button 
                          variant="outline" 
                          className="mt-4"
                          onClick={() => window.location.href = '/admin/roles'}
                        >
                          Gerenciar Roles
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>
            </>
          )}
        </Tabs>
      </motion.div>
    </div>
  );
}
