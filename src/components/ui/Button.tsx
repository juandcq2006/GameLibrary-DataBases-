import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  leftIcon,
  rightIcon,
  className = '',
  disabled,
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center justify-center font-medium transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed outline-none focus:ring-2 focus:ring-[#00FFD1] focus:outline-none select-none rounded-xl';

  const variants = {
    primary:
      'bg-[#00FFD1] text-[#0B141E] font-bold hover:bg-[#00E5BC] active:scale-[0.98] shadow-[0_0_15px_rgba(0,255,209,0.35)] hover:shadow-[0_0_25px_rgba(0,255,209,0.55)]',
    secondary:
      'bg-[#131F2E] dark:bg-[#131F2E] light:bg-white text-[#F1F5F9] dark:text-[#F1F5F9] light:text-[#0F172A] border border-[#22354B] dark:border-[#22354B] light:border-[#CBD5E1] hover:border-[#00FFD1] hover:bg-[#1A2A3D] dark:hover:bg-[#1A2A3D] light:hover:bg-[#F1F5F9]',
    outline:
      'border border-[#22354B] dark:border-[#22354B] light:border-[#CBD5E1] text-[#8BA0B2] dark:text-[#8BA0B2] light:text-[#64748B] hover:text-[#00FFD1] hover:border-[#00FFD1] hover:bg-[#00FFD1]/10',
    ghost:
      'text-[#8BA0B2] dark:text-[#8BA0B2] light:text-[#64748B] hover:text-[#00FFD1] hover:bg-[#1A2A3D]/70 dark:hover:bg-[#1A2A3D]/70 light:hover:bg-[#E2E8F0]',
    danger:
      'bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 hover:border-red-500',
  };

  const sizes = {
    sm: 'text-xs px-3 py-1.5 gap-1.5',
    md: 'text-sm px-4 py-2 gap-2',
    lg: 'text-base px-6 py-3 gap-2.5 font-bold',
    icon: 'p-2 aspect-square',
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>}
      {children}
      {rightIcon && <span className="inline-flex shrink-0">{rightIcon}</span>}
    </button>
  );
};
