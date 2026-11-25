import * as React from 'react';

import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
    ({ className, type = 'text', ...props }, ref) => (
        <input
            type={type}
            className={cn(
                'flex h-9 w-full rounded-lg border border-input bg-card px-3 py-1 text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
                className,
            )}
            ref={ref}
            {...props}
        />
    ),
);
Input.displayName = 'Input';

export { Input };
