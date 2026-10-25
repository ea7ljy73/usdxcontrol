import type { ComponentProps, ReactNode } from 'react'
import { ToggleGroup as RadixToggleGroup } from 'radix-ui'
import { cn } from '@/lib/cn'

export function ToggleGroup({ className, ...props }: ComponentProps<typeof RadixToggleGroup.Root>) {
  return (
    <RadixToggleGroup.Root
      {...props}
      className={cn(
        'inline-flex items-center gap-1 rounded-lg border border-line bg-panel p-1',
        className,
      )}
    />
  )
}

export function ToggleGroupItem({
  className,
  children,
  ...props
}: ComponentProps<typeof RadixToggleGroup.Item> & { children: ReactNode }) {
  return (
    <RadixToggleGroup.Item
      {...props}
      className={cn(
        'rounded-lg px-3 py-2 text-sm font-medium text-muted outline-none transition-colors duration-150',
        'hover:bg-line hover:text-fg',
        'focus-visible:ring-2 focus-visible:ring-accent',
        'data-[state=on]:bg-accent data-[state=on]:text-accent-fg',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
        className,
      )}
    >
      {children}
    </RadixToggleGroup.Item>
  )
}
