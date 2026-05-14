'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Mail, Lock, User, Scroll } from 'lucide-react';
import Button from '@/components/ui/Button';
import { TextInput } from '@/components/forms';
import { signUpSchema, type SignUpFormData } from './schema';

export default function SignUpPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
    mode: 'onBlur',
  });

  const onSubmit = async (data: SignUpFormData) => {
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          password: data.password,
        }),
      });

      if (response.ok) {
        const result = await signIn('credentials', {
          email: data.email,
          password: data.password,
          redirect: false,
        });

        if (result?.error) {
          setError('root', { message: 'Registration successful but login failed. Please try signing in.' });
        } else {
          router.push('/');
          router.refresh();
        }
      } else {
        const responseData = await response.json();
        setError('root', { message: responseData.error || 'Registration failed' });
      }
    } catch {
      setError('root', { message: 'Something went wrong. Please try again.' });
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      await signIn('google', { callbackUrl: '/' });
    } catch {
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
          <h2 className="font-display text-[26px] font-semibold text-slate-900 mt-0 mb-1">Create your account</h2>
          <p className="font-body text-sm text-slate-500 m-0">Begin your chronicle.</p>
        </div>

        <form className="flex flex-col gap-3.5" onSubmit={handleSubmit(onSubmit)}>
          {errors.root && (
            <div className="rounded-ss-lg bg-red-50 border border-red-200 p-3">
              <div className="text-sm text-red-900 font-medium">{errors.root.message}</div>
            </div>
          )}

          <TextInput
            {...register('name')}
            id="name"
            type="text"
            autoComplete="name"
            label="Full name"
            error={errors.name?.message}
            placeholder="Enter your full name"
            icon={<User className="h-4 w-4" />}
          />

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
            autoComplete="new-password"
            label="Password"
            error={errors.password?.message}
            placeholder="Enter your password"
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

          <TextInput
            {...register('confirmPassword')}
            id="confirmPassword"
            type={showConfirmPassword ? 'text' : 'password'}
            autoComplete="new-password"
            label="Confirm password"
            error={errors.confirmPassword?.message}
            placeholder="Confirm your password"
            icon={<Lock className="h-4 w-4" />}
            endIcon={
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-2.5 h-4 w-4 text-slate-400 hover:text-slate-600"
              >
                {showConfirmPassword ? <EyeOff /> : <Eye />}
              </button>
            }
          />

          <Button
            type="submit"
            size="lg"
            disabled={isSubmitting}
            className="w-full"
          >
            {isSubmitting ? 'Creating account...' : 'Create account'}
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
            Already have an account?{' '}
            <Link href="/auth/signin" className="text-ink-900 font-semibold hover:underline">
              Sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
