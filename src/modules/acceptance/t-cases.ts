/**
 * T-01…T-54 acceptance catalog from Artmonia-ERP-Biznes-Mentiqi-2026-10-18.pdf §21.
 * mode:
 *   automated — covered by t-matrix.test.ts policy/SQL assertions
 *   manual — requires UI / live DB smoke (listed by runner)
 */

export type AcceptanceMode = "automated" | "manual";

export type AcceptanceCase = {
  id: `T-${string}`;
  section: "admission" | "meeting" | "billing" | "analytics";
  event: string;
  expected: string;
  mode: AcceptanceMode;
  bk?: string;
};

export const acceptanceCases: AcceptanceCase[] = [
  { id: "T-01", section: "admission", event: "Ödənişsiz ilkin kart (hədiyyə istisna)", expected: "Ödənişsiz qeydiyyat bloklanır; satış yalnız ödənişlə", mode: "automated", bk: "BK-01" },
  { id: "T-02", section: "admission", event: "Müqavilə var, qəbul ödənişi 19 AZN", expected: "Uyğun satış yaranmır", mode: "automated", bk: "BK-02" },
  { id: "T-03", section: "admission", event: "Müqavilə yoxdur, 20 AZN ödənib", expected: "Pul görünür; tamamlanmış qəbul satışı yoxdur", mode: "automated", bk: "BK-02" },
  { id: "T-04", section: "admission", event: "Müqavilə və bir qəbul ödənişi 20 AZN", expected: "Bir satış; aktivlik və dövr başlamır (yalnız PRESENT sonrası)", mode: "automated", bk: "BK-02/BK-06" },
  { id: "T-05", section: "admission", event: "149 AZN paketdə 20-dən sonra 129 AZN gəlir", expected: "Eyni satış qalır, ilk haqq tamamlanır", mode: "automated", bk: "BK-03" },
  { id: "T-06", section: "admission", event: "Avanslı tələbəyə slot və ilk dərs verilir", expected: "Slot gözləyir; plan görünür, aktiv deyil", mode: "automated", bk: "BK-07" },
  { id: "T-07", section: "admission", event: "Qalıq olduğu halda ilk aylıq iştirak yazılır", expected: "Bütün girişlərdə bloklanır", mode: "manual", bk: "BK-05" },
  { id: "T-08", section: "admission", event: "Tam ilk haqqdan sonra ilk aylıq iştirak yazılır", expected: "Avtomatik aktivləşir, dövr başlayır", mode: "automated", bk: "BK-06" },
  { id: "T-09", section: "admission", event: "Plan 5-dir, gəlmir, tam ödənişlə ilk iştirak 8-dir", expected: "Başlanğıc 8; tarix sürüşmür", mode: "automated", bk: "BK-08/BK-09" },
  { id: "T-10", section: "admission", event: "Qəbul görüşündə iştirak var, aylıq dərs yoxdur", expected: "Aktivlik və billing başlamır", mode: "automated", bk: "BK-06" },
  { id: "T-11", section: "admission", event: "Eyni qəbul eyni anda iki dəfə tamamlanır", expected: "Bir profil/qəbul satışı; təkrar pul yaranmır", mode: "manual", bk: "BK-03" },
  { id: "T-12", section: "admission", event: "Eyni ödəniş yenidən göndərilir", expected: "Əvvəlki nəticə qaytarılır, ikinci satış yoxdur", mode: "manual", bk: "BK-03" },
  { id: "T-13", section: "admission", event: "Ad/valideyn məlumatı redaktə olunur", expected: "Borc, satış günü və billing günü dəyişmir", mode: "manual" },

  { id: "T-14", section: "meeting", event: "Görüşdən qeydiyyata keçid, iştirak qeyd edilməyib", expected: "Həmin pəncərədə iştirak təsdiqi çıxır", mode: "automated", bk: "BK-18" },
  { id: "T-15", section: "meeting", event: "Əvvəl iştirak təsdiqlənib, qeydiyyat tamamlanır", expected: "İkinci iştirak yaranmır", mode: "manual", bk: "BK-18" },
  { id: "T-16", section: "meeting", event: "Heç görüş keçmədən paket alınır", expected: "Birbaşa qəbul; süni görüş yoxdur", mode: "automated", bk: "BK-17" },
  { id: "T-17", section: "meeting", event: "Görüşə gəlməyib, sonra WhatsApp-la ödəyir", expected: "Köhnə Gəlmədi qalır; Birbaşa satış", mode: "manual", bk: "BK-17" },
  { id: "T-18", section: "meeting", event: "Nəticəsiz görüşü boş saxlayıb Birbaşa seçilir", expected: "Real nəticə/təsnif yoxlaması tələb olunur", mode: "manual" },
  { id: "T-19", section: "meeting", event: "Konsultasiyaya gəlib, sınaq etmədən ödəyir", expected: "Qəbul mümkündür; sınaq məcburi deyil", mode: "automated", bk: "BK-16" },
  { id: "T-20", section: "meeting", event: "Konsultasiya və sınaq eyni görüş axınındadır", expected: "Bir iştirakçı; satış bir dəfə", mode: "automated", bk: "BK-16" },
  { id: "T-21", section: "meeting", event: "Görüş əvvəlcədən başqa tarixə keçirilir", expected: "Köhnə plan/səbəb qalır; yeni plan", mode: "manual" },
  { id: "T-22", section: "meeting", event: "Gəlməyib, yenidən planlanıb, sonra gəlib", expected: "Gəlmədi və İştirak etdi tarixçədə qalır", mode: "manual" },
  { id: "T-23", section: "meeting", event: "Görüş vaxtı keçib, nəticə yoxdur", expected: "Nəticə gözləyir; uydurma iştirak yoxdur", mode: "manual" },
  { id: "T-24", section: "meeting", event: "Birbaşa satışdan sonra görüş keçirilir", expected: "Keçmiş satış yolu səssiz dəyişmir", mode: "manual", bk: "BK-17" },

  { id: "T-25", section: "billing", event: "Eyni ilkin haqq dərsdən əvvəl tam ödənib", expected: "İlk iştirakda ikinci eyni faktura yaranmır", mode: "manual", bk: "BK-05" },
  { id: "T-26", section: "billing", event: "149 AZN fakturaya 149 AZN ayrılır", expected: "Qalıq sıfır; borc uydurulmur", mode: "manual" },
  { id: "T-27", section: "billing", event: "Oktyabrda əvvəlki dövrə aid pul alınır", expected: "Pul tarixi və xidmət dövrü ayrı saxlanır", mode: "manual" },
  { id: "T-28", section: "billing", event: "Növbəti aylıq haqq qəbul edilir", expected: "Yeni qəbul satışı yaranmır", mode: "automated", bk: "BK-14" },
  { id: "T-29", section: "billing", event: "8 dərslik dövrdə 7 iştirak və 1 buraxma", expected: "Buraxılmış dərs batır; tarix sürüşmür", mode: "automated", bk: "BK-09" },
  { id: "T-30", section: "billing", event: "Ödəniş günü 5, 1 noyabrda dondurma", expected: "5 noyabr tam haqq yaranır; yer saxlanır", mode: "automated", bk: "BK-10" },
  { id: "T-31", section: "billing", event: "Dondurmada ödəniş alınmır", expected: "Borc yaranır, pul ödənilmiş göstərilmir", mode: "manual", bk: "BK-10" },
  { id: "T-32", section: "billing", event: "14 gündən çox gecikmə var", expected: "Avtomatik dayandırma yoxdur", mode: "automated", bk: "BK-11" },
  { id: "T-33", section: "billing", event: "Menecer manual dayandırır", expected: "Yer azad olur; borc/tarixçə qalır", mode: "automated", bk: "BK-12" },
  { id: "T-34", section: "billing", event: "FROZEN bərpası və ödəniş", expected: "RETURN sale (course_sales); avans/tam ödəniş uyğunlaşır", mode: "automated", bk: "BK-13" },
  { id: "T-35", section: "billing", event: "STOPPED tələbə uyğun yeni qəbulla qayıdır", expected: "Təkrar satış/KPI +1; eyni profil", mode: "automated", bk: "BK-13" },
  { id: "T-36", section: "billing", event: "Qayıdan tələbə yalnız köhnə borcu ödəyir", expected: "Özü yeni qəbul satışı yaratmır", mode: "automated", bk: "BK-13" },
  { id: "T-37", section: "billing", event: "İlk ay ortasında paket yüksəltmə", expected: "Ümumi qaydada bloklanır", mode: "automated", bk: "BK-15" },
  { id: "T-38", section: "billing", event: "İkinci dövrə keçiddə paket yüksəltmə", expected: "Mümkündür; yeni qəbul satışı yoxdur", mode: "automated", bk: "BK-15" },
  { id: "T-39", section: "billing", event: "Birdəfəlik dərs satılıb keçirilir", expected: "Özü-özünə növbəti aylıq borc yaratmır", mode: "manual" },

  { id: "T-40", section: "analytics", event: "Bir müraciətə üç zəng", expected: "Bir unikal zəng edilmiş müraciət, üç fəaliyyət", mode: "manual", bk: "BK-19" },
  { id: "T-41", section: "analytics", event: "Telefon cavabsız, WhatsApp yazılıb", expected: "Əlaqə quruldu sayılmır", mode: "automated", bk: "BK-19" },
  { id: "T-42", section: "analytics", event: "Həmin WhatsApp-a real cavab gəlir", expected: "Bir ümumi əlaqə; telefon cavablanması artmır", mode: "automated", bk: "BK-19" },
  { id: "T-43", section: "analytics", event: "Eyni müraciət sonra telefonla da danışır", expected: "Ümumi əlaqədə təkrar sayılmır", mode: "manual", bk: "BK-19" },
  { id: "T-44", section: "analytics", event: "Sentyabr müraciəti 7 oktyabrda satış olur", expected: "Oktyabr satışı; sentyabr qrupu nəticəsi", mode: "automated", bk: "BK-20" },
  { id: "T-45", section: "analytics", event: "30 sentyabr vəziyyətinə hesabat açılır", expected: "Oktyabr hadisələri daxil edilmir", mode: "manual", bk: "BK-20" },
  { id: "T-46", section: "analytics", event: "Aylar üzrə 18 + 10 + 2 satış", expected: "Ümumi aylıq cəm 30", mode: "automated", bk: "BK-21" },
  { id: "T-47", section: "analytics", event: "Konversiya məxrəci sıfırdır", expected: "Yanlış faiz əvəzinə baza yoxdur", mode: "automated", bk: "BK-21" },
  { id: "T-48", section: "analytics", event: "Cari ay seçilib, mərhələ kartı açılır", expected: "Kart bütün dövrü göstərir", mode: "manual", bk: "BK-22" },
  { id: "T-49", section: "analytics", event: "Mərhələ sayına klik edilir", expected: "Eyni bütün-dövr siyahısı", mode: "manual", bk: "BK-23" },
  { id: "T-50", section: "analytics", event: "Kartdan 50-dən çox nəticə açılır", expected: "Tam cəm/paginasiya düzgün", mode: "manual" },
  { id: "T-51", section: "analytics", event: "Menecer başqasının icazəsiz tələbəsinə yazır", expected: "Serverdə rədd edilir", mode: "manual" },
  { id: "T-52", section: "analytics", event: "Menecer dəyişdirilir", expected: "Keçmiş actor və satış sahibi səssiz köçmür", mode: "manual" },
  { id: "T-53", section: "analytics", event: "Yaradılma tarixi və digər filtr seçilir", expected: "Başlıq, kart, siyahı/export eyni əhatə", mode: "manual" },
  { id: "T-54", section: "analytics", event: "Kart redaktəsindən sonra başqa ekran açılır", expected: "Köhnə cache ilə yanlış borc/satış qalmır", mode: "manual" },
];

export function acceptanceSummary() {
  const automated = acceptanceCases.filter((c) => c.mode === "automated");
  const manual = acceptanceCases.filter((c) => c.mode === "manual");
  return {
    total: acceptanceCases.length,
    automated: automated.length,
    manual: manual.length,
    automatedIds: automated.map((c) => c.id),
    manualIds: manual.map((c) => c.id),
  };
}
