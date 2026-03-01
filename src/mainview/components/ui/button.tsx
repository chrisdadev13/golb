"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import type { VariantProps } from "class-variance-authority";
import type * as React from "react";

import { buttonVariants } from "@/components/ui/button-variants";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ButtonProps extends useRender.ComponentProps<"button"> {
  variant?: VariantProps<typeof buttonVariants>["variant"];
  size?: VariantProps<typeof buttonVariants>["size"];
  tooltip?: React.ReactNode;
}

function Button({
  className,
  variant,
  size,
  render,
  tooltip,
  ...props
}: ButtonProps) {
  const typeValue: React.ButtonHTMLAttributes<HTMLButtonElement>["type"] =
    render ? undefined : "button";

  const defaultProps = {
    className: cn(buttonVariants({ className, size, variant })),
    "data-slot": "button",
    type: typeValue,
  };

  const rendered = useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(defaultProps, props),
    render,
  });

  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger render={rendered} />
        <TooltipPopup>{tooltip}</TooltipPopup>
      </Tooltip>
    );
  }

  return rendered;
}

export { Button };
