# Artmonia Mobile ↔ ERP — production handoff

Tarix: 23 avqust 2026
Status: mobil tərəfin hazırlanması üçün müqavilə hazırdır; ERP production deployment gözləyir.

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
   artmonia://attendance/check-in?v=1&token=<OPAQUE_BASE64URL_TOKEN>
   ```

3. Mobil tətbiq istifadəçi JWT-si və QR məlumatını Supabase Edge Function-a göndərir.
4. Edge Function istifadəçini dəyişdirilə bilməyən `erp_student_id` UUID ilə uyğunlaşdırır.
5. Edge Function ERP-yə server-to-server check-in sorğusu göndərir.
6. `ERP_ATTENDANCE_SERVER_TOKEN` yalnız Edge Function secret-i kimi saxlanılır; Expo koduna və `EXPO_PUBLIC_*` dəyişəninə yazılmır.

## ERP check-in sorğusu

```http
POST https://erp.artmoniya.com/api/mobile/v1/attendance/check-ins
Authorization: Bearer <ERP_ATTENDANCE_SERVER_TOKEN>
Idempotency-Key: <UUID>
X-Request-Id: <UUID>
Content-Type: application/json
```

```json
{
  "erpStudentId": "<ERP Student.id UUID>",
  "clientEventId": "<UUID>",
  "qrToken": "<QR-dən oxunan token>",
  "scannedAt": "<ISO 8601 UTC timestamp>"
}
```

Retry zamanı eyni body və eyni `Idempotency-Key` istifadə olunmalıdır. ERP davamiyyət qərarında mobil cihazın `scannedAt` dəyərinə deyil, server vaxtına əsaslanır.

Tam request/response müqaviləsi `mobile-attendance-openapi.yaml` faylındadır.

## Edge Function üçün secret-lər

```text
ERP_API_BASE_URL=https://erp.artmoniya.com
ERP_ATTENDANCE_SERVER_TOKEN=<deployment zamanı ayrıca veriləcək>
```

Server tokenini mobil repository-yə, loglara, analytics-ə və client bundle-a əlavə etməyin.

## ERP biznes qaydaları

- QR token ömrü: 60 saniyə.
- ERP ekranında QR yenilənməsi: 30 saniyə.
- Check-in pəncərəsi: dərsdən 15 dəqiqə əvvəl başlayır, dərs bitdikdən 30 dəqiqə sonra bağlanır.
- Eyni tələbənin eyni sessiyaya təkrar skanı ikinci davamiyyət yaratmır.
- ERP tələbənin aktiv enrollment və həmin dərs slotuna assignment vəziyyətini yoxlayır.
- Uğurlu skan ERP jurnalında `PRESENT` / “Gəldi” yazır.
- Pəncərə bağlandıqdan sonra qalan tələbələr avtomatik `ABSENT` / “Gəlmədi” qeyd olunur.

## Production testindən əvvəl ERP tərəfindən tamamlanacaq işlər

- Attendance Prisma migration production bazaya tətbiq olunacaq.
- `MOBILE_ATTENDANCE_SERVER_TOKENS` Railway secret-i yaradılacaq.
- Mobil developerə uyğun server tokeni təhlükəsiz kanalla veriləcək.
- Xüsusi test tələbəsi, aktiv enrollment və dərs assignment-i yaradılacaq.
- Test tələbəsinin ERP `Student.id` UUID-si veriləcək.
- QR yaradan ERP hesabı və test dərs sessiyası təqdim olunacaq.
- Attendance finalizer hər 5 dəqiqədən bir işləyəcək şəkildə planlaşdırılacaq.
- Production endpoint və tam QR axını birlikdə smoke test ediləcək.

## Hazırkı vacib qeyd

Mobil developer Edge Function, JWT yoxlaması, `erp_student_id` mapping-i, idempotency və client QR axınını indidən hazırlaya bilər. Real production check-in testi isə ERP deployment, migration, server tokeni və test məlumatları tamamlandıqdan sonra aparılmalıdır.
