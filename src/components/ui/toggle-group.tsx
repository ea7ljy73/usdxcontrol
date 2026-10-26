import type { ComponentProps, ReactNode } from 'react'
import { ToggleGroup as RadixToggleGroup } from 'radix-ui'
import { cn } from '@/lib/cn'

export function ToggleGroup({ className, ...props }: ComponentProps<typeof RadixToggleGroup.Root>) {
  return <RadixToggleGroup.Root {...props} className={cn('grid gap-px', className)} />
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
        'flex h-9 items-center justify-center bg-tile px-2 text-sm font-medium text-fg outline-none transition-colors duration-150',
        'hover:bg-tile-hover',
        'focus-visible:ring-2 focus-visible:ring-slice focus-visible:ring-inset',
        'data-[state=on]:bg-navy data-[state=on]:hover:bg-navy-hover',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
        className,
      )}
    >
      {children}
    </RadixToggleGroup.Item>
  )
}
