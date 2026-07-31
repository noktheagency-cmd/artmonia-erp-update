"use client";

import { useEffect } from "react";

const IDEMPOTENCY_FIELD = "idempotencyKey";
const DUPLICATE_SUBMIT_WINDOW_MS = 1_500;

type SubmissionState = {
  fingerprint: string;
  submittedAt: number;
};

/**
 * Closes the render-time gap between a valid submit and React's pending state.
 * Domain mutations can also consume the injected idempotency key for server-side
 * protection against retries and requests that bypass the rendered UI.
 */
export function CrudSubmissionGuard() {
  useEffect(() => {
    const submissions = new WeakMap<HTMLFormElement, SubmissionState>();

    function handleSubmit(event: SubmitEvent) {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.dataset.duplicateSubmitGuard === "off") return;
      if (form.getAttribute("method")?.toLowerCase() === "get") return;

      const fingerprint = createFormFingerprint(form, event.submitter);
      const previous = submissions.get(form);
      const now = Date.now();

      if (isDuplicateSubmission(previous, fingerprint, now)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      ensureIdempotencyField(form);
      submissions.set(form, { fingerprint, submittedAt: now });
    }

    function getEventForm(event: Event) {
      const target = event.target;
      return (
        target instanceof HTMLFormElement
          ? target
          : target instanceof HTMLElement
            ? target.closest("form")
            : null
      );
    }

    function rotateIdempotencyKey(event: Event) {
      const form = getEventForm(event);

      if (!form || form.dataset.duplicateSubmitGuard === "off") return;
      const field = form.elements.namedItem(IDEMPOTENCY_FIELD);
      if (field instanceof HTMLInputElement) field.value = crypto.randomUUID();
      submissions.delete(form);
    }

    function handleReset(event: Event) {
      const form = getEventForm(event);
      if (!form || form.dataset.duplicateSubmitGuard === "off") return;

      queueMicrotask(() => {
        const field = form.elements.namedItem(IDEMPOTENCY_FIELD);
        if (field instanceof HTMLInputElement) field.value = crypto.randomUUID();
        submissions.delete(form);
      });
    }

    document.addEventListener("submit", handleSubmit, true);
    document.addEventListener("input", rotateIdempotencyKey, true);
    document.addEventListener("change", rotateIdempotencyKey, true);
    document.addEventListener("reset", handleReset, true);

    return () => {
      document.removeEventListener("submit", handleSubmit, true);
      document.removeEventListener("input", rotateIdempotencyKey, true);
      document.removeEventListener("change", rotateIdempotencyKey, true);
      document.removeEventListener("reset", handleReset, true);
    };
  }, []);

  return null;
}

export function isDuplicateSubmission(
  previous: SubmissionState | undefined,
  fingerprint: string,
  now: number,
) {
  return Boolean(
    previous?.fingerprint === fingerprint &&
      now - previous.submittedAt < DUPLICATE_SUBMIT_WINDOW_MS,
  );
}

function ensureIdempotencyField(form: HTMLFormElement) {
  const existing = form.elements.namedItem(IDEMPOTENCY_FIELD);
  if (existing instanceof HTMLInputElement) return existing;

  const field = document.createElement("input");
  field.type = "hidden";
  field.name = IDEMPOTENCY_FIELD;
  field.value = crypto.randomUUID();
  form.append(field);
  return field;
}

function createFormFingerprint(
  form: HTMLFormElement,
  submitter: HTMLElement | null,
) {
  const values: string[] = [];
  const formData = new FormData(form);

  for (const [name, value] of formData.entries()) {
    if (name === IDEMPOTENCY_FIELD) continue;
    values.push(`${name}:${serializeEntry(value)}`);
  }

  if (
    submitter instanceof HTMLButtonElement &&
    submitter.name &&
    !formData.has(submitter.name)
  ) {
    values.push(`${submitter.name}:${submitter.value}`);
  }

  return values.join("\u001f");
}

function serializeEntry(value: FormDataEntryValue) {
  if (typeof value === "string") return value;
  return `${value.name}:${value.size}:${value.type}:${value.lastModified}`;
}
