/**
 * Azerbaijan phone: "+" plus 12 digits → 13 characters total.
 * Example: +994501234567
 */
export const AZ_PHONE_MAX_LENGTH = 13;

export function isPhoneFieldProps(props: {
  type?: string;
  name?: string;
  inputMode?: string;
}) {
  return props.type === "tel" || props.inputMode === "tel" || props.name === "phone";
}

/** Keep a single leading "+" and digits only — strip letters, spaces, and other junk. */
export function sanitizeAzPhoneInput(value: string): string {
  const stripped = value.replace(/[^\d+]/g, "");
  const chars: string[] = [];
  for (const char of stripped) {
    if (char === "+") {
      if (chars.length === 0) chars.push(char);
      continue;
    }
    chars.push(char);
    if (chars.length >= AZ_PHONE_MAX_LENGTH) break;
  }
  return chars.join("");
}

export function blockInvalidNumberKey(event: {
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  key: string;
  preventDefault: () => void;
}) {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key.length !== 1) return;
  // Block scientific notation and any letter; keep digits, decimal, sign.
  if (/[eE]/.test(event.key) || /[a-zA-Z]/.test(event.key)) {
    event.preventDefault();
  }
}
