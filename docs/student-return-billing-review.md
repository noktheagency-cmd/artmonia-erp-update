# Qayıdan köhnə tələbələrin billing yoxlaması — 25.10.2026

> **Son status:** bu ilkin araşdırmadakı plan sonrakı owner təsdiqləri ilə Vercel-in `xgxlwbqaojbptrgosxtj` bazasında tətbiq edilib. Matica üzrə əvvəlki 27 sentyabr məlumatı sonradan düzəldilib: faktiki qayıdış **4 oktyabr**, faktiki ödəniş **bir dəfə 79 AZN** olub. Heydər üçün 4 oktyabrda nağd 100 AZN ayrıca təsdiqlənib və qeydə alınıb. Dörd profilin cari borcu 0 AZN-dir. Son nəticə və qəbul addımları: [owner-case-audit-2026-10-25.md](./owner-case-audit-2026-10-25.md). Aşağıdakı rəqəmlər ilkin araşdırmanın arxiv qeydidir.

## Tətbiqdə düzəldilən səbəb

`ensureStudentMonthlyInvoicesForPeriod` həm `ACTIVE`, həm də `PAUSED` paketlər üçün yeni faktura yaradırdı. Daha ucuz/yeni paketlə qayıdan tələbədə köhnə paket də eyni aya hesablanır, ödəniş əvvəl yaradılmış köhnə fakturaya ayrılırdı. Yeni aylıq faktura yalnız həmin dövrdə başlamış aktiv paketə yaradılır. Aylıq ödənişin invoice seçimi tələbə və maliyyə səhifələrində, həmçinin ödəniş redaktəsində eyniləşdirilib.

Cari aktiv paket seçilmiş ayda hələ başlamayıbsa, onun üçün faktura açılmır. Həmin ayı əhatə edən aktiv paket yoxdursa əvvəlki mövcud borcun ödənilməsi saxlanır; mövcud tarixi fakturalar avtomatik silinmir. STOPPED/billingPaused hesabı üçün ödəniş daxil etmək yeni aylıq borc yaratmır. Tarix üzrə billable yoxlaması hər paket üçün edilir; paket dondurmadan sonra ayın ortasında başlayırsa onun başlanğıcı nəzərə alınır. BK-10 üzrə yer saxlayan cari FROZEN rejimi aylıq billing-i davam etdirir.

İlk faktiki aylıq iştirakın qayıdış dövrünü başlatması və `original_first_lesson_at` tarixini saxlaması mövcud activation yolunda testlə təsdiqlənir. Əvvəldən ACTIVE kimi gətirilmiş köhnə qeydlər həmin hadisəni təkrar yaratmır. Tarif dəyişikliyi ayrıca pul daxilolması və ya qayıdış faktı sayılmır.

## Canlı bazada oxunan nəticə

### ART-2853 — `c745312b-2f85-4407-820d-8888b52e39f6`

- Cari paket: 27.09.2026-dan 79 AZN / 4 dərs; əvvəlki 150 AZN / 8 dərs paketi PAUSED-dur.
- Sentyabr üçün köhnə paketə 150 AZN, yeni paketə 79 AZN faktura açılıb. 79 AZN ödəniş köhnə fakturaya ayrılıb; nəticədə 71 + 79 = 150 AZN səhv cari borc görünür.
- Oktyabr üzrə yeni paketin 79 AZN fakturası ödənib, amma köhnə paketə əlavə 150 AZN gələcək faktura da var. Ümumi açıq balans 300 AZN-dir; 25 oktyabrda bunun 150 AZN-i cari borcdur.
- **Hazırlanmış düzəliş:** `5e07fde4-2b8d-47aa-9037-683080781123` ödənişinin 79 AZN bölgüsü köhnə `365a0da8-43a4-48cb-9bad-14b234d8f7ae` fakturadan cari `bd3c522b-71e1-4c44-b0b0-97d119a3161d` fakturaya keçirilsin. Köhnə sentyabr və oktyabr (`a9a83e39-f369-4191-81ff-55161ff314bf`) təkrar fakturaları VOID edilsin. Ödəniş məbləğləri, tarixləri, iyul tarixçəsi saxlanılsın.
- Bu bölgü təsdiqlənərsə sentyabr və oktyabr 79+79 AZN ilə ödənmiş olur; sonrakı ödəniş 27.11.2026-dır. Yalnız sentyabr dövrünün ödənməsi nəzərdə tutulubsa iki ayrı 79 AZN qeydi ayrıca yoxlanmalıdır; ikinci ödəniş təxminlə silinmir.

### ART-1392 — `2c579f8d-f399-4d01-82f9-af749ececc8c`

- Cari paket 04.10.2026-da başlayıb, amma billing anchor 11.08.2026 olaraq qalıb.
- 04.10.2026 tarixli 149 AZN ödəniş köhnə PAUSED paketin oktyabr fakturasına ayrılıb; yeni paketin eyni aya 149 AZN fakturası açıqdır.
- **Hazırlanmış düzəliş:** `d77d4963-d0e1-446e-b091-ec576e557f6b` ödənişinin 149 AZN bölgüsü köhnə `9c3bec6a-4860-4f6b-9a8b-d819cd314588` fakturadan cari `0a1f93b0-76f8-4bb4-954c-98fb3699600a` fakturaya keçirilsin; köhnə oktyabr fakturası VOID edilsin. Cari dövrün anchor tarixi 04.10.2026 olsun, orijinal ilk dərs 11.08.2026 saxlanılsın.
- Sentyabrın 149 AZN fakturası (`23bcb17d-5158-483b-b410-42bce766f511`) ayrıca məsələdir: due date 11 sentyabr, FROZEN hadisəsi 15 sentyabr, STOPPED 29 sentyabr tarixlidir. Avqust ödənişi avqusta ayrılıb. Bu fakturanı da ləğv etmək, texniki dublikat düzəlişindən əlavə, sahibin sentyabrın həmin dövrünün ödənişsiz olması barədə təsdiqlədiyi tarixi istisnanın auditlə rəsmiləşdirilməsidir.
- Sentyabr istisnası təsdiqlənərsə cari borc 0 AZN, növbəti ödəniş 04.11.2026 olar. Yalnız dublikat düzəlişində sentyabrın 149 AZN borcu qalır.

### ART-2592 — `3d2e9363-2e4d-48f9-83e5-f1e68a6a114c`

- Bazada 100 AZN ödəniş 21.07.2026 tarixli, iyul ayına aiddir; fakturanın due date-i 28 iyuldur. Digər ödəniş 01.09.2026-da daxil edilmiş 60 AZN-dir və avqust ayına ayrılıb.
- 04.10.2026-da tarif 60 AZN / 4 dərsdən 100 AZN / 8 dərsə dəyişib. Bu hadisə pul daxilolması deyil. Ayrı oktyabr ödənişi və oktyabrda yeni aktivləşmə hadisəsi bazada yoxdur. İstifadəçi də görünən 100 AZN sətrinin iyul ayı olduğunu dəqiqləşdirdi.
- Cari 60 AZN borc sentyabrın 28-nə açılmış fakturadır (`7a7c509a-6b9f-4895-a35c-9d9385723cf7`).
- Cari dövrün ilk dərsinin 04.10.2026 olması ayrıca tarixi düzəliş kimi təsdiqlənə bilər. Lakin növbəti ödənişin 04.11.2026 və borcun 0 olması üçün oktyabr üzrə faktiki 100 AZN ödəniş və ya təsdiqlənmiş ödənişsiz istisna lazımdır. İyul ödənişi təkrar istifadə olunmur, ailə üzvlərinin ödənişləri qarışdırılmır.

## Tətbiq vəziyyəti və qəbul

İlkin plan bu araşdırma hazırlananda tətbiq edilməmişdi. Sonrakı tətbiqdə qeydlər yenidən oxundu, bərpa surəti saxlandı, fingerprint və sətir kilidləri ilə transaction/audit tətbiq edildi. Owner-in ayrıca təsdiqlədiyi Heydər qəbzi və Matica dublikatının çıxarılması pul cəminin auditli dəyişiklikləridir. Qalan pul qeydləri və əvvəlki audit tarixçəsi saxlanıb; səhv borclar UI-da gizlədilməyib.

Qəbul: yeni deploydan sonra yeni aylıq ödənişdə yalnız cari paket hesablanır; keçmiş ay seçiləndə gələcək paket üçün borc yaranmır; status/tarif redaktəsi özlüyündə ödəniş yaratmır. Mövcud üç profilin düzəlişi yuxarıdakı təsdiqlənmiş əməliyyatlara görə ayrıca yoxlanılır.
