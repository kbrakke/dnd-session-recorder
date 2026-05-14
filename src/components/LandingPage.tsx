'use client';

import Link from 'next/link';
import { Clock, Mic, Plus, BookOpen, Sparkles, Scroll } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="flex flex-col gap-14">
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-ink-900 to-ink-950 text-white rounded-ss-3xl p-14 border border-ink-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_1px_0_0_rgba(15,23,42,0.05),0_2px_4px_0_rgba(15,23,42,0.08)]">
        {/* Decorative scroll glyph */}
        <div className="absolute -top-5 -right-8 opacity-[0.06]">
          <Scroll className="w-80 h-80 text-parchment-100" strokeWidth={1.2} />
        </div>

        <div className="relative max-w-[720px] mx-auto text-center">
          <div className="font-body text-xs font-semibold text-ink-200 tracking-[0.12em] uppercase mb-3">
            AI-powered session recording
          </div>
          <h1 className="font-display text-[56px] font-bold leading-[1.05] tracking-tight m-0">
            Every roll, retold.<br />Every saga, scribed.
          </h1>
          <p className="font-body text-lg leading-relaxed text-ink-100 mt-5 mb-8 max-w-[580px] mx-auto">
            Upload session audio. Get transcripts, summaries, TODOs, and character biographies — without ever lifting your DM pen.
          </p>
          <div className="flex justify-center gap-3 flex-wrap">
            <Link href="/auth/signup">
              <button className="font-body font-semibold text-base px-[22px] py-2.5 rounded-ss-lg cursor-pointer bg-white text-ink-900 border border-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_1px_0_0_rgba(15,23,42,0.10)] inline-flex items-center gap-2 hover:bg-slate-50 transition-colors duration-150">
                <Plus size={18} /> Start recording free
              </button>
            </Link>
            <Link href="/auth/signin">
              <button className="font-body font-semibold text-base px-[22px] py-2.5 rounded-ss-lg cursor-pointer bg-transparent text-white border border-white/35 inline-flex items-center gap-2 hover:bg-white/10 transition-colors duration-150">
                Sign in
              </button>
            </Link>
          </div>
        </div>
      </div>

      {/* Features */}
      <div>
        <div className="text-center mb-8">
          <h2 className="font-display text-4xl font-semibold text-slate-900 m-0">What StoryScribe does</h2>
          <p className="font-body text-base text-slate-500 mt-2">Low effort. High information.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <FeatureCard
            icon={<Mic size={28} className="text-ink-900" />}
            accent="bg-ink-50"
            title="AI Transcription"
            body="Whisper-powered, speaker-aware transcripts. 99.1% accuracy on table audio."
          />
          <FeatureCard
            icon={<Sparkles size={28} className="text-gold-600" />}
            accent="bg-parchment-50"
            title="Smart Summaries"
            body="Plot beats, NPC introductions, and combat highlights — without you replaying four hours of recording."
          />
          <FeatureCard
            icon={<BookOpen size={28} className="text-emerald-800" />}
            accent="bg-emerald-50"
            title="Campaign Memory"
            body="Character bios, factions, dangling threads, and DM TODOs stitched across every session."
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<Mic size={22} className="text-ink-900" />} bg="bg-ink-50" label="Total Sessions" value="35" sub="Sample data" />
        <StatCard icon={<BookOpen size={22} className="text-emerald-800" />} bg="bg-emerald-50" label="Active Campaigns" value="3" sub="Demo" />
        <StatCard icon={<Clock size={22} className="text-amber-800" />} bg="bg-amber-50" label="Hours Recorded" value="124h" sub="Sample" />
        <StatCard icon={<Sparkles size={22} className="text-gold-600" />} bg="bg-parchment-50" label="AI Summaries" value="31" sub="Generated" />
      </div>

      {/* Final CTA */}
      <div className="bg-gradient-to-r from-ink-950 to-ink-800 text-white rounded-ss-3xl p-10 text-center border border-ink-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_1px_0_0_rgba(15,23,42,0.05),0_2px_4px_0_rgba(15,23,42,0.08)]">
        <h3 className="font-display text-[32px] font-semibold m-0">Begin your chronicle</h3>
        <p className="font-body text-base text-ink-100 max-w-[540px] mx-auto mt-3 mb-6">
          Join thousands of DMs who never miss a moment.
        </p>
        <Link href="/auth/signup">
          <button className="font-body font-semibold text-base px-[22px] py-2.5 rounded-ss-lg cursor-pointer bg-white text-ink-900 border border-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_1px_0_0_rgba(15,23,42,0.10)] inline-flex items-center gap-2 hover:bg-slate-50 transition-colors duration-150">
            <Plus size={18} /> Create free account
          </button>
        </Link>
      </div>
    </div>
  );
}

function FeatureCard({ icon, accent, title, body }: { icon: React.ReactNode; accent: string; title: string; body: string }) {
  return (
    <div className="bg-white rounded-ss-xl border border-slate-300 p-7 shadow-ss-card hover:shadow-ss-card-hover transition-shadow duration-150">
      <div className={`w-14 h-14 rounded-ss-xl ${accent} flex items-center justify-center mb-[18px]`}>
        {icon}
      </div>
      <h3 className="font-display text-[22px] font-semibold text-slate-900 m-0 mb-2">{title}</h3>
      <p className="font-body text-sm leading-relaxed text-slate-600 m-0">{body}</p>
    </div>
  );
}

function StatCard({ icon, bg, label, value, sub }: { icon: React.ReactNode; bg: string; label: string; value: string; sub: string }) {
  return (
    <div className="bg-white rounded-ss-xl border border-slate-300 p-5 shadow-ss-card">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-body text-[13px] font-medium text-slate-500">{label}</div>
          <div className="font-display text-[32px] font-bold text-slate-900 mt-1">{value}</div>
          <div className="font-body text-xs text-slate-400 mt-0.5">{sub}</div>
        </div>
        <div className={`w-11 h-11 rounded-ss-lg ${bg} flex items-center justify-center`}>
          {icon}
        </div>
      </div>
    </div>
  );
}
