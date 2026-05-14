'use client';

import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Calendar, Clock, BookOpen, Scroll, Archive, PenTool } from 'lucide-react';
import Button from '@/components/ui/Button';
import StatusPill from '@/components/ui/StatusPill';
import LandingPage from '@/components/LandingPage';

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface Session {
  id: string;
  title: string;
  sessionDate: string;
  duration: number | null;
  createdAt: string;
  updatedAt: string;
  campaignId: string;
  campaign_name: string;
  total_speech_time: number;
  _count: {
    transcriptions: number;
  };
  summary: {
    id: number;
  } | null;
  status: string;
}

export default function Dashboard() {
  const { status } = useSession();
  const isAuthenticated = status === 'authenticated';

  const { data: sessions, isLoading: sessionsLoading } = useQuery<Session[]>({
    queryKey: ['sessions'],
    queryFn: async () => {
      const response = await fetch('/api/sessions');
      if (!response.ok) throw new Error('Failed to fetch sessions');
      return response.json();
    },
    enabled: isAuthenticated,
  });

  const { data: campaigns, isLoading: campaignsLoading } = useQuery<Campaign[]>({
    queryKey: ['campaigns'],
    queryFn: async () => {
      const response = await fetch('/api/campaigns');
      if (!response.ok) throw new Error('Failed to fetch campaigns');
      return response.json();
    },
    enabled: isAuthenticated,
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return 'N/A';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    if (diffInHours < 168) return `${Math.floor(diffInHours / 24)}d ago`;
    return formatDate(dateString);
  };

  const recentSessions = sessions?.slice(0, 6) || [];

  if (!isAuthenticated) {
    return <LandingPage />;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Quick Actions */}
      <div className="bg-white rounded-ss-xl border border-slate-300 p-6 shadow-ss-card">
        <div className="flex flex-col sm:flex-row gap-4">
          <ActionCard
            href="/sessions/upload"
            icon={<PenTool size={26} className="text-ink-900" strokeWidth={2} />}
            iconBg="bg-ink-50"
            iconBorder="border-ink-200"
            title="Start New Session"
            subtitle="Record and transcribe your D&D adventure"
          />
          <ActionCard
            href="/campaigns"
            icon={<BookOpen size={26} className="text-gold-600" strokeWidth={2} />}
            iconBg="bg-parchment-50"
            iconBorder="border-parchment-200"
            title="Manage Campaigns"
            subtitle="Organize your ongoing adventures"
          />
          <ActionCard
            href="/sessions"
            icon={<Archive size={26} className="text-emerald-800" strokeWidth={2} />}
            iconBg="bg-emerald-50"
            iconBorder="border-emerald-200"
            title="View Sessions"
            subtitle="Browse your recorded adventures"
          />
        </div>
      </div>

      {/* Recent Sessions */}
      <div className="flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[22px] font-semibold text-slate-900 m-0 whitespace-nowrap">Recent Sessions</h2>
          <div className="flex-shrink-0">
            <Link href="/sessions">
              <Button variant="outline" size="sm" className="gap-2">
                <Archive size={14} /> View All
              </Button>
            </Link>
          </div>
        </div>

        {sessionsLoading ? (
          <div className="text-center py-8">
            <div className="inline-block w-5 h-5 border-2 border-ink-900 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-500 mt-2 text-sm">Loading...</p>
          </div>
        ) : recentSessions.length === 0 ? (
          <div className="bg-white border border-slate-300 rounded-ss-xl p-12 text-center shadow-ss-card">
            <Scroll className="h-[42px] w-[42px] text-slate-400 mx-auto mb-3" />
            <h3 className="font-display text-xl font-semibold text-slate-900 mb-1.5">No sessions yet</h3>
            <p className="font-body text-sm text-slate-500 mb-4">Start recording your first D&D session to see it here</p>
            <Link href="/sessions/upload">
              <Button className="gap-2">
                <PenTool size={14} /> Start Recording
              </Button>
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-ss-xl border border-slate-300 overflow-hidden shadow-ss-card">
            {recentSessions.map((session, i) => (
              <Link key={session.id} href={`/sessions/${session.id}`}>
                <div className={`px-[18px] py-3.5 hover:bg-slate-50 transition-colors duration-150 flex items-center justify-between gap-4 cursor-pointer ${i < recentSessions.length - 1 ? 'border-b border-slate-100' : ''}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5 mb-1">
                      <span className="font-body font-semibold text-[15px] text-slate-900 whitespace-nowrap">{session.title}</span>
                      <StatusPill status={session.status} />
                    </div>
                    <div className="flex gap-3.5 font-body text-[13px] text-slate-500 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1"><BookOpen size={12} />{session.campaign_name}</span>
                      <span className="inline-flex items-center gap-1"><Calendar size={12} />{formatDate(session.sessionDate)}</span>
                      <span className="inline-flex items-center gap-1"><Clock size={12} />{formatDuration(session.duration)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 flex-shrink-0">
                    {session.status === 'processing' && (
                      <span className="inline-flex items-center gap-1.5 font-body text-xs text-ink-900">
                        <span className="inline-block w-3 h-3 border-2 border-ink-900 border-t-transparent rounded-full animate-spin" />
                        Processing…
                      </span>
                    )}
                    <span className="font-body text-xs text-slate-500 whitespace-nowrap">
                      {session._count.transcriptions} parts
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Recent Campaigns */}
      <div className="flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[22px] font-semibold text-slate-900 m-0 whitespace-nowrap">Recent Campaigns</h2>
          <div className="flex-shrink-0">
            <Link href="/campaigns">
              <Button variant="outline" size="sm" className="gap-2">
                <BookOpen size={14} /> View All
              </Button>
            </Link>
          </div>
        </div>

        {campaignsLoading ? (
          <div className="text-center py-8">
            <div className="inline-block w-5 h-5 border-2 border-ink-900 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-500 mt-2 text-sm">Loading...</p>
          </div>
        ) : !campaigns || campaigns.length === 0 ? (
          <div className="bg-white border border-slate-300 rounded-ss-xl p-12 text-center shadow-ss-card">
            <BookOpen className="h-[42px] w-[42px] text-slate-400 mx-auto mb-3" />
            <h3 className="font-display text-xl font-semibold text-slate-900 mb-1.5">No campaigns yet</h3>
            <p className="font-body text-sm text-slate-500 mb-4">Create your first campaign to organize your D&D sessions</p>
            <Link href="/campaigns">
              <Button className="gap-2">
                <BookOpen size={14} /> Create Campaign
              </Button>
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-ss-xl border border-slate-300 overflow-hidden shadow-ss-card">
            {campaigns.slice(0, 5).map((campaign, i) => (
              <Link key={campaign.id} href={`/campaigns/${campaign.id}`}>
                <div className={`px-[18px] py-3.5 hover:bg-slate-50 transition-colors duration-150 flex items-center justify-between gap-4 cursor-pointer ${i < Math.min(campaigns.length, 5) - 1 ? 'border-b border-slate-100' : ''}`}>
                  <div className="min-w-0 flex-1">
                    <div className="font-body font-semibold text-[15px] text-slate-900 mb-1 whitespace-nowrap">{campaign.name}</div>
                    {campaign.description && (
                      <p className="font-body text-sm text-slate-600 mb-1 line-clamp-2">{campaign.description}</p>
                    )}
                    <div className="flex gap-3 font-body text-xs text-slate-400 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1"><Calendar size={12} />Created {formatDate(campaign.created_at)}</span>
                      <span className="inline-flex items-center gap-1"><Clock size={12} />Updated {formatTimeAgo(campaign.updated_at)}</span>
                    </div>
                  </div>
                  <div className="font-body text-xs text-slate-500 whitespace-nowrap flex-shrink-0">
                    {sessions?.filter(s => s.campaignId === campaign.id).length || 0} sessions
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionCard({ href, icon, iconBg, iconBorder, title, subtitle }: {
  href: string;
  icon: React.ReactNode;
  iconBg: string;
  iconBorder: string;
  title: string;
  subtitle: string;
}) {
  return (
    <Link href={href} className="flex-1 min-w-[240px]">
      <div className="bg-white rounded-ss-xl border border-slate-300 p-[18px] flex items-center gap-3.5 shadow-ss-card hover:shadow-ss-card-hover hover:border-slate-400 transition-all duration-150 cursor-pointer">
        <div className={`w-[52px] h-[52px] rounded-ss-lg flex-shrink-0 ${iconBg} border ${iconBorder} flex items-center justify-center`}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="font-display font-semibold text-[19px] text-slate-900 leading-tight">{title}</div>
          <div className="font-body text-[13px] text-slate-500 mt-1 leading-snug">{subtitle}</div>
        </div>
      </div>
    </Link>
  );
}
