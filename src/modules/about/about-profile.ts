export const ABOUT_PROFILE_SINGLETON_KEY = "primary";

export type AboutProfileSnapshot = {
  title: string;
  tagline: string;
  story: string;
  mission: string;
  vision: string;
  values: string[];
  updatedAt: string | null;
};

export const defaultAboutProfile: AboutProfileSnapshot = {
  title: "Biz kimik",
  tagline: "İncəsənəti öyrənmək, yaratmaq və paylaşmaq üçün canlı bir yaradıcılıq mühiti.",
  story:
    "Artmonia fərqli yaş və təcrübə səviyyələrindən olan insanları incəsənət ətrafında birləşdirən yaradıcı təhsil məkanıdır. Burada hər bir iştirakçının öz üslubunu kəşf etməsi, texniki bacarıqlarını inkişaf etdirməsi və ideyalarını inamla ifadə etməsi üçün düşünülmüş öyrənmə təcrübəsi qururuq.",
  mission:
    "İncəsənət təhsilini sistemli, ilhamverici və hər kəs üçün əlçatan təcrübəyə çevirmək.",
  vision:
    "Yaradıcılığın gündəlik həyatın təbii hissəsi olduğu güclü və açıq bir icma formalaşdırmaq.",
  values: ["Yaradıcılıq", "İnkişaf", "Səmimiyyət", "Birlik"],
  updatedAt: null,
};

export function normalizeAboutValues(value: string) {
  return [...new Set(
    value
      .split(/\r?\n|,/)
      .map((item) => item.replace(/\s+/g, " ").trim())
      .filter(Boolean),
  )];
}
