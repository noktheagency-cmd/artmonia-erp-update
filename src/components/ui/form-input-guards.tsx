"use client";

import { useEffect } from "react";
import {
  blockInvalidNumberKey,
  isPhoneFieldProps,
  sanitizeAzPhoneInput,
} from "@/lib/phone-input";

/** Covers raw `<input>` nodes that do not go through `Input` / `InputGroupInput`. */
export function FormInputGuards() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;

      if (target.type === "number") {
        blockInvalidNumberKey(event);
        return;
      }

      if (
        isPhoneFieldProps({
          type: target.type,
          name: target.name,
          inputMode: target.inputMode,
        }) &&
        typeof event.key === "string" &&
        event.key.length === 1 &&
        /[a-zA-Z]/i.test(event.key) &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
      }
    }

    function onInput(event: Event) {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (
        !isPhoneFieldProps({
          type: target.type,
          name: target.name,
          inputMode: target.inputMode,
        })
      ) {
        return;
      }

      const next = sanitizeAzPhoneInput(target.value);
      if (next !== target.value) {
        target.value = next;
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("input", onInput, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("input", onInput, true);
    };
  }, []);

  return null;
}
