import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: React.ReactNode;
  rightElement?: React.ReactNode;
  onClear?: () => void;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ leftIcon, rightElement, onClear, className = '', value, ...props }, ref) => {
    return (
      <div className="relative flex items-center w-full">
        {leftIcon && (
          <div className="absolute left-3.5 flex items-center pointer-events-none text-[#8B9EAE]">
            {leftIcon}
          </div>
        )}
        <input
          ref={ref}
          value={value}
          className={`w-full bg-[#18232D] text-[#F8FAFC] placeholder-[#8B9EAE] text-sm rounded-lg border border-[#1E2B35] transition-all duration-200 outline-none focus:ring-2 focus:ring-[#14F1D9] focus:border-transparent ${
            leftIcon ? 'pl-10' : 'pl-3.5'
          } ${rightElement || onClear ? 'pr-14' : 'pr-3.5'} py-2.5 ${className}`}
          {...props}
        />
        {rightElement && (
          <div className="absolute right-3 flex items-center">{rightElement}</div>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
