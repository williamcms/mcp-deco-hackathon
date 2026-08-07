import { ChevronDownIcon } from "lucide-react";
import * as React from "react";

import { cn } from "@/web/lib/utils";

function NativeSelect({
  className,
  size = "default",
  ...props
}: Omit<React.ComponentProps<"select">, "size"> & { size?: "sm" | "default" }) {
  return (
    <div
      className="group/native-select relative has-[select:disabled]:opacity-50 w-fit"
      data-slot="native-select-wrapper"
    >
      <select
        data-slot="native-select"
        data-size={size}
        className={cn(
          "bg-transparent selection:bg-primary dark:bg-input/30 dark:hover:bg-input/50 shadow-xs px-3 py-2 data-[size=sm]:py-1 pr-9 border border-input rounded-md outline-none w-full min-w-0 h-9 data-[size=sm]:h-8 selection:text-primary-foreground placeholder:text-muted-foreground text-sm transition-[color,box-shadow] appearance-none disabled:cursor-not-allowed disabled:pointer-events-none",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
          className,
        )}
        {...props}
      />
      <ChevronDownIcon
        className="top-1/2 right-3.5 absolute opacity-50 size-4 text-muted-foreground -translate-y-1/2 pointer-events-none select-none"
        aria-hidden="true"
        data-slot="native-select-icon"
      />
    </div>
  );
}

function NativeSelectOption({ ...props }: React.ComponentProps<"option">) {
  return <option data-slot="native-select-option" {...props} />;
}

function NativeSelectOptGroup({ className, ...props }: React.ComponentProps<"optgroup">) {
  return <optgroup data-slot="native-select-optgroup" className={cn(className)} {...props} />;
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption };
