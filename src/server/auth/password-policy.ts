export const MIN_PASSWORD_LENGTH = 16;
export function isStrongPassword(password: string) {
  return password.length >= MIN_PASSWORD_LENGTH && password.length <= 72 &&
    new TextEncoder().encode(password).length <= 72 &&
    /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
}

export function breachRangeContains(response: string, suffix: string) {
  return response.split(/\r?\n/).some((line) => {
    const [hash, count] = line.trim().split(":");
    return hash?.toUpperCase() === suffix.toUpperCase() && Number(count) > 0;
  });
}
