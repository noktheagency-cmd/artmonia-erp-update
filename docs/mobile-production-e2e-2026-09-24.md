# Artmonia Mobile — production E2E ssenarisi

Hazırlıq: 24 sentyabr 2026, Bakı vaxtı ilə təxminən 01:38. Canlı nəticələr test başlayanda yenidən yoxlanmalıdır.

## Hesab və ilkin vəziyyət

- `ismetmobile@gmail.com` Supabase Auth hesabı təsdiqlənib; aktiv ERP mobile mapping və aktiv enrollment var.
- ERP student code: `TEST-MOBILE-ATT-01`; `Student.id`: `b09ca1b7-9bb8-4822-ab21-8768f20164e3` (mobil sorğuda göndərilmir).
- Program code `121`; paket ay üzrə `8 total / 2 used / 6 remaining`.
- Journey `2/3`; üçüncü addım caridir. İlk iki addımda şəkilli material var.
- Fırça global aktivdir, lakin bu test hesabı istisnadır; balans `0`, QR və homework qəbulunda `+0` gözlənilir.
- Profil avatarı mövcuddur. Yeni şəkil yüklənib saxlandıqdan sonra `GET /api/mobile/v1/me/profile` cavabında yeni `avatarUrl` yoxlanmalıdır.

## iPhone ilə QR

- Test dərsi: 24 sentyabr, `01:45–02:00` Bakı vaxtı, yalnız bu test tələbəsinin ayrıca slotunda.
- `lessonId`: `7b0ff784-eda7-4f5e-a55b-82ff92fe34a7`
- `slotId`: `99cf28f3-0f63-4c58-ac0d-96a9321f27b9`
- Serverdə check-in parametrləri ayrıca override edilməyibsə, standart pəncərə `01:30–02:30` Bakı vaxtıdır.
- ERP-də Slotlar → **Ümumi QR** ekranından daimi site QR v2 skan edilməlidir. QR tokenini mesajla paylaşmayın.
- İlk scan `checked_in`, yeni client event ilə ikinci scan `already_checked_in`, jurnalda `PRESENT / MOBILE_QR` gözlənilir.
- Eyni iPhone istifadə olunacağı bildirilib. Başqa installation ID çıxarsa `DEVICE_MISMATCH` mümkündür; yalnız həmin xətadan sonra səlahiyyətli ERP cihaz resetinə baxılmalıdır.
- Uğurlu ilk scan-dan sonra paket `8 / 3 / 5`, Journey `3/3` gözlənilir. Fırça `0` qalır. Cari ERP `/me/journey` və `/me/home` contract-larında ayrıca XP/streak sahəsi yoxdur; bu testdə onlar üçün rəqəm gözləntisi uydurulmamalıdır.

## Homework və dərslər

- Bu dərs üçün foto/PDF test homework-u: `27f28a73-8fde-4115-a81a-6b26e0bf5682`.
- Mobil upload-dan sonra `submitted`; ERP `/firca` panelində `attendance.manage: ALL` icazəli operator səbəblə `rejected`; yenidən göndərişdən sonra `accepted` etməlidir. Bu test slotundakı müəllimin ERP user bağlantısı yoxdur, ona görə müəllimin öz hesabı ilə review bu fixture-də hazır deyil.
- Bildirişlərdə `homework.submitted`, `homework.rejected`, `homework.accepted`; `entity.id` homeworkId və `event.metadata.lessonId` dərs ID-si olmalıdır.
- `rescheduled`: 25 sentyabr `16:30–18:30`, dərs `8e479851-9480-4790-a77e-22c1eaceca18`.
- `cancelled`: 14 sentyabr, dərs `47eed7f5-c45c-4736-850b-314949063c8a`.

## Push

- Hazırlıq yoxlamasında göndərilə bilən `pending` və vaxtı keçmiş `processing` delivery sayı `0` idi. Bu fakt test anında yenidən yoxlanmalıdır.
- Vaqif və ya İsmet ERP `/profile` → **Mobil bildirişlər** panelindən “Tələbə seç” ilə yalnız `TEST-MOBILE-ATT-01` hesabına bir test bildirişi növbəyə qoymalıdır. Preview-də **1 alıcı** görünməlidir.
- `/push/claim` hazırda recipient filter qəbul etmir. Digər pending delivery varsa, cron/worker açılmadan ayrıca təhlükəsiz test planı lazımdır.
- Bildirişin mobil tarixçədə görünməsi ilə push-un cihazda çatması iki ayrı nəticədir; hər ikisi yoxlanmalıdır.

## Faktiki qəbul

Mobil və ERP tərəfi HTTP statusu, biznes statusu, request ID, server vaxtı və jurnaldakı nəticəni hər mərhələdə tutuşdurmalıdır. Bu sənəd hazırlıq vəziyyətidir, testin keçdiyi barədə təsdiq deyil. Server tokenləri, parol, JWT və QR tokeni sənəddə saxlanılmır.

### 24 sentyabr 01:52:58 Bakı — ilk scan

- ERP request ID `d7c67518-9f54-44b7-b43d-d3b0cd4c9511`: HTTP `200`, `checked_in`.
- Dərs jurnalında `PRESENT / MOBILE_QR`, attendance ID `40de8688-8c7e-4b64-b971-21066d50b691`.
- Sentyabr paket istifadəsi `2 → 3`, qalıq `6 → 5`; Journey 3 mövzudan 3 PRESENT ilə tamamlanmalıdır.
- Fırça balansı `0`; test hesabı istisna olduğu üçün gözlənilən nəticədir.
- 01:55:05 Bakı vaxtı ilə ikinci scan request ID `a1093357-d855-4fbe-9d60-086e52c8eff6`: HTTP `200`, `already_checked_in`.
- Eyni dərs üçün jurnalda cəmi `1 PRESENT` qeyd qalıb, paket istifadəsi `3`, Fırça balansı `0`: təkrar scan ikinci dəfə dərs azaltmayıb.
- iPhone ekranı və digər qəbul axınları ayrıca təsdiq gözləyir.

### 24 sentyabr 02:10:35 Bakı — homework upload

- `submissionId`: `c33effb9-e0e7-48ef-94a2-3fa822c728b0`.
- Status `submitted`, revision `1`; JPEG faylı 1,804,329 baytdır və `erp-private-files` private Storage bucket-ində obyekt mövcuddur.
- Akademik notification mənbəyi `homework.submitted`, `entity.id = 27f28a73-8fde-4115-a81a-6b26e0bf5682`, `metadata.lessonId = 7b0ff784-eda7-4f5e-a55b-82ff92fe34a7` qaytarır. Mobil ekranında görünməsi hələ ayrıca təsdiqlənməyib.
- Növbəti addım səlahiyyətli ERP operatorunun `/firca` panelində bu submission-u səbəblə `rejected` etməsidir; bu qərar hələ verilməyib.
