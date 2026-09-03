'use client';

import { useUserStore } from '@/stores/userStore';
import { adAccountStore } from '@/stores/adAccountStore';
import type { ConnectionSummary } from '@/stores/adAccountStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import Link from 'next/link';
import { Building2, KeyRound, ShieldCheck, Plus } from 'lucide-react';

export default function Page() {
  const { name, email } = useUserStore();
  const { connections, selectedIndex } = adAccountStore();

  const currentOrg: ConnectionSummary | null = connections[selectedIndex] ?? null;

  // Each OpenAI Ads API key is scoped to exactly one ad account, so the number
  // of connections and the number of ad accounts are the same figure.
  const accountCount = connections.length;
  const orgCount = connections.length;

  const twoFa = useQuery({
    queryKey: ['2fa-status'],
    queryFn: async () => (await api.get('/2fa/status')).data as { enabled: boolean; backupCodesRemaining: number },
    staleTime: 30_000,
  });

  return (
    <section className="w-full p-4 md:p-6">
      <div className="flex flex-col gap-6 w-full max-w-3xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">User Profile</h1>
            <p className="text-sm text-muted-foreground">
              View details related to your account and organization.
            </p>
          </div>
        </div>

        <Card className='py-2'>
          <CardHeader>
            <CardTitle className="text-lg">Account Details</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ProfileField label="Name" value={name} />
            <ProfileField label="Email" value={email} />
          </CardContent>
        </Card>

        <Separator/>

        {/* Ad accounts & security */}
        <Card className="py-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><KeyRound className="w-4 h-4" />Ad Accounts &amp; Security</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ProfileField
              label="Connected ad accounts"
              value={
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                  {accountCount} account{accountCount === 1 ? '' : 's'} · {orgCount} organization{orgCount === 1 ? '' : 's'}
                </span>
              }
            />
            <ProfileField
              label="Two-factor authentication"
              value={
                twoFa.data?.enabled
                  ? <Badge className="gap-1 border-0 bg-green-100 text-green-700"><ShieldCheck className="w-3 h-3" />On</Badge>
                  : <Badge className="gap-1 border-0 bg-zinc-100 text-zinc-500">Off</Badge>
              }
            />
            <div className="flex flex-wrap gap-2">
              <Link href="/onboarding/connect"><Button size="sm" className="gap-1.5"><Plus className="w-3.5 h-3.5" />Add / manage accounts</Button></Link>
              <Link href="/tools/settings"><Button size="sm" variant="outline" className="gap-1.5"><ShieldCheck className="w-3.5 h-3.5" />Security settings</Button></Link>
            </div>
          </CardContent>
        </Card>

        <Separator/>

        {currentOrg && (
          <Card className='py-2'>
            <CardHeader>
              <CardTitle className="text-lg">Ad Account Details</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ProfileField label="Ad account" value={currentOrg.adAccountName ?? currentOrg.adAccountId} />
              <ProfileField label="Account ID" value={currentOrg.adAccountId} />
              <ProfileField label="Currency" value={currentOrg.currencyCode} />
              <ProfileField label="Time zone" value={currentOrg.timezone} />
              {/* Brand review, not roles: OpenAI Ads exposes no per-user role on
                  the account, and an unapproved brand review is the single fact
                  most worth surfacing — it stops every ad in the account. */}
              <ProfileField
                label="Brand review"
                value={
                  currentOrg.reviewStatus ? (
                    <Badge
                      className="py-1 px-4"
                      variant={currentOrg.reviewStatus === 'approved' ? 'default' : 'destructive'}
                    >
                      {currentOrg.reviewStatus}
                      {currentOrg.reviewReason ? ` \u2014 ${currentOrg.reviewReason}` : ''}
                    </Badge>
                  ) : (
                    '\u2014'
                  )
                }
              />
              <ProfileField label="Time Zone" value={currentOrg.timezone} />
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  );
}

const ProfileField = ({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between">
    <p className="text-sm text-muted-foreground">{label}</p>
    <div className="text-base font-medium text-right max-w-sm break-words">
      {value || 'N/A'}
    </div>
  </div>
);
