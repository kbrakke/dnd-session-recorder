'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { Home, User, LogOut, Settings, Scroll, PenTool, Archive, HardDrive, Info } from 'lucide-react';
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
    { href: '/campaigns', label: 'Campaigns', icon: Archive },
  ];

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/' });
  };

  // Handle click outside dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowProfileDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Reset image error when session changes
  useEffect(() => {
    setImageError(false);
  }, [session?.user?.image]);

  return (
    <nav className="bg-white shadow-lg border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          <Link href="/" className="flex items-center space-x-3">
            <div className="bg-gradient-to-r from-blue-900 to-blue-950 p-2 rounded-xl shadow-md">
              <Scroll className="h-8 w-8 text-white" />
            </div>
            <div>
              <span className="text-2xl font-bold bg-gradient-to-r from-blue-900 to-blue-950 bg-clip-text text-transparent">
                D&D Chronicles
              </span>
              <div className="text-sm text-slate-600">Annals of heroism and folly.</div>
            </div>
          </Link>

          <div className="flex items-center space-x-4">
            {/* Navigation Items */}
            <div className="flex space-x-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${isActive
                      ? 'bg-blue-50 text-blue-900 border border-blue-200 shadow-sm'
                      : 'text-slate-700 hover:text-blue-900 hover:bg-blue-50'
                      }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>

            {/* Authentication Section */}
            <div className="flex items-center space-x-3 border-l border-slate-200 pl-4">
              {/* About Link */}
              <Link
                href="/about"
                className="flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-700 hover:text-blue-900 hover:bg-blue-50 transition-colors"
                title="About"
              >
                <Info className="h-5 w-5" />
                <span className="hidden sm:inline">About</span>
              </Link>

              {status === 'loading' ? (
                <div className="w-8 h-8 bg-slate-200 rounded-full animate-pulse"></div>
              ) : session ? (
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                    className="flex items-center space-x-2 p-2 rounded-lg hover:bg-slate-50 transition-colors"
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
                      <div className="w-8 h-8 bg-gradient-to-r from-blue-900 to-blue-950 rounded-full flex items-center justify-center shadow-sm">
                        <User className="h-4 w-4 text-white" />
                      </div>
                    )}
                    <span className="text-sm font-medium text-slate-800">
                      {session.user?.name || session.user?.email}
                    </span>
                  </button>

                  {showProfileDropdown && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-slate-200 py-2 z-50">
                      <div className="px-4 py-2 border-b border-slate-200">
                        <p className="text-sm font-medium text-slate-900">
                          {session.user?.name || 'User'}
                        </p>
                        <p className="text-xs text-slate-600">
                          {session.user?.email}
                        </p>
                      </div>
                      <Link
                        href="/uploads"
                        className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 flex items-center space-x-2"
                        onClick={() => setShowProfileDropdown(false)}
                      >
                        <HardDrive className="h-4 w-4" />
                        <span>My Uploads</span>
                      </Link>
                      <Link
                        href="/settings"
                        className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 flex items-center space-x-2"
                        onClick={() => setShowProfileDropdown(false)}
                      >
                        <Settings className="h-4 w-4" />
                        <span>Settings</span>
                      </Link>
                      <button
                        onClick={handleSignOut}
                        className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 flex items-center space-x-2"
                      >
                        <LogOut className="h-4 w-4" />
                        <span>Sign out</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <Link href="/auth/signin">
                    <Button variant="outline" size="sm">
                      Sign in
                    </Button>
                  </Link>
                  <Link href="/auth/signup">
                    <Button size="sm">
                      Sign up
                    </Button>
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