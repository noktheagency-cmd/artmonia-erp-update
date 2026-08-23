# Artmonia Mobile ↔ ERP — production test məlumatları

Status: ERP production deployment hazırdır.

## Endpoint

```text
ERP_API_BASE_URL=https://erp.artmoniya.com
ERP_ATTENDANCE_CHECK_IN_PATH=/api/mobile/v1/attendance/check-ins
ERP_ATTENDANCE_SERVER_TOKEN=<Artmonia tərəfindən təhlükəsiz kanalla ayrıca göndərilir>
```

API üçün IP allowlist və VPN tələbi yoxdur.

## Test tələbəsi

```text
Student.id=b09ca1b7-9bb8-4822-ab21-8768f20164e3
Student.code=TEST-MOBILE-ATT-01
Enrollment.id=eae1219e-8496-4dae-be46-5fa9d090ca0b
Enrollment.status=ACTIVE
```

Bu, yalnız inteqrasiya testi üçün yaradılmış production test tələbəsidir.

## Test dərsi

```text
Slot.id=413ccfb9-a98d-4eb5-a93b-2753a43cc39b
Weekday=MONDAY
Lesson time (Asia/Baku)=19:00–21:00
QR/check-in window (Asia/Baku)=18:45–21:30
Room=ZONA 3
Program=Amsterdam
```

İlk test tarixi: `2026-08-24`.

ERP QR ekranı:

```text
https://erp.artmoniya.com/groups?slot=413ccfb9-a98d-4eb5-a93b-2753a43cc39b
```

QR yalnız yuxarıdakı check-in vaxt pəncərəsində yaradılır. ERP ekranı `attendance.manage` icazəli hesab tələb edir; Artmonia komandası test zamanı ekranı açıb QR-i göstərəcək.

## Təsdiqlənmiş production vəziyyəti

- Prisma migration tətbiq olunub.
- Attendance check-in endpoint production-da aktivdir.
- Server-to-server bearer token aktivdir.
- Tokensiz sorğu `401` qaytarır.
- Düzgün server tokeni ilə tanınmayan QR sorğusu standart `QR_INVALID` cavabı qaytarır və auditə yazılır.
- Attendance finalizer Supabase Cron vasitəsilə hər 5 dəqiqədən bir işləyir.
- Finalizer üçün ayrıca secret Supabase Vault-da şifrəli saxlanılır.
- Finalizer smoke testi `HTTP 200` qaytarıb.

## Mobil developerin test addımları

1. Edge Function secret-lərinə `ERP_API_BASE_URL` və ayrıca göndərilən `ERP_ATTENDANCE_SERVER_TOKEN` əlavə edin.
2. Mobil test istifadəçisini yuxarıdakı `Student.id` ilə server-side mapping edin.
3. Test vaxtında ERP ekranında yaradılan dinamik QR-i mobil tətbiqlə skan edin.
4. Eyni `Idempotency-Key` və body ilə retry edin; eyni nəticə qayıtmalıdır.
5. İkinci skan `already_checked_in` qaytarmalı və ikinci attendance sətri yaratmamalıdır.
6. ERP jurnalında test tələbəsinin statusunun “Gəldi” olduğunu yoxlayın.

