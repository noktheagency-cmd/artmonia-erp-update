export function normalizeAzerbaijaniSearch(value: string) {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase("az")
    .replaceAll("ə", "e").replaceAll("ğ", "g").replaceAll("ı", "i")
    .replaceAll("ö", "o").replaceAll("ş", "s").replaceAll("ü", "u")
    .replaceAll("ç", "c").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function escapeSearchLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}
