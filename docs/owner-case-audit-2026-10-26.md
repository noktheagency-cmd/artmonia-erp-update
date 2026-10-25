# Owner halları 18–28 — 26.10.2026

Əvvəlki 1–11 halın nəticəsi [25 oktyabr auditində](owner-case-audit-2026-10-25.md) və `5db3c73` commitindədir. Bu sənəd həmin işin davamıdır. Göndərilən yeni siyahı 18–28 nömrəli **11 haldan** ibarətdir; 12–17 haqqında bu müraciətdə məlumat verilməyib.

## Mühit və təsdiqlər

Owner bu hallar üçün də `https://artmonia-erp.vercel.app/` və `xgxlwbqaojbptrgosxtj` bazasını təsdiqlədi. Əsas `Artmoni-erp-final` bazasına yazılmadı. Bağlantı məlumatları və şəxsi surətlər Git-ə daxil edilmir.

Əlavə təsdiqlər:

- İlahədən 9 oktyabrda yalnız **bir dəfə 75 AZN** alınıb; ikinci qəbz dublikatdır.
- Aydanın avqust üzrə 75 AZN qalığı səhv tarixi qalıqdır və ləğv edilməlidir.
- Nərminin 27 sentyabr 79 AZN + 3 oktyabr 70 AZN ödənişi, əvəz dərslər nəzərə alınmaqla, **15 noyabra qədər tam ödənişdir**. Sonrakı dəqiqləşdirmə: 79 AZN / 4 dərs paketi 149 AZN / 8 dərsə yüksəldilib; 70 AZN ayrıca aylıq ödəniş deyil, paket fərqidir.
- Səlahiyyətli müraciət sahibi Vaqifdir. Auditdə icraçı `Codex maintenance / explicit owner request`, müraciət sahibi ayrıca `requestedBy` kimi göstərilib. Texniki audit başqa insanın sessiyası kimi təqdim edilmir.

## Bazada tətbiq olunan nəticələr

| Hal | Tələbə / kod | Düzəliş | Tətbiqdən sonra növbəti tarix |
| --- | --- | --- | --- |
| 18 | Aydan Şükürova / ART-2332 | Cari başlanğıc 09.10; mövcud 75 AZN oktyabr qəbzi köhnə PAUSED paketdən cari paketə ayrıldı; köhnə oktyabr fakturası və təsdiqlənmiş səhv avqust borcu VOID edildi | 09.11.2026 |
| 19 | İlahə Abdullayeva / ART-3392 | Cari başlanğıc 09.10; 12 oktyabrda daxil edilmiş dublikat 75 AZN çıxarıldı; 9 oktyabrda daxil edilmiş qəbz cari paketə ayrıldı; köhnə oktyabr fakturası VOID edildi | 09.11.2026 |
| 20 | Fatimə Mahmudova / ART-3292 | Cari qayıdış 05.09; sentyabr və oktyabr fakturalarının günü 5 oldu. Oktyabrın ödənişi artıq qeydə alındığı üçün növbəti ay göstərilir | 05.11.2026 |
| 21 | İbrahim Səfərzadə / ART-2534 | Oktyabrdan ayın 29-u üçün ayrıca ödəniş qaydası; ilk dərs dəyişmədi | 29.10.2026 |
| 22 | Zəhra Bağırlı / ART-3072 | Oktyabrdan ayın 1-i üçün ayrıca ödəniş qaydası; ilkin qeydiyyat və ilk dərs dəyişmədi | 01.10.2026 |
| 23 | Ebru İlyas / ART-1298 | Oktyabrdan ayın 29-u; mövcud oktyabr fakturası 15-dən 29-a keçirildi | 29.10.2026 |
| 24 | Çimnaz İbrahimova / ART-1140 | Owner-in təsdiqlədiyi faktiki ilk dərs və billing başlanğıcı 07.09 oldu; ödənmiş ayların məbləğləri saxlanıldı | 07.11.2026 |
| 25 | Ayan Abdullazadə / ART-1150 | Cari billing başlanğıcı paketdəki 09.09 qayıdışı ilə uyğunlaşdırıldı; tarixi ilk dərs 28.01 olaraq saxlanıldı | 09.10.2026 |
| 26 | Nərmin Muradova / ART-1174 | Cari paket 149 AZN / 8 dərsdir. 79 AZN ilkin ödəniş və 70 AZN yüksəltmə fərqi birlikdə 149 AZN-dir. Yalnız oktyabr üçün 70 AZN xalis hesablanan məbləğ əvvəlki fakturada ödənmiş 79 AZN-i ikinci dəfə tələb etmir; ayrıca 70 AZN aylıq paket deyil. Noyabrdan 149 AZN, gün 15 | 15.11.2026 |
| 28 | Natella Miratayeva / ART-1852 | Mövcud ayın 10-u qaydası faktura olmayan gələcək ayın hesablamasına da tətbiq olundu; anchor və qeydiyyat saxlanıldı | 10.11.2026 |

Yeni bağlantı ilə təkrar oxumada Aydan, İlahə, Nərmin və Natellanın cari faktura borcu **0 AZN** idi. Natellanın borcu düzəlişdən əvvəl də 0 idi; onun borclular siyahısında görünməsi bu bazanın cari faktura məlumatı ilə təkrarlanmadı. Növbəti tarixdəki 16/10 uyğunsuzluğu isə təkrarlandı və düzəldildi.

Zəhra və Ayanda oktyabr fakturası yox idi. Bu əməliyyat onlara yeni faktura və ya pul qəbzi yaratmadı; cədvəldəki keçmiş oktyabr tarixləri növbəti hesablanmış tarixdir. Sonrakı normal billing işi legitim yeni faktura yarada bilər. Ebru və İbrahimin açıq oktyabr fakturaları saxlanılıb, yalnız son tarix 29 oktyabra keçirilib.

Çimnazın jurnalında 4 sentyabr iştirak qeydi də var; owner faktiki ilk dərsi 7 sentyabr kimi təsdiqlədi. Faktiki başlanğıc həmin göstərişlə düzəldildi, ziddiyyətli tarixi davamiyyət qeydi silinmədi. Fatimənin paketində 6 sentyabr yazılmışdı; owner-in bildirdiyi 5 sentyabr əsas götürüldü.

İlahənin dublikatına bağlı tək DRAFT müəllim maaşı sətri həqiqi qəbzə bağlandı. Sətirin 18,75 AZN uyğun gəliri, 6,56 AZN maaşı və müəllim üzrə toplam məbləğlər dəyişmədi. Təsdiqlənmiş maaşı dəyişmək üçün script ayrıca dayanır.

### 26-cı halın paket yüksəltməsi üzrə təkrar yoxlanması

Owner-in əlavə izahı 3 oktyabr qəbzinin ilkin qeydi və həmin günün `student.billing_terms.change` auditi ilə uyğun gəlir: paket 79 AZN / 4 dərsdən 149 AZN / 8 dərsə keçib, əlavə 70 AZN qalıq fərqi tamamlayıb. Əvvəlki düzəlişin 70 AZN-i yalnız "tarif istisnası" kimi təsviri natamam idi. Bu istisna tarixi fakturalarda xalis əlavə hesablanan məbləği saxlayır; cari paketin qiyməti 149 AZN-dir.

`scripts/clarify-owner-case-26-upgrade.mjs` yalnız həmin `ONLY_MONTH` qeydin səbəbini bu izahla dəqiqləşdirir və ayrıca audit yaradır. Qəbzlər, onların faktura bölgüsü və ödəniş ayları, faktura məbləğləri, paket/dərs sayı, ödəniş tarixləri və əvvəlki audit tarixçəsi dəyişdirilmir. Nərminin qəbzlərinə bağlı hazır müəllim maaşı sətri tapılmadı; mövcud ödəniş ayları və bölgülər saxlandığından sonrakı hesablama üçün giriş məlumatları da dəyişmir.

Əvəz dərslərlə bağlı əvvəlki təsdiq ayrıca qüvvədədir: 15 noyabr tarixi təkcə 79 + 70 cəmindən çıxarılmır. Təkrar baza yoxlamasında iki qəbzin cəmi 149 AZN, borc 0 AZN, növbəti tarix 15.11.2026 və noyabr tarifi 149 AZN təsdiqləndi.

İzah həmin Vercel bazasında tətbiq edildi. Əvvəl rollback sınağı və ilkin fingerprint-in saxlanması yoxlandı; tətbiqdən sonra maliyyə qeydlərinin tam dəyişməzliyi və təkrar icranın no-op olması təsdiqləndi. Ayrıca bağlantı ilə yeni səbəb, audit, paket, borc və tarix yenidən oxundu. Yeni script üçün ESLint, mövcud 6 maintenance testi və `git diff --check` keçdi. Bu təkrar yoxlama tətbiqin UI kodunu dəyişməyib.

## Kod və baza funksiyası

- `20261026120000_next_payment_deadline_rule` Prisma miqrasiyası bu Vercel bazasında tətbiq edildi və checksum ilə migration tarixçəsinə yazıldı. `next_unfrozen_billing_date` artıq `student_payment_due_date` qaydasından istifadə edir. Dondurma əhatəsi əvvəlki kimi dərs dövrünə əsaslanır.
- 26-cı hal üçün ay dəyişdirildikdə köhnə önizləmə və təsdiq sıfırlanır. Xüsusi ay seçicisinin dəyişməsi adi `fieldset.onChange` hadisəsinə etibar etmir. Gələcək ay seçiminin cari aya təsiri barədə izah əlavə edildi.
- 27-ci hal üçün davamiyyət pəncərəsinin düymə sətri ümumi mobil `sticky !important` qaydasından çıxarıldı; tələbə siyahısından sonra normal axında yerləşir. Mobil flex pəncərədə formun sıxılması da dayandırıldı ki, son tələbə sətirləri düymələrin üzərinə daşmasın.

Son iki UI dəyişiklik **yerli koddadır; bu əməliyyat Vercel tətbiq deployu etməyib**. Baza düzəlişi və UI deployu ayrı statuslardır.

## İcra və bərpa

`scripts/reconcile-owner-cases-18-28.mjs` yalnız müəyyən edilmiş bazanı və on tələbə kodunu qəbul edir. Varsayılan rejim rollback-dir. Yazmadan əvvəl tələbə, faktura, qəbz və əlaqəli maaş sətirləri kilidlənir; snapshot fingerprint dəyişibsə əməliyyat dayanır. Bütün bərpa məlumatları transaction daxilində auditə yazılır. Təkrar icra yeni qəbz, qayda və ya düzəliş yaratmır.

Gitignored `tmp/owner-cases-18-28/` qovluğunda ilkin baxış, nəzərdən keçirilmiş snapshot, rollback nəticəsi, tətbiq nəticəsi və son snapshot saxlanıldı. Saxlanılan qəbzlərin tam dəyişməzliyi, faktura/bölgü balansı, maaş məbləğləri və status/dondurma tarixçəsinin qorunması yoxlanıldı.

## Yoxlamalar

- Canlı məlumatla tam rollback sınağı, rollback-dən sonra fingerprint eyniliyi, tətbiqdən sonra ayrıca bağlantı ilə oxuma və idempotent təkrar icra keçdi.
- `scripts/verify-next-payment-deadlines.mjs`: köhnə funksiyanın xətası sintetik müvəqqəti cədvəllərdə təkrarlandı; düzəliş 20 sərhəd və ssenari yoxlamasından keçdi. Fevral, uzun/qısa ay, gələcək qayda, yalnız-ay istisnası, yeni qayıdış və dondurma əhatə olunur. ERP qeydlərinə test məlumatı yazılmır.
- `npm test`: 563 keçdi, 0 uğursuz, 22 konfiqurasiyadan asılı inteqrasiya testi buraxıldı.
- Hər iki owner maintenance test faylı: 6 keçdi. Səhv mühit, çatışmayan təsdiq, köhnəlmiş snapshot və təkrar icra yoxlandı.
- `npx next typegen` keçdi. Yerli köhnə Prisma çıxışı `npm run prisma:generate` ilə yeniləndi.
- Prisma yeniləndikdən sonra `npm run typecheck`, dəyişən TSX/JS fayllarının ESLint yoxlaması və `git diff --check` keçdi.
- Ümumi lintdə əvvəlcədən mövcud 8 xəta və 28 xəbərdarlıq var; aidiyyəti olmayan CRM/tələbə ekranları bu işdə dəyişdirilmədi.
- Brauzer plugin-i mövcud olmadığından Playwright və yerli Chrome istifadə edildi. Real komponent funksiyaları və layout-un bütün CSS faylları sintetik test səhifəsində render edildi; server action-ları sintetik idi. Bu, autentifikasiya olunmuş Vercel E2E testi deyil.
- Davamiyyət 1440×900, 390×844, 375×667 və 844×390 ölçülərində yoxlandı: 12 sintetik tələbənin hamısını gəldi qeyd etmək, son tələbəyə qeyd yazmaq və saxlamaq keçdi. Mobil görünüşdə son sətrin alt sərhədi düymə sətrinin yuxarı sərhədindən əvvəl qalır; üfüqi daşma yoxdur.
- Ödəniş günü pəncərəsində oktyabr önizləməsindən noyabra keçmək köhnə təsdiqi sıfırladı; ikinci önizləmədən sonra noyabr saxlanıldı. Konsolda xəta/xəbərdarlıq olmadı. Səhifə başlığı və məzmunu, ekran görüntüləri və qarşılıqlı əməliyyat nəticələri yoxlandı.
