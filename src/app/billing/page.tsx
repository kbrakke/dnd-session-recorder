'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, CreditCard, XCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import { formatDate } from '@/lib/formatting';

interface SubscriptionResponse {
  active: boolean;
  subscription: {
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
}

function BillingContent() {
  const { status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const checkoutResult = searchParams.get('checkout'); // 'success' | 'cancelled' | null

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  const { data, isLoading } = useQuery<SubscriptionResponse>({
    queryKey: ['billing', 'subscription'],
    queryFn: async () => {
      const res = await fetch('/api/billing/subscription');
      if (!res.ok) throw new Error('Failed to load subscription');
      return res.json();
    },
    enabled: status === 'authenticated',
    // The webhook may land a moment after the success redirect — poll briefly
    // until the subscription shows up
    refetchInterval: (query) =>
      checkoutResult === 'success' && !query.state.data?.active ? 2000 : false,
  });

  // Once the webhook lands, drop the stale polling trigger from the URL
  useEffect(() => {
    if (checkoutResult === 'success' && data?.active) {
      queryClient.invalidateQueries({ queryKey: ['billing'] });
    }
  }, [checkoutResult, data?.active, queryClient]);

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/billing/checkout', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to start checkout');
      return body as { url: string };
    },
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
    onError: (err: Error) => setCheckoutError(err.message),
  });

  if (status === 'loading' || status === 'unauthenticated') {
    return null;
  }

  const subscription = data?.subscription;

  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      <h1 className="text-3xl font-bold font-display text-ink-900 mb-2">Billing</h1>
      <p className="text-slate-600 mb-8">
        Manage your StoryScribe subscription.
      </p>

      {checkoutResult === 'success' && (
        <div className="mb-6 flex items-center gap-2 rounded-ss-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <span>Payment complete — thanks for subscribing!</span>
        </div>
      )}
      {checkoutResult === 'cancelled' && (
        <div className="mb-6 flex items-center gap-2 rounded-ss-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <XCircle className="h-4 w-4 shrink-0" />
          <span>Checkout was cancelled. You haven&apos;t been charged.</span>
        </div>
      )}
      {checkoutError && (
        <div className="mb-6 flex items-center gap-2 rounded-ss-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <XCircle className="h-4 w-4 shrink-0" />
          <span>{checkoutError}</span>
        </div>
      )}

      <div className="rounded-ss-lg border border-slate-300 bg-white p-6 shadow-ss-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-ss-lg bg-ink-50 border border-ink-300 flex items-center justify-center">
            <CreditCard className="h-5 w-5 text-ink-900" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Basic subscription</h2>
            <p className="text-sm text-slate-500">$10 / month</p>
          </div>
        </div>

        {isLoading ? (
          <div className="h-10 bg-slate-100 rounded animate-pulse" />
        ) : data?.active && subscription ? (
          <div className="text-sm text-slate-700 space-y-1">
            <p>
              Status: <span className="font-medium text-green-700">{subscription.status}</span>
            </p>
            {subscription.currentPeriodEnd && (
              <p>
                {subscription.cancelAtPeriodEnd ? 'Ends' : 'Renews'} on{' '}
                {formatDate(subscription.currentPeriodEnd, 'long')}
              </p>
            )}
          </div>
        ) : (
          <div>
            {subscription && (
              <p className="text-sm text-slate-500 mb-3">
                Your previous subscription is <span className="font-medium">{subscription.status}</span>.
              </p>
            )}
            <Button
              onClick={() => {
                setCheckoutError(null);
                checkoutMutation.mutate();
              }}
              disabled={checkoutMutation.isPending}
            >
              {checkoutMutation.isPending ? 'Redirecting…' : 'Subscribe'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={null}>
      <BillingContent />
    </Suspense>
  );
}
