# Mobile → ERP: İcma Fırça dəqiqləşdirmələri

Tarix: 2026-09-20

## İcma statusu

`approved` ayrıca insan moderasiyası deyil, şərhin yayımlanmış və görünən olmasıdır:

| Community status | approved | deleted |
| --- | --- | --- |
| published | true | false |
| hidden | false | false |
| deleted | false | true |

Dispatcher vəziyyəti commit olunmuş DB qeydindən götürməlidir; client boolean-na etibar edilməməlidir. Dəyişikliklər artan revision ilə göndərilir. ERP-nin uyğunluq, limit və moderasiya qaydaları ayrıca tətbiq edilir. Mobil developer dispatcher/outbox axınını bu müqaviləyə uyğun hazırlayır.

## Server tokeni

ERP Railway production servisində ayrıca `FIRCA_COMMUNITY_SERVER_TOKEN` yaradılıb. Eyni dəyər mobil tərəfin Supabase Edge Functions Secrets bölməsinə həmin adla əlavə edilməlidir. Bu son Supabase addımı hələ tamamlanmayıb; token Railway Variables bölməsindən təhlükəsiz şəkildə köçürülməlidir.

Endpoint: `POST /api/mobile/v1/firca/community-events`. Authorization: `Bearer <FIRCA_COMMUNITY_SERVER_TOKEN>`. Bu, yalnız etibarlı server dispatcher-i üçündür; tələbə gateway-inə və mobil bundle-a əlavə edilməməlidir. Attendance tokeni təkrar istifadə edilmir.

## Homework E2E fixture

- Test tələbə kodu: `TEST-MOBILE-ATT-01`
- Dərs: 21 sentyabr 2026, Bakı vaxtı ilə 19:00
- `lessonId`: `0b0e60d1-8edd-4147-ab5c-6c0875637d3e`
- `homeworkId`: `1e9e36a1-8fb9-4d78-a3cf-113752daf5c5`
- Başlıq: `MOBILE E2E — Kürə və kölgə`

Homework yalnız test tələbəsinin slotunda yaradılıb və audit qeydi əlavə edilib. Mobil tərəf fayl upload → submitted, ERP müəllim baxışı → accepted/rejected və yenidən göndərmə ssenarilərini yoxlaya bilər. Bu sənəd real cihaz E2E testinin tamamlandığını bildirmir.

Fırça qlobal olaraq bağlı qalır; test hesabı da mükafatlandırmadan istisnadır. Buna görə bu production ssenarisində +20 gözlənilmir. Mükafat və geri-alma məntiqi izolə edilmiş testlərlə yoxlanılıb; canlı aktivləşdirmə ayrıca razılıq tələb edir.

## Bildiriş və OpenAPI

- `mobile-student-portal-openapi.yaml`: 2.0.1
- `mobile-firca-v1-openapi.yaml`: 1.0.1
- Homework event-ləri: `homework.submitted`, `homework.accepted`, `homework.rejected`.
- `entity.type = homework`, `entity.id = homeworkId`.
- Dərsə keçid üçün `event.metadata.lessonId` istifadə edilir.
- `homework.completed` yalnız köhnə müqavilə ilə uyğunluq üçün saxlanılır.

Mövcud Supabase JWT mapping və tələbə endpoint-lərinin təhlükəsizlik axını dəyişməyib.
