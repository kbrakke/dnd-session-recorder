import { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
  className?: string;
}

export default function Button({
  variant = 'primary',
  size = 'md',
  children,
  className,
  ...props
}: ButtonProps) {
  const baseClasses = 'font-semibold rounded-ss-lg transition-all duration-150 focus:outline-none focus:ring-[3px] focus:ring-ink-900/[0.18] inline-flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed';

  const variants = {
    primary: 'bg-ink-900 hover:bg-ink-950 text-white border border-ink-950 shadow-ss-btn',
    secondary: 'bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-400 shadow-ss-btn-light',
    outline: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-400',
    ghost: 'bg-transparent hover:bg-ink-50 text-ink-900 border border-transparent',
    danger: 'bg-red-800 hover:bg-red-900 text-white border border-red-900 shadow-ss-btn',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-[22px] py-[11px] text-base',
  };

  return (
    <button
      className={cn(
        baseClasses,
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
