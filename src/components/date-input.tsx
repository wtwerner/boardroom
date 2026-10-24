"use client";

import type { ComponentProps } from "react";

/**
 * A native date field where clicking anywhere opens the calendar, not just the
 * small icon. Typing the date still works.
 */
export function DateInput(props: Omit<ComponentProps<"input">, "type">) {
  return (
    <input
      {...props}
      type="date"
      onClick={(e) => {
        props.onClick?.(e);
        try {
          e.currentTarget.showPicker();
        } catch {
          // Not supported, or not allowed right now: the field still works by typing
        }
      }}
    />
  );
}
