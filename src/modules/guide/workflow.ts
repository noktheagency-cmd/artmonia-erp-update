import type { Route } from "next";
import type { PermissionCode } from "@/server/rbac/permissions";

export type GuideStageId = "followup" | "registration" | "placement" | "first-lesson" | "daily-control" | "lifecycle";
type GuideLink = { label: string; href: Route; permissions: readonly PermissionCode[] };
type GuideStage = {
  id: GuideStageId; title: string; shortTitle: string; caption: string; description: string; startWhen: string;
  steps: ReadonlyArray<{ title: string; description: string }>;
  decisions: ReadonlyArray<{ when: string; then: string }>;
  result: string; reminder: string; links: readonly GuideLink[];
};

export const guideStages: readonly GuideStage[] = [
  {
    id: "followup", title: "Follow-up prosesləri", shortTitle: "Follow-up", caption: "Müraciət, əlaqə və görüş",
    description: "Yeni müraciəti qəbul edin, əlaqə qurun və görüşün nəticəsini qeyd edin.",
    startWhen: "Yeni müraciət daxil olduqda və ya əvvəlki müraciətlə yenidən əlaqə saxlamaq lazım gəldikdə.",
    steps: [
      { title: "Müraciəti yaradın və ya mövcud profili açın", description: "Follow-up səhifəsində ad və telefonla axtarın. Müraciət artıq varsa həmin profildə davam edin; yoxdursa yeni müraciət yaradın." },
      { title: "İlkin məlumatları tamamlayın", description: "Ad, telefon, mənbə, maraqlandığı proqram, məsul əməkdaş və prioriteti yoxlayın. Əlaqədən əvvəl hansı proqram barədə danışacağınız aydın olmalıdır." },
      { title: "Əlaqənin faktiki nəticəsini yazın", description: "Müraciətdə “Əlaqə” bölməsini açın. Telefon və ya WhatsApp kanalını seçib danışıldı, cavab verilmədi və ya uyğun digər nəticəni saxlayın. Sadəcə mesaj göndərilməsini cavab alınması kimi qeyd etməyin." },
      { title: "Cavab yoxdursa növbəti əlaqəni planlayın", description: "Növbəti tarix və addımı seçin. Bugünkü planı “Bu gün”, sabahkını “Sabahın planları”, vaxtı keçmiş müraciəti “Gecikənlər” kartından izləyin." },
      { title: "Görüşü təyin edin", description: "Razılıq alındıqda “Görüş” bölməsində tarix və saatı saxlayın. Planın “Görüş tarixçəsi”ndə göründüyünü yoxlayın." },
      { title: "Görüşün nəticəsini təsdiqləyin", description: "Görüşdən sonra “Baş tutdu” və ya “Baş tutmadı” seçin. Baş tutmayıbsa növbəti tarix və saatı planlaşdırın. Sınaq dərsində iştirakı təsdiqləyərkən müəllim tələb olunursa onu seçin." },
    ],
    decisions: [
      { when: "Cavab alınmayıb", then: "Müraciəti follow-up-da saxlayın və növbəti əlaqə planı üzrə davam edin." },
      { when: "Görüş baş tutmayıb", then: "Nəticəni tarixçədə saxlayın, yeni görüş planlaşdırın və bu mərhələdə davam edin." },
      { when: "Qəbul razılaşdırılıb", then: "Proqram və qəbul şərtlərini dəqiqləşdirib tələbəyə keçid mərhələsinə keçin." },
      { when: "Müraciətçi imtina edib", then: "Uyğun itirilmə/imtina səbəbini qeyd edin; avtomatik tələbə yaratmayın." },
    ],
    result: "Müraciətin əlaqə və görüş tarixçəsi, məsul əməkdaşı və növbəti addımı aydındır.",
    reminder: "Görüşün planlaşdırılması onun baş tutması demək deyil. Faktiki nəticəni ayrıca qeyd edin.",
    links: [{ label: "Follow-up-a keç", href: "/crm", permissions: ["crm.lead.read"] }],
  },
  {
    id: "registration", title: "Qeydiyyat və tələbəyə keçid", shortTitle: "Tələbəyə keçid", caption: "Qəbul, paket və ilkin ödəniş",
    description: "Razılaşdırılmış müraciəti təkrar profil yaratmadan tələbə qeydiyyatına çevirin.",
    startWhen: "Müraciətçi proqramı və qəbul şərtlərini təsdiqlədikdə.",
    steps: [
      { title: "Müraciətdə qeydiyyatı başladın", description: "Follow-up-da uyğun müraciəti açıb qeydiyyat əməliyyatına keçin. Adı, telefonu və mövcud tələbə ilə uyğunluğu yoxlayın." },
      { title: "Təhsil paketini seçin", description: "Proqram, paket növü, qiymət, dərs sayı və varsa endirimi dəqiqləşdirin. Qeydiyyat və ödəniş tarixlərini faktiki məlumatla doldurun." },
      { title: "Görüş təsdiqi tələb olunursa nəticəni yoxlayın", description: "Açıq görüş üçün qeydiyyat pəncərəsi iştirak təsdiqi istəyirsə, bunu yalnız görüş həqiqətən baş tutduqda edin." },
      { title: "İlkin ödənişi və qəbul şərtlərini tamamlayın", description: "Ödənişli qəbulda minimum 20 AZN ilkin ödəniş qaydasını nəzərə alın. Müqavilə təsdiqini seçilmiş ödəniş/paket axınının tələbinə uyğun tamamlayın. Avans, hədiyyə və ödənişsiz paket seçimlərini adi aylıq ödənişlə qarışdırmayın." },
      { title: "Tələbə profilini yoxlayın", description: "Qeydiyyatı saxladıqdan sonra açılan tələbə profilində kodu, proqramı və ödənişi yoxlayın. Müraciətin həmin tələbə ilə əlaqələndiyini və follow-up planının bağlandığını təsdiqləyin." },
    ],
    decisions: [
      { when: "Mövcud tələbə tapılıb", then: "Yeni dublikat profil yaratmaq əvəzinə uyğun mövcud profil və qəbul axınını yoxlayın." },
      { when: "Birbaşa qəbul edilir", then: "Follow-up mərhələsini keçmədən Tələbələr səhifəsində “Tələbə yarat” ilə qəbul edin; paket və ödəniş yoxlamalarını yenə tamamlayın." },
    ],
    result: "Müraciət tələbə profilinə bağlanıb, qəbul paketi və ilkin ödəniş görünür. Yeni tələbə adətən “Slot gözləyir” vəziyyətindədir.",
    reminder: "Qeydiyyat və ödəniş təkbaşına aylıq dərslərin başladığını göstərmir. Sonra slot və ilk faktiki dərsi yoxlayın.",
    links: [
      { label: "Müraciəti aç", href: "/crm", permissions: ["crm.lead.read"] },
      { label: "Tələbələrə keç", href: "/students", permissions: ["student.read"] },
    ],
  },
  {
    id: "placement", title: "Proqram, müəllim və slot", shortTitle: "Slot və cədvəl", caption: "Dərsə hazırlıq",
    description: "Qəbul olunan tələbəyə uyğun dərs vaxtını, müəllimi və yeri təyin edin.",
    startWhen: "Tələbə profili və təhsil paketi yaradıldıqda.",
    steps: [
      { title: "Tələbənin paketini açın", description: "Proqramı, səviyyəni, dərs sayını və müəllim məlumatını tələbə profilində yoxlayın." },
      { title: "Uyğun slot seçin", description: "Slotlar səhifəsində proqram, müəllim, gün, saat, otaq və boş yeri müqayisə edin. Tələbənin razılaşdırdığı cədvələ uyğun seçim edin." },
      { title: "Təyinatı saxlayın", description: "Tələbəni seçilmiş slota yerləşdirin. Təyinatın qüvvəyə minmə tarixini və tələbənin dərs cədvəlində görünməsini yoxlayın." },
      { title: "İlk dərsi hazırlayın", description: "İlk faktiki aylıq dərsdən əvvəl ilk dövrün tələb olunan haqqının tam ödənildiyini yoxlayın. Əməkdaşın və tələbənin dərs vaxtından xəbərdar olduğuna əmin olun." },
    ],
    decisions: [
      { when: "Uyğun slot yoxdur", then: "Tələbəni slot gözləyən kimi izləyin, məsul şəxsi və növbəti əlaqə planını dəqiqləşdirin." },
      { when: "Müəllim və ya cədvəl dəyişir", then: "Dəyişikliyin tarixini və səbəbini qeyd edin; əvvəlki dərs və müəllim tarixçəsini yoxlayın." },
    ],
    result: "Tələbənin proqramı, müəllimi və dərs cədvəli bir-birinə uyğundur; ilk dərsin vaxtı məlumdur.",
    reminder: "Slota yerləşdirmə aktivləşmə deyil. Aktivlik ilk faktiki aylıq dərs iştirakı ilə yaranır.",
    links: [
      { label: "Slotlara keç", href: "/groups", permissions: ["group.read", "attendance.read"] },
      { label: "Tələbə profilini aç", href: "/students", permissions: ["student.read"] },
    ],
  },
  {
    id: "first-lesson", title: "İlk dərs və aktivləşmə", shortTitle: "İlk dərs", caption: "Faktiki iştirakın qeyd edilməsi",
    description: "Planı faktiki dərs nəticəsinə çevirin və tələbənin aktivləşməsini yoxlayın.",
    startWhen: "Tələbənin təyin olunmuş ilk aylıq dərsi keçirildikdə.",
    steps: [
      { title: "Düzgün dərsi açın", description: "Slotlar və davamiyyət jurnalında tələbənin müəllimini, dərs tarixini və saatını yoxlayın." },
      { title: "Faktiki davamiyyəti yazın", description: "İştirak, qaib və ya üzrlü vəziyyəti real dərs nəticəsinə uyğun qeyd edin. Görüş və sınaq nəticəsini aylıq dərs iştirakı ilə qarışdırmayın." },
      { title: "Aktivləşməni təsdiqləyin", description: "Aylıq paketdə ilk faktiki iştirak qeydi aktivləşməni başladır. Tələbə profilində statusu və faktiki ilk dərs tarixini yoxlayın." },
      { title: "Ödəniş planını yoxlayın", description: "Aktivləşmədən sonra profilin ödəniş dövrü və növbəti ödəniş günü ilə tanış olun. Başlanğıcda natamam ödəniş bloklaması çıxarsa, əvvəl həmin ödənişi tamamlayın." },
    ],
    decisions: [
      { when: "Tələbə ilk dərsə gəlməyib", then: "Qaibi düzgün qeyd edin və tələbə ilə yeni dərs/əlaqə planını razılaşdırın; iştirak təsdiqi verməyin." },
      { when: "İlk dövrün haqqı natamamdır", then: "Çıxan ödəniş tələbini tamamladıqdan sonra faktiki dərs qeydini yenidən yoxlayın." },
    ],
    result: "İlk dərsin faktiki nəticəsi saxlanıb. Uyğun aylıq paketdə tələbə aktivdir və ödəniş planı yoxlanıb.",
    reminder: "Əl ilə yazılmış plan tarixi və ya təkcə ödəniş faktı ilk faktiki iştirak qeydini əvəz etmir.",
    links: [
      { label: "Davamiyyətə keç", href: "/groups", permissions: ["attendance.read", "group.read"] },
      { label: "Tələbəni yoxla", href: "/students", permissions: ["student.read"] },
    ],
  },
  {
    id: "daily-control", title: "Ödəniş, davamiyyət və gündəlik nəzarət", shortTitle: "Gündəlik nəzarət", caption: "Ödənişlər və tələbənin davamı",
    description: "Aktiv tələbənin ödənişlərini, dərslərini və müdaxilə tələb edən halları birlikdə izləyin.",
    startWhen: "Tələbə dərslərə başladıqdan sonra, hər iş günü və hər ödəniş dövründə.",
    steps: [
      { title: "Bugünkü işləri nəzərdən keçirin", description: "Tələbələr səhifəsində ödəniş günü çatanları, gecikənləri və manual bildirişləri açın. Hər müraciətə və tələbəyə aid işi məsul əməkdaşla dəqiqləşdirin." },
      { title: "Ödənişi düzgün profilə yazın", description: "Tələbə profilində “Ödəniş qəbul et” ilə məbləği, üsulu, tarixi və uyğun ödəniş növünü seçin. Saxladıqdan sonra qəbzi, balansı və qalıq borcu yoxlayın." },
      { title: "Davamiyyəti tamamlayın", description: "Keçirilmiş dərslərin jurnalını yoxlayın. Qeyd edilməmiş dərsi avtomatik olaraq iştirak və ya faktiki nəticə kimi qəbul etməyin." },
      { title: "Riskli tələbə ilə əlaqə saxlayın", description: "Risk kartından tələbə profilinə keçin, son qayıblara baxın və səbəbi öyrənin. Ardıcıl 2 qayıb sarı, 3 və daha çox qayıb qırmızı riskdir." },
      { title: "Razılaşdırılmış növbəti addımı saxlayın", description: "Lazım olduqda tələbə profilində bildiriş yaradın. Müəllim, cədvəl və ya paket dəyişikliyində qüvvəyə minmə tarixini, səbəbi və maliyyə təsirini yoxlayın." },
    ],
    decisions: [
      { when: "Ödəniş qismən edilib", then: "Qalıq borcu və növbəti ödəniş gününü yoxlayın; eyni ödənişi yenidən daxil etməyin." },
      { when: "İkinci proqram əlavə olunur", then: "Mövcud proqramı əvəz etmək əvəzinə ayrıca proqram qeydiyyatını yoxlayın." },
      { when: "Paket yüksəldilir", then: "Aylıq paketdə aktivləşmədən sonrakı ilk dövr məhdudiyyətini nəzərə alın; yüksəltmə ikinci dövrdən etibarən mümkündür." },
    ],
    result: "Tələbənin davamiyyəti və ödənişi aktualdır; risk və gecikmələr üzrə məsul şəxs və növbəti iş müəyyən edilib.",
    reminder: "Tələbənin statusu ilə ödəniş vəziyyəti ayrıdır. Borcu faktura və ödəniş balansından yoxlayın.",
    links: [
      { label: "Tələbələrə keç", href: "/students", permissions: ["student.read"] },
      { label: "Maliyyəni aç", href: "/finance", permissions: ["billing.invoice.read", "billing.payment.read"] },
    ],
  },
  {
    id: "lifecycle", title: "Status dəyişikliyi və qayıdış", shortTitle: "Dəyişiklik və qayıdış", caption: "Dondurma, dayandırma, tamamlama",
    description: "Tələbənin davam, fasilə və ayrılma qərarını düzgün tarix və səbəblə rəsmiləşdirin.",
    startWhen: "Tələbə fasilə, dayandırma, proqramı bitirmə və ya yenidən başlama barədə qərar verdikdə.",
    steps: [
      { title: "Cari vəziyyəti yoxlayın", description: "Profilin statusunu, aktiv proqramını, slotunu, açıq borcunu və son iştirak tarixini birlikdə nəzərdən keçirin." },
      { title: "Uyğun statusu seçin", description: "Dondurma, dayandırma və tamamlama hallarını ayırın. Faktiki tarixi və səbəbi qeyd edin; borca və ya qayıba görə qərar vermədən statusu dəyişməyin." },
      { title: "Cədvəl və maliyyə nəticəsini yoxlayın", description: "Dondurmada yer saxlanır, aylıq haqq və ödəniş günü davam edir. Dayandırma isə yeri azad edir. Saxladıqdan sonra tələbənin cədvəlini, fakturalarını və qalıq borcunu yoxlayın." },
      { title: "Qayıdışı düzgün axınla başladın", description: "Dayandırılmış tələbə qayıdırsa mövcud profil üzrə qayıdış qəbulunu yoxlayın. Dondurmadan bərpanı və adi davam ödənişini yeni satış kimi yaratmayın. Uyğun slot və faktiki dərs mərhələlərini yenidən izləyin." },
    ],
    decisions: [
      { when: "Dondurma bitir", then: "Bərpa tarixini və mövcud slotu yoxlayıb dərslərin davamını təşkil edin." },
      { when: "Dayandırılmış tələbə qayıdır", then: "Mövcud tələbə profilindən qayıdış qəbuluna, sonra slot və faktiki ilk dərsə keçin." },
      { when: "Geri ödəniş tələb olunur", then: "İlkin ödənişə istinad, səbəb və səlahiyyətli təsdiqlə maliyyə düzəlişi aparın. Ödəniş tarixçəsini silməyin." },
    ],
    result: "Qərar və səbəb tarixçədədir; tələbənin yeri, ödənişi və sonrakı təhsil planı yeni vəziyyətə uyğundur.",
    reminder: "Status dəyişikliyi əvvəlki ödəniş və audit tarixçəsini silmir. Qayıdışda əvvəl mövcud tələbə profilini tapın.",
    links: [{ label: "Tələbə profilinə keç", href: "/students", permissions: ["student.read"] }],
  },
];

export const guideResources: ReadonlyArray<GuideLink & { description: string; steps: readonly string[] }> = [
  {
    label: "Maliyyə və günün yekunu", href: "/finance", permissions: ["billing.invoice.read", "billing.payment.read", "billing.expense.read"],
    description: "Ödənişləri, xərcləri və açıq borcları tutuşdurun.",
    steps: ["Gəlir və xərci uyğun tarix və kateqoriya ilə qeyd edin.", "Ödəniş və qəbzləri tələbə balansları ilə tutuşdurun.", "Geri qaytarma və düzəlişlərdə səbəbi və təsdiqi saxlayın."],
  },
  {
    label: "HR və əməkdaşlar", href: "/hr", permissions: ["hr.employee.read", "teacher.read", "hr.corporate.read", "hr.bonus.read"],
    description: "Əməkdaş, davamiyyət və əmək haqqı işlərini tamamlayın.",
    steps: ["Əməkdaşın əlaqə, vəzifə və iş statusunu aktual saxlayın.", "İcazələri iş öhdəliyinə uyğun idarə edin.", "Əmək haqqı və bonuslarda dövrü, faktiki davamiyyəti və tətbiq edilən qaydaları yoxlayın."],
  },
  {
    label: "Tapşırıqlar və növbəti iş günü", href: "/tasks", permissions: ["task.read"],
    description: "Məsul şəxsləri, son tarixləri və görüləcək işləri yoxlayın.",
    steps: ["Tapşırığa məsul şəxs və real son tarix təyin edin.", "İcra vəziyyətini faktiki nəticəyə uyğun yeniləyin.", "Gecikmiş tapşırıqları və sabaha qalan işləri nəzərdən keçirin."],
  },
];
