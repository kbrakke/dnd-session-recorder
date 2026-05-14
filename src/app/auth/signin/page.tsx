'use client';

import { useState, useEffect, Suspense } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Mail, Lock, Scroll } from 'lucide-react';
import Button from '@/components/ui/Button';
import { TextInput } from '@/components/forms';
import { signInSchema, type SignInFormData } from './schema';
import { logger } from '@/lib/logger';

function SignInForm() {
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignInFormData>({
    resolver: zodResolver(signInSchema),
    mode: 'onBlur',
  });

  useEffect(() => {
    const urlError = searchParams.get('error');
    if (urlError) {
      logger.warn('Authentication error from URL', { error: urlError });

      const errorMessages = {
        'CredentialsSignin': 'Invalid email or password. Please check your credentials.',
        'OAuthCallback': 'Google authentication failed. Please try again.',
        'AccessDenied': 'This email address is not authorized to access the staging environment. Please contact an administrator.',
        'OAuthAccountNotLinked': 'This account is linked to a different sign-in method.',
        'Default': 'An authentication error occurred. Please try again.',
      };

      setError('root', {
        message: errorMessages[urlError as keyof typeof errorMessages] || errorMessages.Default,
      });
    }
  }, [searchParams, setError]);

  const onSubmit = async (data: SignInFormData) => {
    try {
      const result = await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: false,
      });

      if (result?.error) {
        setError('root', { message: 'Invalid email or password' });
      } else {
        router.push('/');
        router.refresh();
      }
    } catch {
      setError('root', { message: 'Something went wrong. Please try again.' });
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      logger.debug('Starting Google OAuth sign in');

      const result = await signIn('google', {
        callbackUrl: '/',
        redirect: false
      });

      logger.debug('Google sign in result received', { hasError: !!result?.error, ok: result?.ok });

      if (result?.error) {
        logger.error('Google sign in failed', new Error(result.error));
        setError('root', { message: `Google sign in failed: ${result.error}` });
      } else if (result?.ok) {
        logger.info('Google sign in successful, redirecting');
        router.push('/');
      } else {
        logger.debug('Google sign in - no result, may be redirecting');
      }
    } catch (error) {
      logger.error('Google sign in exception', error instanceof Error ? error : new Error(String(error)));
      setError('root', { message: 'Google sign in failed. Please try again.' });
    }
  };

  const isGoogleEnabled = process.env.NEXT_PUBLIC_GOOGLE_ENABLED === 'true';

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-160px)]">
      <div className="w-[420px] bg-white rounded-ss-xl border border-slate-300 p-8 shadow-ss-card">
        {/* Logo + heading */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-3 mb-5">
            <div className="w-11 h-11 rounded-ss-xl bg-gradient-to-br from-ink-900 to-ink-950 flex items-center justify-center border border-ink-950 shadow-ss-btn">
              <Scroll className="h-[22px] w-[22px] text-white" />
            </div>
          </div>
          <h2 className="font-display text-[26px] font-semibold text-slate-900 mt-0 mb-1">Welcome back</h2>
          <p className="font-body text-sm text-slate-500 m-0">Continue your chronicle.</p>
        </div>

        <form className="flex flex-col gap-3.5" onSubmit={handleSubmit(onSubmit)}>
          {errors.root && (
            <div className="rounded-ss-lg bg-red-50 border border-red-200 p-3">
              <div className="text-sm text-red-900 font-medium">{errors.root.message}</div>
            </div>
          )}

          <TextInput
            {...register('email')}
            id="email"
            type="email"
            autoComplete="email"
            label="Email"
            error={errors.email?.message}
            placeholder="dm@yourtable.com"
            icon={<Mail className="h-4 w-4" />}
          />

          <TextInput
            {...register('password')}
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            label="Password"
            error={errors.password?.message}
            placeholder="••••••••"
            icon={<Lock className="h-4 w-4" />}
            endIcon={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 h-4 w-4 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </button>
            }
          />

          <Button
            type="submit"
            size="lg"
            disabled={isSubmitting}
            className="w-full"
          >
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </Button>

          {isGoogleEnabled && (
            <>
              <div className="flex items-center gap-2.5 my-1.5">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="font-body text-xs text-slate-400">or</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>

              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={handleGoogleSignIn}
                disabled={isSubmitting}
                className="w-full"
              >
                Continue with Google
              </Button>
            </>
          )}

          <div className="text-center font-body text-[13px] text-slate-500 mt-1.5">
            New here?{' '}
            <Link href="/auth/signup" className="text-ink-900 font-semibold hover:underline">
              Create an account
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SignInForm />
    </Suspense>
  );
}
