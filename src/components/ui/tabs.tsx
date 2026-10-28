import * as T from "@radix-ui/react-tabs";
import { cn } from "@/lib/cn";

export const Tabs = T.Root;
export const TabsContent = T.Content;

export function TabsList({ className, ...p }: T.TabsListProps) {
  return <T.List className={cn("flex gap-1 overflow-x-auto border-b border-rule [scrollbar-width:none]", className)} {...p} />;
}

export function TabsTrigger({ className, ...p }: T.TabsTriggerProps) {
  return (
    <T.Trigger
      className={cn(
        "relative -mb-px min-h-11 shrink-0 border-b-2 border-transparent px-3 text-[15px] text-muted transition-colors hover:text-ink data-[state=active]:border-primary data-[state=active]:font-semibold data-[state=active]:text-ink",
        className,
      )}
      {...p}
    />
  );
}
