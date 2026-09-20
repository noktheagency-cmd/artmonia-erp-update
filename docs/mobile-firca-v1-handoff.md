# Artmonia — dinamik Journey və Fırça V1

## Mobil developerə göndəriləcək mesaj

Salam. ERP tərəfində yeni Journey/Fırça implementasiyası hazırlanıb. Mobil uyğunlaşdırmanı aşağıdakı müqavilə əsasında edin; canlı keçid və son E2E ayrıca təsdiqlənməlidir.

- H/HB/B/2B bölmələri çıxarılıb. Proqramda yaradılan hər dərs bir addımdır; sabit 12/24 addım yoxdur. Addımları `journey.topics` sırası ilə göstərin.
- `GET /api/mobile/v1/me/journey` cavabında `contractVersion: 2`, `journey` və `firca` gəlir. Materiallar `id`, `subject`, `objective`, `homework`, `imageUrl` daşıyır; `track` yoxdur. Mövcud addım `identifier`-ləri dəyişmir.
- `status` yenə `completed | current | locked`-dur. Əlavə `access: completed | current | preview | locked` və `canViewMaterials` sahələri var. Cari addımdan sonrakı 3 addımın materialı önbaxış üçün açıqdır; daha uzaq addımların `materials` siyahısı boşdur. Önizləmə addımı tamamlamaq demək deyil.
- Addım yalnız ERP-də PRESENT davamiyyətlə irəliləyir. Tapşırıq və rəy yolu irəli aparmır. Mobil manual “tamamla” əməliyyatı yoxdur.
- Köhnə XP/level/streak/badge/reward blokunu yeni `firca` ilə əvəz edin. Home və Profile GET cavablarında da `firca` var. Fırça ayrıca `/me/firca`, tarixçə `/me/firca/history`, aylıq yarış `/me/leaderboard` ilə alınır.
- Ev tapşırığı üçün köhnə `PUT .../completion` artıq `410 HOMEWORK_SUBMISSION_REQUIRED` qaytarır. Yeni `GET/POST /me/homeworks/{homeworkId}/submission` istifadə edin. POST `multipart/form-data`: `file` + UUID `requestKey`. JPEG/PNG/WebP/PDF, maksimum 8 MiB. Mobil çəkilən HEIC şəkli göndərməzdən əvvəl JPEG-ə çevirməlidir.
- Təkrar şəbəkə cəhdində eyni fayl üçün eyni `requestKey` saxlanılır; başqa fayla yeni açar verilir. Eyni açarla dəyişmiş fayl `409 IDEMPOTENCY_CONFLICT`-dir. Gündə maksimum 30 yeni göndəriş var.
- Tapşırıq statusları: `submitted` — müəllim baxır, `accepted` — qəbul edilib, `rejected` — düzəlişə qaytarılıb. `feedback` müəllimin qeydidir. Qəbul edilmiş tapşırıq müəllim tərəfindən geri qaytarılmadan yenidən göndərilmir. Upload özü xal vermir; qəbul +20 verir.
- Lessons/Detail-də homework daxilində `lessonId`, `submissionStatus`, `feedback` var. Köhnə `homework.status=completed` yalnız müəllim qəbul etdikdə gəlir. Home-dakı homework tipli `nextAction` da `lessonId` daşıyır. Tapşırıq bildirişləri `homework.assigned/submitted/accepted/rejected` event-ləridir.
- İcma rəylərinin serverdən ERP-yə çatdırılması üçün ayrıca `/api/mobile/v1/firca/community-events` var. Tam qaydalar aşağıdadır. Bu credential adi tələbə gateway credential-ı ilə eyni olmamalıdır.
- Normal `Supabase JWT → Edge Function → ERP` axını dəyişmir. Mobil `Student.id`, xal məbləği və müəllim qərarı göndərmir. Bütün secret-lər yalnız serverdə qalır.

Fayllar: [əsas portal OpenAPI v2](mobile-student-portal-openapi.yaml), [Fırça/submit/community OpenAPI](mobile-firca-v1-openapi.yaml). İki YAML birlikdə saxlanmalıdır, lokal `$ref` bağlantıları var.

## ERP-də idarəetmə

**Tələbələr → Proqramlar → proqramı dəyiş → Dərslər və addımlar**: dərs əlavə etmək, sırasını dəyişmək, başlıq, material, məqsəd, ev tapşırığı və şəkil daxil etmək. Mövcud təhlükəsizlik limiti proqram üzrə 120 dərs, dərs üzrə 20 materialdır; yolun uzunluğu limit deyil, faktiki dərs sayıdır. Aylıq paketdəki dərs limiti ayrıca qalır.

**Profil → Fırça · Tapşırıqlar və aylıq yarış** (`/firca`): tapşırıqların yoxlanması, aylıq top 10, rəy moderasiyası. `attendance.manage` tələb olunur. `ASSIGNED` müəllim yalnız öz slotunun tapşırıqlarını və öz aktiv tələbələrinin rəylərini idarə edir; `ALL` ümumi girişi açır. Sənəd açılması da serverdə eyni scope ilə yoxlanır.

`settings.manage` olan istifadəçi başlanğıc, aktivlik, minimum rəy uzunluğu və test istisnalarını idarə edir, seçilmiş tələbənin xal tarixçəsini görür. Mövcud ERP `isTestData` flag-i ayrıca da qüvvədədir; həmin flag aktivdirsə Fırça istisnasını söndürmək tələbəni yarışa daxil etmir.

## Biznes qaydaları

| Mənbə | Fırça | Bir dəfəlik açar |
| --- | ---: | --- |
| PRESENT, ləğv edilməmiş dərs | 20 | tələbə + dərs sessiyası |
| Müəllimin qəbul etdiyi foto/fayl tapşırığı | 20 | tələbə + dərs sessiyası |
| Başqa tələbənin işinə uyğun rəy | 5 | tələbə + icma postu |

Rəy limiti Bakı vaxtı ilə bazar ertəsi 00:00-dan başlayan həftədə 4 ilk mükafatlandırmadır (20 Fırça). Rəyi silmək yeni limit yeri yaratmır. Geri qaytarılan eyni rəy əvvəlki məbləği bərpa edə bilər, təkrar mükafat yaratmır. Öz işinə rəy, reply, təsdiqlənməmiş/silinmiş/moderasiya olunmuş rəy, yalnız emoji və minimum uzunluqdan qısa mətn xal qazandırmır. Minimum 20 boşluqsuz simvoldur, ERP-də dəyişdirilə bilər. Mətn NFKC + Azərbaycan kiçik hərfləri + boşluqların çıxarılması ilə müqayisə edilir. Artıq mükafatlandırılmış aktiv rəyin eyni mətni ikinci dəfə xal qazandırmır.

Rəylərdə ilk uğurla xal qazandıran comment həmin tələbə/post açarını tutur. Səbəbi həftəlik limit və ya uyğunsuz mətn olan 0-xallı cəhd başqa düzgün rəy üçün açarı tutmur. Qazanılmış açar isə rəy sonradan silinsə belə saxlanılır.

Müəllim tapşırığı geri qaytaranda -20, PRESENT ləğv ediləndə -20, mükafatlandırılmış rəy silinəndə -5 ayrıca ledger qeydi yaranır. Dərs ləğv ediləndə həm davamiyyət, həm qəbul edilmiş tapşırıq xalı geri alınır; dərs bərpa ediləndə aktiv qaydalara uyğun yenidən bərpa edilir. Ledger update/delete ilə dəyişdirilmir. Maaş və paket hesablamaları bu modul tərəfindən dəyişdirilmir.

Ay sərhədi `Asia/Baku`, ayın 1-i 00:00-dır. Sıralama akademiya üzrə xalis aylıq Fırçadır, bərabər xal bərabər rank alır (1, 1, 3). İlk 10 sıra və tələbənin öz sırası gəlir; istisna/inaktiv hesab üçün `me: null`. Başqa ayda geri alınan xal geri-alma ayına mənfi yazılır; aylıq nəticə mənfi ola bilər, lifetime mənfi olmur. Mobil rəqəmi sıfıra sıxışdırmamalıdır. Aylıq tarixçə silinmir; seçim verilən ay üzrə hesablanır, iştirakçı uyğunluğu cari ERP statusuna əsaslanır.

Yeni mükafatlandırma ilkin olaraq **bağlıdır**, `startsAt: null`. Köhnə XP çevrilmir, test məlumatı silinmir, davamiyyət backfill-i yoxdur. Aktivləşdirmə üçün gələcək/indiki başlanğıc seçilməlidir; tarix ilk saxlamadan sonra sabitdir. Davamiyyətdə dərs tarixi başlanğıcın Bakı tarixindən əvvəl ola bilməz; tapşırıq göndərişi və rəyin yaradılma vaxtı isə başlanğıcdan sonra olmalıdır. Başlanğıc anı çatmayıbsa xal verilmir. Söndürmək mövcud düzgün xalı silmir, yeni xal yazılmasını dayandırır; etibarsız olmuş mənbələr yenə geri alınır.

## İcma dispatcher-in təhlükəsizlik müqaviləsi

`Authorization: Bearer <FIRCA_COMMUNITY_SERVER_TOKEN>` yalnız etibarlı server worker/Edge Function-da saxlanmalıdır. Adi mobil gateway bu credential-ı istifadə etməməlidir. İstifadəçi sorğusundakı `approved`, müəllif və post sahibi məlumatını birbaşa ötürməyin: onları icma bazasının commit edilmiş sətrindən götürün. Post müəllifi həqiqi digər tələbə olmalıdır; ERP həmin müəllifin aktiv tələbə mapping-ini də yoxlayır. Event payload-da Student.id yoxdur, müəllifin Supabase auth UUID-si ERP-də mapping olunur.

Create/edit/delete üçün bütün snapshot və monoton `revision` göndərin. `commentId`, `postId`, müəllif, post sahibi, `parentId`, ilkin `createdAt` dəyişməzdir. Soft-delete/tombstone saxlayın ki, gecikmiş create hadisəsi silinmiş rəyi bərpa etməsin. Etibarlı outbox/retry tələb olunur. Eyni revision və fərqli payload 409; eyni payload 200 duplicate; köhnə revision 200 stale. Request body maksimum 16,000 baytdır.

## Media və keçid

Tapşırıq faylı mövcud **private** `erp-private-files` bucket-indədir, 300 saniyəlik signed URL qaytarılır. ERP müəllim linki ayrıca scope yoxlayır və 60 saniyəlik download URL yaradır. Mobil URL-ni daimi kimi saxlamamalıdır. Proqram şəkilləri əvvəlki `erp-public-assets` bucket-ində qalır: uzaq materialın API-dən gizlənməsi DRM və artıq məlum public URL-ni ləğv etmək deyil.

Migration sahibi Prisma-dır, Supabase SQL-ləri eyni migration-un güzgüsüdür: hər ikisini ayrıca tətbiq etməyin. Tələb olunanlar:

1. `20260920121102_firca_v1_dynamic_journey`.
2. `20260920124825_firca_test_eligibility`.
3. Prisma generate və ERP build/deploy; target və migration tarixçəsi təsdiqlənməlidir.
4. İcma üçün yeni server secret-i təhlükəsiz kanalla qurmaq; source-of-truth outbox-ı mobil/backend developer qurur.
5. Yeni mobil schema, upload və gateway keçidi ilə koordinasiya; əvvəlki completion endpoint-i ilə uyğunsuz dəyişiklikdir.
6. Başlanğıc/test istisnaları təsdiqlənəndən sonra Fırça aktivləşdirməsi.

Lokal yoxlama: `node --import tsx scripts/verify-firca-local.mjs` yalnız in-memory PGlite və sintetik məlumat istifadə edir; xarici DB-yə bağlanmır. Bu yoxlama real cihaz/Supabase upload testinin və çox bağlantılı yük testinin əvəzi deyil.

2026-09-20 lokal nəticələr: 46 migration/domain/contract yoxlaması PASS; ümumi testlər 329 PASS, 3 mövcud SKIP; lint 0 error (5 mövcud xəbərdarlıq); Prisma validate/generate və production build PASS. 23 OpenAPI schema compile edildi. Sintetik UI yoxlaması 1440 və 390 px-də aparıldı; dərs/material əlavə etmək və müəllim review forması açıldı, browser error və üfüqi daşma qeydə alınmadı. Bu işdə yeni production deployment və real upload edilməyib.

Son E2E: real proqram dərslərinin görünməsi; QR/manual PRESENT ilə +20 və ikinci cəhddə +0; fayl upload → submitted → müəllim accepted ilə +20 → rejected ilə -20; beş uyğun rəydən yalnız dördünə +5; deleted/revision retry; monthly top+me; başqa tələbə/müəllim girişinin rədd edilməsi. Bu sənəddəki nümunələr və lokal testlər canlı E2E təsdiqi deyil.
