import "server-only";
import { createHash } from "node:crypto";
import { isStrongPassword, breachRangeContains } from "./password-policy";
import { PublicActionError } from "@/server/actions/public-action-error";

export async function assertSafePassword(password: string) {
  if (!isStrongPassword(password)) throw new PublicActionError("Parol 16–72 simvol, böyük/kiçik hərf, rəqəm və xüsusi simvol daxil etməlidir; UTF-8 ölçüsü 72 baytı keçməməlidir.");
  const hash = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  // k-anonymity: send only the first five hash characters, never the password/full hash.
  let response: Response;
  try {
    response = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0,5)}`, {
      headers: {"Add-Padding":"true", "User-Agent":"ArtmoniaERP-Password-Security"}, cache:"no-store", signal:AbortSignal.timeout(5000),
    });
  } catch { throw new PublicActionError("Şifrə təhlükəsizliyi yoxlanıla bilmədi. Bir az sonra yenidən cəhd edin."); }
  if (!response.ok) throw new PublicActionError("Şifrə təhlükəsizliyi xidməti müvəqqəti əlçatan deyil.");
  if (breachRangeContains(await response.text(), hash.slice(5))) {
    throw new PublicActionError("Bu parol məlum sızmalarda tapılıb. Başqa, unikal parol seçin.");
  }
}
