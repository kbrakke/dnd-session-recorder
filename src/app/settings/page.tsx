'use client';

import { useSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { User, Mail, Link as LinkIcon, CheckCircle } from 'lucide-react';
import Button from '@/components/ui/Button';

interface Account {
  provider: string;
  type: string;
}

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const response = await fetch('/api/user/accounts');
        if (response.ok) {
          const data = await response.json();
          setAccounts(data.accounts || []);
        }
      } catch (error) {
        console.error('Failed to fetch accounts:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (session) {
      fetchAccounts();
    }
  }, [session]);

  const handleLinkGoogle = async () => {
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      // Sign in with Google, which will link the account if user is already authenticated
      const result = await signIn('google', {
        callbackUrl: '/settings?linked=google',
        redirect: true,
      });

      if (result?.error) {
        setError('Failed to link Google account. Please try again.');
      }
    } catch (error) {
      console.error('Google linking error:', error);
      setError('Failed to link Google account. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const hasGoogleAccount = accounts.some(acc => acc.provider === 'google');
  const hasPasswordAccount = accounts.some(acc => acc.provider === 'credentials');
  const isGoogleEnabled = process.env.NEXT_PUBLIC_GOOGLE_ENABLED === 'true';

  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white shadow-lg rounded-lg overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-8">
            <div className="flex items-center space-x-4">
              <div className="bg-white p-3 rounded-full">
                <User className="h-8 w-8 text-blue-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Account Settings</h1>
                <p className="text-blue-100 mt-1">Manage your profile and linked accounts</p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Profile Information */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Profile Information</h2>
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="flex items-center space-x-3">
                  <User className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Name</p>
                    <p className="text-gray-900 font-medium">{session.user?.name || 'Not set'}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <Mail className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Email</p>
                    <p className="text-gray-900 font-medium">{session.user?.email}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Linked Accounts */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Linked Accounts</h2>

              {error && (
                <div className="rounded-md bg-red-50 p-4 mb-4">
                  <div className="text-sm text-red-700">{error}</div>
                </div>
              )}

              {success && (
                <div className="rounded-md bg-green-50 p-4 mb-4">
                  <div className="text-sm text-green-700">{success}</div>
                </div>
              )}

              <div className="space-y-3">
                {/* Email/Password Account */}
                <div className="bg-gray-50 rounded-lg p-4 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="bg-gray-200 p-2 rounded-lg">
                      <Mail className="h-5 w-5 text-gray-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Email & Password</p>
                      <p className="text-sm text-gray-500">Sign in with your email and password</p>
                    </div>
                  </div>
                  {hasPasswordAccount && (
                    <div className="flex items-center space-x-2 text-green-600">
                      <CheckCircle className="h-5 w-5" />
                      <span className="text-sm font-medium">Connected</span>
                    </div>
                  )}
                </div>

                {/* Google Account */}
                {isGoogleEnabled && (
                  <div className="bg-gray-50 rounded-lg p-4 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="bg-white p-2 rounded-lg border border-gray-200">
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                          <path
                            fill="#4285F4"
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                          />
                          <path
                            fill="#34A853"
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                          />
                          <path
                            fill="#FBBC05"
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                          />
                          <path
                            fill="#EA4335"
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                          />
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">Google</p>
                        <p className="text-sm text-gray-500">Sign in with your Google account</p>
                      </div>
                    </div>
                    {hasGoogleAccount ? (
                      <div className="flex items-center space-x-2 text-green-600">
                        <CheckCircle className="h-5 w-5" />
                        <span className="text-sm font-medium">Connected</span>
                      </div>
                    ) : (
                      <Button
                        onClick={handleLinkGoogle}
                        disabled={isLoading}
                        variant="outline"
                        size="sm"
                        className="flex items-center space-x-2"
                      >
                        <LinkIcon className="h-4 w-4" />
                        <span>Link Account</span>
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Tip:</strong> Linking your Google account allows you to sign in using either your email/password or Google authentication.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
