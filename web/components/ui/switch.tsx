import { Switch as SwitchPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/web/lib/utils";

function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default";
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "group/switch peer inline-flex items-center data-[state=checked]:bg-primary data-[state=unchecked]:bg-input dark:data-[state=unchecked]:bg-input/80 disabled:opacity-50 shadow-xs border border-transparent focus-visible:border-ring rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[size=default]:w-8 data-[size=sm]:w-6 data-[size=default]:h-[1.15rem] data-[size=sm]:h-3.5 transition-all disabled:cursor-not-allowed shrink-0",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "block bg-background dark:data-[state=checked]:bg-primary-foreground dark:data-[state=unchecked]:bg-foreground rounded-full ring-0 group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0 pointer-events-none",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
