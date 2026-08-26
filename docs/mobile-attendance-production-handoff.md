# Artmonia Mobile ↔ ERP — production handoff

Tarix: 26 avqust 2026
Status: Daimi ümumi QR v2 inteqrasiyası production üçün hazırlanıb.

## Mobil developer üçün təsdiqlənmiş məlumatlar

```text
ERP_API_BASE_URL=https://erp.artmoniya.com
ERP_ATTENDANCE_CHECK_IN_PATH=/api/mobile/v1/attendance/check-ins
ERP_ATTENDANCE_SERVER_TOKEN=<təhlükəsiz kanalla ayrıca veriləcək>
SUPABASE_PROJECT_URL=https://azhriwieowdeuvbqjqvl.supabase.co
```

API public HTTPS üzərindən əlçatandır. Hazırda əlavə IP allowlist və VPN tələbi yoxdur.

## Mobil tərəfdə hazırlanacaq axın

1. İstifadəçi mobil tətbiqdə Supabase Auth ilə daxil olur.
2. Mobil tətbiq aşağıdakı deep link formatındakı QR-i oxuyur:

   ```text
   artmonia://attendance/check-in?v=2&token=<PERMANENT_SITE_TOKEN>
   ```

3. Mobil tətbiq istifadəçi JWT-si və QR məlumatını Supabase Edge Function-a göndərir.
4. Edge Function tələbənin Supabase access tokenini ERP-yə ayrıca header-də ötürür.
5. ERP JWT-ni yoxlayır və tələbəni server-side one-to-one mapping-dən müəyyən edir.
6. `ERP_ATTENDANCE_SERVER_TOKEN` yalnız Edge Function secret-i kimi saxlanılır; Expo koduna və `EXPO_PUBLIC_*` dəyişəninə yazılmır.

## ERP check-in sorğusu

```http
POST https://erp.artmoniya.com/api/mobile/v1/attendance/check-ins
Authorization: Bearer <ERP_ATTENDANCE_SERVER_TOKEN>
X-Student-Authorization: Bearer <SUPABASE_STUDENT_ACCESS_TOKEN>
Idempotency-Key: <UUID>
X-Request-Id: <UUID>
Content-Type: application/json
```

```json
{
  "clientEventId": "<UUID>",
  "qrToken": "<QR-dən oxunan token>",
  "deviceInstallationId": "<APP_INSTALLATION_UUID>",
  "scannedAt": "<ISO 8601 UTC timestamp>"
}
```

Retry zamanı eyni body və eyni `Idempotency-Key` istifadə olunmalıdır. ERP davamiyyət qərarında mobil cihazın `scannedAt` dəyərinə deyil, server vaxtına əsaslanır.
Mobil tətbiq və Edge Function `Student.id` seçmir və saxlamır; ERP onu JWT-dən müəyyən edir.

Tam request/response müqaviləsi `mobile-attendance-openapi.yaml` faylındadır.

## Edge Function üçün secret-lər

```text
ERP_API_BASE_URL=https://erp.artmoniya.com
ERP_ATTENDANCE_SERVER_TOKEN=<deployment zamanı ayrıca veriləcək>
```

Server tokenini mobil repository-yə, loglara, analytics-ə və client bundle-a əlavə etməyin.

## ERP biznes qaydaları

- QR token ömrü: 60 saniyə.
- Ümumi v2 QR daimidir və çap üçün PNG kimi endirilir; yalnız ERP-də rotasiya ediləndə dəyişir.
- Dinamik v1 QR fallback token ömrü: 60 saniyə və ekran yenilənməsi 30 saniyə.
- Check-in pəncərəsi: dərsdən 15 dəqiqə əvvəl başlayır, dərs bitdikdən 30 dəqiqə sonra bağlanır.
- Eyni tələbənin eyni sessiyaya təkrar skanı ikinci davamiyyət yaratmır.
- ERP tələbənin aktiv enrollment və həmin dərs slotuna assignment vəziyyətini yoxlayır.
- ERP `sessionId` qəbul etmir; tələbənin server vaxtında açıq olan `scheduled` və ya `rescheduled` dərsini özü seçir.
- `cancelled` dərs üçün `LESSON_CANCELLED`, açıq dərs olmadıqda `NO_ACTIVE_LESSON` qaytarılır.
- Uğurlu skan ERP jurnalında `PRESENT` / “Gəldi” yazır.
- Pəncərə bağlandıqdan sonra qalan tələbələr avtomatik `ABSENT` / “Gəlmədi” qeyd olunur.

## Mobil giriş qaydası

- ERP-də hər tələbə üçün maksimum bir Supabase Auth hesabı yaradılır.
- İlk v2 scan zamanı hesab bir `deviceInstallationId` ilə bağlanır; başqa cihaz `DEVICE_MISMATCH` alır.
- ERP əməkdaşı parol görmür və təyin etmir; tələbə dəvət linkində parolunu özü yaradır.
- Mobil tətbiq `signInWithPassword({ email, password })` istifadə edir.
- Mobil hesab deaktiv ediləndə ERP-yə bütün yeni mobil sorğular dərhal bloklanır.
- `service_role`/secret key mobil tətbiqə verilmir.

## Hazırkı vacib qeyd

Mobil developer Edge Function-u JWT tələb edən rejimdə deploy etməli, mobil istifadəçinin access tokenini ERP-yə `X-Student-Authorization` header-i ilə ötürməli və idempotency qaydasını saxlamalıdır.
