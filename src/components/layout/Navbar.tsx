'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { Home, User, LogOut, Settings, Scroll, PenTool, Archive, BookOpen, HardDrive, ChevronDown, CreditCard } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import Button from '@/components/ui/Button';

export default function Navbar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [imageError, setImageError] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const navItems = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/sessions/upload', label: 'New Session', icon: PenTool },
    { href: '/campaigns', label: 'Campaigns', icon: BookOpen },
    { href: '/sessions', label: 'Sessions', icon: Archive },
  ];

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/' });
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowProfileDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setImageError(false);
  }, [session?.user?.image]);

  return (
    <nav className="bg-white border-b border-slate-300">
      <div className="max-w-[1280px] mx-auto px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-ss-xl bg-gradient-to-br from-ink-900 to-ink-950 flex items-center justify-center border border-ink-950 shadow-ss-btn">
              <Scroll className="h-[22px] w-[22px] text-white" />
            </div>
            <div>
              <span className="text-2xl font-bold font-display bg-gradient-to-r from-ink-900 to-ink-950 bg-clip-text text-transparent leading-none block">
                StoryScribe
              </span>
              <div className="text-xs text-slate-500 font-body mt-0.5">Annals of heroism and folly.</div>
            </div>
          </Link>

          <div className="flex items-center gap-4">
            {/* Navigation Items */}
            <div className="flex gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-ss-lg text-sm font-medium transition-all duration-150 border ${
                      isActive
                        ? 'bg-ink-50 text-ink-900 border-ink-300 shadow-ss-card'
                        : 'text-slate-700 hover:text-ink-900 hover:bg-ink-50 border-transparent'
                    }`}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>

            {/* Auth section */}
            <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
              {status === 'loading' ? (
                <div className="w-8 h-8 bg-slate-200 rounded-full animate-pulse" />
              ) : session ? (
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                    className="flex items-center gap-2 p-1.5 rounded-ss-lg hover:bg-slate-50 transition-colors duration-150"
                  >
                    {session.user?.image && !imageError ? (
                      <Image
                        src={session.user.image}
                        alt={session.user.name || 'Profile'}
                        width={32}
                        height={32}
                        className="w-8 h-8 rounded-full"
                        onError={() => setImageError(true)}
                      />
                    ) : (
                      <div className="w-8 h-8 bg-gradient-to-br from-ink-900 to-ink-950 rounded-full flex items-center justify-center border border-ink-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                        <User className="h-4 w-4 text-white" />
                      </div>
                    )}
                    <span className="text-sm font-medium text-slate-800">
                      {session.user?.name || session.user?.email}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                  </button>

                  {showProfileDropdown && (
                    <div className="absolute right-0 mt-2 w-[200px] bg-white rounded-ss-lg border border-slate-300 shadow-ss-lg py-1.5 z-50">
                      <div className="px-3.5 py-2 border-b border-slate-200">
                        <p className="text-sm font-semibold text-slate-900">
                          {session.user?.name || 'User'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {session.user?.email}
                        </p>
                      </div>
                      <Link
                        href="/uploads"
                        className="w-full px-3.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors duration-150"
                        onClick={() => setShowProfileDropdown(false)}
                      >
                        <HardDrive className="h-4 w-4" />
                        <span>My Uploads</span>
                      </Link>
                      <Link
                        href="/billing"
                        className="w-full px-3.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors duration-150"
                        onClick={() => setShowProfileDropdown(false)}
                      >
                        <CreditCard className="h-4 w-4" />
                        <span>Billing</span>
                      </Link>
                      <Link
                        href="/settings"
                        className="w-full px-3.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors duration-150"
                        onClick={() => setShowProfileDropdown(false)}
                      >
                        <Settings className="h-4 w-4" />
                        <span>Settings</span>
                      </Link>
                      <button
                        onClick={handleSignOut}
                        className="w-full px-3.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors duration-150"
                      >
                        <LogOut className="h-4 w-4" />
                        <span>Sign out</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Link href="/auth/signin">
                    <Button variant="outline" size="sm">Sign in</Button>
                  </Link>
                  <Link href="/auth/signup">
                    <Button size="sm">Sign up</Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
