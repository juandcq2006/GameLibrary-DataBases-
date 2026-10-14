import React from 'react';
import { Cloud, Check } from 'lucide-react';

export interface BadgeProps {
  children?: React.ReactNode;
  variant?: 'installed' | 'cloud' | 'genre' | 'achievement' | 'outline' | 'default';
  size?: 'sm' | 'md';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'sm',
  className = '',
}) => {
  const sizeStyles = {
    sm: 'text-[11px] px-2 py-0.5 gap-1.5',
    md: 'text-xs px-2.5 py-1 gap-1.5',
  };

  const getVariantContent = () => {
    switch (variant) {
      case 'installed':
        return (
          <span
            className={`inline-flex items-center font-bold rounded-full bg-[#00FFD1]/15 text-[#00FFD1] dark:text-[#00FFD1] light:text-[#00897B] border border-[#00FFD1]/40 ${sizeStyles[size]} ${className}`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#00FFD1] animate-pulse shadow-[0_0_8px_#00FFD1]" />
            {children || 'Installed'}
          </span>
        );
      case 'cloud':
        return (
          <span
            className={`inline-flex items-center font-medium rounded-full bg-[#1A2A3D] dark:bg-[#1A2A3D] light:bg-[#E2E8F0] text-[#8BA0B2] dark:text-[#8BA0B2] light:text-[#64748B] border border-[#22354B] dark:border-[#22354B] light:border-[#CBD5E1] ${sizeStyles[size]} ${className}`}
          >
            <Cloud className="w-3 h-3 text-[#8BA0B2] dark:text-[#8BA0B2] light:text-[#64748B]" />
            {children || 'Cloud'}
          </span>
        );
      case 'genre':
        return (
          <span
            className={`inline-flex items-center font-medium rounded-md bg-[#1A2A3D] dark:bg-[#1A2A3D] light:bg-[#F1F5F9] text-[#8BA0B2] dark:text-[#8BA0B2] light:text-[#475569] hover:text-[#00FFD1] border border-[#22354B] dark:border-[#22354B] light:border-[#CBD5E1] transition-colors ${sizeStyles[size]} ${className}`}
          >
            {children}
          </span>
        );
      case 'achievement':
        return (
          <span
            className={`inline-flex items-center font-semibold rounded-full bg-amber-500/10 text-amber-400 dark:text-amber-300 light:text-amber-600 border border-amber-500/30 ${sizeStyles[size]} ${className}`}
          >
            <Check className="w-3 h-3 text-amber-400" />
            {children}
          </span>
        );
      case 'outline':
        return (
          <span
            className={`inline-flex items-center font-medium rounded-full border border-[#22354B] dark:border-[#22354B] light:border-[#CBD5E1] text-[#8BA0B2] dark:text-[#8BA0B2] light:text-[#64748B] ${sizeStyles[size]} ${className}`}
          >
            {children}
          </span>
        );
      default:
        return (
          <span
            className={`inline-flex items-center font-medium rounded-full bg-[#1A2A3D] dark:bg-[#1A2A3D] light:bg-[#E2E8F0] text-[#F1F5F9] dark:text-[#F1F5F9] light:text-[#0F172A] border border-[#22354B] dark:border-[#22354B] light:border-[#CBD5E1] ${sizeStyles[size]} ${className}`}
          >
            {children}
          </span>
        );
    }
  };

  return getVariantContent();
};
