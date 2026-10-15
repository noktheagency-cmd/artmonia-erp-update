# Mobil üzv və tələbə giriş müqaviləsi — v1

Tarix: 2026-10-12. Kod və lokal yoxlamalar hazırlandıqdan sonra ERP deploy-u tələb olunur; bu sənəd canlı deploy təsdiqi deyil.

## Endpoint

`POST /api/mobile/v1/me/access` — body və query göndərilmir.

```http
Authorization: Bearer <ERP_ATTENDANCE_SERVER_TOKEN>
X-Student-Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
X-Request-Id: <uuid>
```

Server token yalnız Edge Function secret-ində qalır. Mobil `Student.id`, rol və ya seçilmiş tələbə göndərmir.

```json
{
  "contractVersion": 1,
  "authUserId": "554db2bb-4d45-409b-8dcf-8d0f1eff106e",
  "role": "member",
  "accountStatus": "active",
  "matchStatus": "not_found",
  "displayName": "Aylin Məmmədova",
  "email": "aylin@example.com",
  "phone": "+994501234567",
  "avatarUrl": null,
  "checkedAt": "2026-10-12T09:00:00Z"
}
```

Bu nümunə sintetikdir. Cavab HTTP 200, `Cache-Control: private, no-store` və `X-Request-Id` qaytarır. Tələbə üçün `role: student / matchStatus: matched`; konflikt üçün `member / review_required`. Bloklanmış hesab `accountStatus: disabled` alır; mobil bu halda heç bir qorunan bölməni açmamalıdır. Üzvün tapılmaması xəta deyil.

## Uyğunlaşdırma və təhlükəsizlik

- JWT imzası və müddəti yoxlanılır. Kimlik yalnız `sub` və `session_id`-dən götürülür; ləğv olunmuş/bitmiş sessiya, silinmiş və anonymous hesab qəbul edilmir.
- Auth bazasındakı cari `email` və `email_confirmed_at` əsasdır; token metadata-sındakı email/rol/tələbə ID-si deyil. Təsdiqlənməmiş email: HTTP 401 `EMAIL_NOT_VERIFIED`.
- Mövcud mapping qorunur. İstifadəçinin e-poçt/telefon dəyişməsi onu başqa tələbəyə avtomatik keçirmir və şifrəsini dəyişmir.
- Yeni mapping üçün Auth email-i və `erp.contacts.email` trim + lowercase ilə eyni olmalı, uyğun tələbə sayı dəqiq bir olmalıdır.
- ERP-də telefon varsa Auth-un təsdiqlənmiş telefonu, yoxdursa metadata-dakı `phone` əlavə uyğunluq yoxlamasında istifadə edilir. `050...`, `50...`, `+99450...`, `0099450...` eyni Azərbaycan nömrəsinə normallaşdırılır. Telefonun yoxluğu/ziddiyyəti və ERP-də bir-birinə zidd telefon sahələri review tələb edir. Metadata telefonu təkbaşına hüquq yaratmır.
- Bir neçə uyğun tələbə, başqa Auth hesabına məxsus mapping və ya login email konflikti: `review_required`, heç bir əlaqə dəyişdirilmir. ERP operatoru tələbənin əlaqə məlumatlarını və əvvəlki mapping-i öz mövcud səlahiyyətləri daxilində araşdırmalıdır; avtomatik override yoxdur.
- Hər access sorğusu yeni uyğunluğu yoxlaya bilər; mənfi nəticə cache-lənmir. Sonradan ERP-yə əlavə edilən tələbə yeni Auth hesabı olmadan tanınır.
- Transaction, Auth/contact/student row lock-ları, auth/email advisory lock-ları və mövcud unique constraint-lər təkrar/paralel mapping-i qoruyur. Mapping ilə audit eyni transaction-da yaradılır. Heç bir ERP student/staff/admin/role yaratma əməliyyatı yoxdur.
- `ACTIVE` mapping olsa belə Auth banı, mapping `DISABLED` və mövcud `FROZEN / STOPPED / DECLINED / COMPLETED` lifecycle məhdudiyyətləri saxlanılır.
- Ad/soyad/full_name/phone metadata-sı yalnız profil təqdimatı və əlavə telefon uyğunluğu üçündür; ERP rol icazəsi deyil. ERP işçi girişinə əvvəlki `erp.users` və RBAC/MFA tələbləri tətbiq edilir.

## İcazə sərhədi

`/me/access` üzvlə tələbəni ayırır. `/me`, profile, home, lessons/detail, attendance summary, homework completion/submission, package, journey, Fırça/history və QR check-in tələbə mapping-i tələb edir. Üzv portal akademik API-yə birbaşa müraciətdə HTTP 403 `STUDENT_MAPPING_NOT_FOUND` alır. Mövcud olmayan/silinmiş/bitmiş sessiya HTTP 401 `STUDENT_AUTH_INVALID`; deaktiv tələbə üçün portal akademik API HTTP 403 `MOBILE_ACCOUNT_DISABLED`. QR check-in-in geriyə uyğun müqaviləsi saxlanılır: tələbə kimliyi/mapping/deaktiv vəziyyətinin uğursuz yoxlaması HTTP 403 `STUDENT_AUTH_INVALID` qaytarır; QR body/header validasiyası ayrıca tətbiq edilir.

İcma/xəbər gateway-si və icma moderasiyası mobil tərəfin məsuliyyətində qalır: aktiv üzvlərə giriş verilməli, bloklanmış üzv və mövcud şikayət/moderasiya qaydaları qorunmalıdır. ERP icma blok cədvəllərini və mobil gateway-ni bu dəyişikliklə yenidən yazmır. Mobil tərəf həmin rolları həm gateway-də, həm icma RLS/funksiyalarında serverdən yoxlamalıdır.

`POST /api/mobile/v1/firca/community-events` əvvəlki ayrıca dispatcher tokeni ilə işləyir. Tələbə mapping-i olmayan müəllif üçün HTTP 200 `{"status":"ineligible","delta":0}` qaytarılır; Fırça ledger/event/student qeydi yaradılmır. Təkrar eyni hadisə də ineligible/0-dır. Tələbə hadisələrində əvvəlki revision/idempotency/mükafat qaydaları dəyişmir. Keçmiş üzv şərhləri ERP tərəfindən avtomatik replay olunmur. Dispatcher `ineligible` cavabını terminal uğurlu nəticə saymalı, sonradan student roluna keçən üzv üçün əvvəlki şərhləri yenidən mükafatlandırmaya göndərməməlidir.

## ERP interfeysi

Yeni tələbə yaratma ekranında mobil dəvət checkbox-u və tələbə profilində “Mobil hesab yarat” düyməsi çıxarılır. Tələbə öz hesabını tətbiqdə yaradır və ERP-dəki e-poçt/telefonun uyğun olması izah edilir. Köhnə server action da `FORBIDDEN` və self-registration izahı ilə bloklanır. Mövcud hesabın şifrə bərpası, cihaz reset-i və deaktiv/aktiv idarəetməsi saxlanılır.

## Supabase ayarları və deploy ardıcıllığı

2026-10-12 tarixli read-only `/auth/v1/settings` yoxlaması: `disable_signup: true`, `mailer_autoconfirm: false`, email provider aktiv, anonymous users bağlı. Dashboard standart SMTP-nin istifadə edildiyini göstərir. Yəni yeni qeydiyyat hazırda açıq deyil və ümumi istifadəçilərə email göndərişi production üçün hazır deyil. Bu məlumat həmin yoxlama anına aiddir.

Vacib: Supabase-in standart SMTP xidməti yalnız təşkilatın komanda email-lərinə göndərir; adi tələbə/üzv üçün [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp) lazımdır. SMTP host/port/user/password və təsdiqlənmiş göndərən ünvanı təhlükəsiz qaydada qoşulmalıdır. Mövcud SMTP credential yoxdur; bu sənəd yeni provider alınması və ya təhlükəsizlik ayarlarının söndürülməsi üçün icazə deyil. Email confirmation-u söndürərək bu problemi keçməyin.

1. ERP kodunu deploy edin. Yeni `/me/access` müqaviləsini canlıda təsdiqləyin; DB migration və hesab/parol backfill-i tələb olunmur.
2. Əvvəl custom SMTP qurub kodun real email-ə çatmasını yoxlayın. Sonra [Auth → Sign In / Providers](https://supabase.com/dashboard/project/azhriwieowdeuvbqjqvl/auth/providers): “Allow new users to sign up” aktiv olsun; “Confirm email” aktiv saxlanılsın. Anonymous signup açılmasın. Mövcud MFA/password/rate-limit ayarları zəiflədilməsin.
3. [Auth → Emails](https://supabase.com/dashboard/project/azhriwieowdeuvbqjqvl/auth/templates), “Confirm sign up”: mövcud mətn və `{{ .ConfirmationURL }}` linkini saxlayaraq aşağıdakı hissəni əlavə edin:

   ```html
   <p>Artmonia hesabınızı təsdiqləmək üçün kod:</p>
   <p><strong>{{ .Token }}</strong></p>
   ```

   Mövcud mail OTP uzunluğu/müddəti dəyişdirilməməlidir; mobil daxil etmə UI-si faktiki Auth ayarına uyğun olmalıdır. Kod/link/token loga və çata yazılmamalıdır. SMTP göndəriş limiti və real məktub çatması ayrıca qəbul testidir.

   2026-10-12: bu şablon dəyişikliyi production Supabase Dashboard-da saxlanıldı; mövcud confirmation link-i və subject qorundu. Signup flag-i açılmadı, SMTP və real məktub çatması hələ tamamlanmayıb.
4. Sonra mobil developer gateway və icma funksiyalarını birlikdə deploy etsin. Yeni istifadəçilərə akademik ekranlar yalnız `role: student` və `accountStatus: active` olduqda açılsın. `review_required` üçün müraciət mesajı, `not_found` üçün normal üzv UI-si göstərilsin.
5. Mövcud hesabla giriş/şifrə bərpası və yeni hesabın kod/linklə təsdiqi cihazda yoxlanılsın. Bundan sonra self-signup release-i tamamlanmış sayılır.

OpenAPI: [mobile-student-portal-openapi.yaml](mobile-student-portal-openapi.yaml), version 2.1.0. Fırça: [mobile-firca-v1-openapi.yaml](mobile-firca-v1-openapi.yaml).

## Qısa qəbul testi — owner/mobile developer

1. Yeni, ERP-də olmayan e-poçtla qeydiyyat və kodla təsdiq: access → HTTP 200 member/not_found; xəbərlər/icma açılır, akademik API → 403; ERP-də əlavə tələbə yaranmır.
2. Eyni hesabın email/telefonunu ERP-də bir tələbəyə daxil edin: növbəti access → student/matched; iki dəfə təkrarlayın, bir mapping qalmalıdır.
3. Ayrı sintetik hesabla telefon konflikti və iki eyni email-li tələbə: member/review_required, heç bir mapping yaranmır. Başqasına bağlı tələbə də eyni qaydada qorunur.
4. Mövcud tələbə hesabı ilə giriş, Home/Journey/QR: əvvəlki hesab/mapping işləməlidir. Deaktiv etdikdə access disabled, akademik API 403; sonra səlahiyyətli ERP operatoru əvvəlki vəziyyəti bərpa etsin.
5. Üzv şərhi dispatcher-dən ineligible/0; üzvün Fırça endpoint-i 403. Mövcud icma blok/şikayət qaydalarının dəyişmədiyini mobil tərəf təsdiqləsin.

Lokal avtomatik testlər sintetik in-memory Postgres (PGlite) üzərindədir; production məlumatına test yazısı göndərilmir. Real email, cihaz/browser və production E2E ayrıca owner/mobile qəbul yoxlamasıdır.

## Yoxlama nəticələri

- `npx next typegen`, `npm run typecheck`, `npm run build`: PASS.
- `npm run lint`: 0 error, 5 mövcud əlaqəsiz warning; dəyişən kod fayllarına ayrıca ESLint yoxlaması: PASS.
- `npm test`: 376 test, 359 PASS, 17 mövcud skip, 0 fail. Yeni access/domain testləri skip edilmir; əlavə chunked/boş POST stream, audit rollback və login email konflikti yoxlamaları ayrıca PASS.
- Hər iki yenilənmiş OpenAPI YAML parse yoxlaması və `git diff --check`: PASS.
- Production DB read-only effektiv privilege yoxlaması: `anon` və `authenticated` üçün ERP cədvəl/view-lərində table/column read/write hüququ olan obyekt sayı 0. Auth istifadəçisi özbaşına ERP məlumatına birbaşa giriş almır; icmanın ayrıca RLS/gateway deploy-u mobil tərəfdə qalır.
- ERP deploy, signup açılması, custom SMTP və real email/device E2E bu yoxlamaların əhatəsində deyil. Canlıda yalnız Confirm sign up şablonuna OTP əlavə edildi; account/password/student məlumatlarına toxunulmadı.
