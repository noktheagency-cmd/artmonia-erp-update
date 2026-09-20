# Artmonia Mobile ↔ ERP P1 təhvil sənədi

> Tarixi P1 müqaviləsidir. Yeni Journey/Fırça və fayllı ev tapşırığı keçidi üçün [Fırça V1 təhvil sənədini](mobile-firca-v1-handoff.md) və OpenAPI v2-ni istifadə edin. Aşağıdakı köhnə XP, track və manual completion qaydaları yeni keçidə aid deyil.

**Status:** production üçün hazırdır

**API versiyası:** `v1`

**ERP base URL:** `https://erp.artmoniya.com`

## Sorğu axını və təhlükəsizlik

Mobil tətbiq ERP-yə birbaşa qoşulmur. Bütün sorğular Supabase Edge Function üzərindən server-to-server göndərilir:

```text
Expo Mobile → Supabase Edge Function → Artmonia ERP API
```

Edge Function ERP-yə hər sorğuda bu header-ləri göndərməlidir:

```http
Authorization: Bearer <ERP_ATTENDANCE_SERVER_TOKEN>
X-Student-Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
X-Request-Id: <UUID>
Content-Type: application/json
```

- `Student.id` heç bir sorğuya və mobil cavaba əlavə edilmir.
- ERP tələbəni Supabase Auth User ID üzrə private mapping-dən tapır.
- ERP server tokeni yalnız Edge Function secret-də saxlanılır.
- Bütün cavablar `Cache-Control: private, no-store` və `X-Request-Id` qaytarır.

## P1 endpoint-ləri

```http
GET   /api/mobile/v1/me
GET   /api/mobile/v1/me/profile
PATCH /api/mobile/v1/me/profile
GET   /api/mobile/v1/me/home
GET   /api/mobile/v1/me/lessons
GET   /api/mobile/v1/me/lessons/{lessonId}
PUT   /api/mobile/v1/me/homeworks/{homeworkId}/completion
GET   /api/mobile/v1/me/attendance/summary
```

### Hesab yoxlaması

```http
GET /api/mobile/v1/me
```

```json
{
  "accountStatus": "active",
  "displayName": "Tələbə adı",
  "email": "student@example.com",
  "serverTime": "2026-08-24T15:00:00.000Z"
}
```

### Profil

```http
GET /api/mobile/v1/me/profile
```

Ad və email yalnız oxunur. Tələbə `phone` və `avatarObjectPath` sahələrini dəyişə bilər; dəyişiklik ERP-də dərhal qüvvəyə minir.

- Telefon string olaraq göndərilirsə, trim edilmiş uzunluq `7..30` simvol, rəqəm olmayan simvollar çıxarıldıqdan sonra isə `7..15` rəqəm olmalıdır. Məsələn: `+994501234567`.
- Mövcud telefon nömrəsini silmək üçün `{"phone": null}` göndərilir.
- Boş string (`{"phone": ""}`) qəbul edilmir.

```http
PATCH /api/mobile/v1/me/profile
Content-Type: application/json

{
  "phone": "+994501234567",
  "avatarObjectPath": "<AUTH_USER_ID>/avatar.webp"
}
```

`avatarObjectPath` yalnız aşağıdakı formatlardan biri ola bilər:

```text
<AUTH_USER_ID>/avatar.jpg
<AUTH_USER_ID>/avatar.jpeg
<AUTH_USER_ID>/avatar.png
<AUTH_USER_ID>/avatar.webp
```

Profil şəkli Supabase Storage-də public `student-avatars` bucket-inə, tələbənin öz access token-i ilə upload/upsert edilir. Maksimum ölçü `5 MB`-dır. Sonra object path profil `PATCH` sorğusunda ERP-yə yazılır. `service_role` mobil tətbiqdə istifadə edilmir.

### Home

```http
GET /api/mobile/v1/me/home
```

Cavab real ERP məlumatından aşağıdakı hissələri verir:

- profil xülasəsi;
- cari həftənin davamiyyət faizi və sayları;
- növbəti dərs;
- son müəllim qeydi və ya açıq ev tapşırığından `nextAction`;
- aktiv akademiya elanı varsa `academyNotice`.

XP, level, streak və achievement P2-də Supabase gamification nəticəsi kimi Edge Function-da bu cavaba birləşdiriləcək.

### Dərslər və jurnal

```http
GET /api/mobile/v1/me/lessons?from=2026-08-01&to=2026-09-30&status=all&limit=20
GET /api/mobile/v1/me/lessons/{lessonId}
```

Filtrlər:

- `status`: `all`, `scheduled`, `completed`, `cancelled`, `rescheduled`, `pending`, `present`, `absent`, `excused`;
- `limit`: `1..50`, default `20`;
- `cursor`: əvvəlki cavabın opaque `nextCursor` dəyəri;
- `from`/`to`: `YYYY-MM-DD`, maksimum aralıq `366` gün;
- default aralıq: son `90` gün və növbəti `60` gün.

List cavabı:

```json
{
  "items": [],
  "nextCursor": null,
  "serverTime": "2026-08-24T15:00:00.000Z"
}
```

Dərs obyekti real ERP jurnalından `lessonStatus`, `attendance`, `teacherNote`, `homework`, mövzu və məqsədi qaytarır. Gələcək dərs sessiyaları aktiv həftəlik slot assignment-larından idempotent şəkildə yaradılır. Keçmiş tarixlər süni şəkildə yaradılmır və retroaktiv davamiyyətsizlik yazılmır.

ERP qrup idarəçisi konkret dərsin ümumi slotdan fərqli başlama/bitmə saatını, otağını və `scheduled | completed | cancelled | rescheduled` statusunu təyin edə bilər. Bu dəyişikliklər dərhal mobil dərs siyahısında və Home-dakı növbəti dərsdə görünür. Ləğv olunmuş dərs avtomatik `absent` yaratmır.

### Ev tapşırığını tamamlamaq və yenidən açmaq

```http
PUT /api/mobile/v1/me/homeworks/{homeworkId}/completion
Content-Type: application/json

{"completed": true}
```

`PUT` idempotentdir. Tələbə yalnız aktiv enrollment və öz dərs planına aid tapşırığı dəyişə bilər; `Student.id` göndərilmir. Yenidən açmaq üçün `{"completed": false}` göndərilir.

```json
{
  "homeworkId": "uuid",
  "status": "completed",
  "completedAt": "2026-08-24T15:00:00.000Z",
  "updatedAt": "2026-08-24T15:00:00.000Z"
}
```

### Davamiyyət xülasəsi

```http
GET /api/mobile/v1/me/attendance/summary?from=2026-08-01&to=2026-08-31
```

```json
{
  "from": "2026-08-01",
  "to": "2026-08-31",
  "attendancePercent": 75,
  "attendedCount": 3,
  "absentCount": 1,
  "excusedCount": 1,
  "pendingCount": 2,
  "scheduledCount": 7,
  "serverTime": "2026-08-24T15:00:00.000Z"
}
```

Faiz yalnız `present + absent` üzərindən hesablanır; `excused` və `pending` məxrəcə daxil edilmir.

## Enum-lar

```text
accountStatus: invited | active | disabled
lessonStatus: scheduled | completed | cancelled | rescheduled
attendance.status: pending | present | absent | excused
attendance.source: manual | mobile_qr | automatic | null
homework.status: pending | completed | overdue
```

Ev tapşırığı yoxdursa `homework: null` qaytarılır.

## Stabil xəta kodları

```text
UNAUTHORIZED                 401
STUDENT_AUTH_REQUIRED        401
STUDENT_AUTH_INVALID         401
STUDENT_MAPPING_NOT_FOUND    403
MOBILE_ACCOUNT_DISABLED      403
ENROLLMENT_INACTIVE          403
INVALID_REQUEST              400
INVALID_DATE_RANGE           400
DATE_RANGE_TOO_LARGE         400
INVALID_CURSOR               400
INVALID_PHONE                422
INVALID_AVATAR_PATH          422
LESSON_NOT_FOUND             404
HOMEWORK_NOT_FOUND           404
UNSUPPORTED_MEDIA_TYPE       415
PAYLOAD_TOO_LARGE            413
INTERNAL_ERROR               500
```

Standart xəta cavabı:

```json
{
  "code": "LESSON_NOT_FOUND",
  "message": "Dərs tapılmadı.",
  "requestId": "uuid"
}
```

## ERP-də müəllim/admin əməliyyatları

- Qruplar planlayıcısında slot üçün mobil tətbiqdə görünən qrup adı yazılır.
- Jurnalda dərsin mövzusu və məqsədi yazılır.
- Jurnalda ev tapşırığı, açıqlaması və son tarixi yazılır.
- Qrup idarəçisi konkret dərsi ləğv edir və ya həmin dərsin saatını/otağını dəyişərək `rescheduled` edir.
- Qruplar səhifəsində bütün tələbələr və ya seçilmiş proqram üçün mobil akademiya elanı yaradılır, planlanır və deaktiv edilir.
- Davamiyyət `Gəldi`, `Gəlmədi`, `Üzrlü` və ya statussuz saxlanılır.
- QR finalizer yekunlaşdırdığı sessiyanı `completed` edir.

Maşınla oxunan tam contract: [mobile-student-portal-openapi.yaml](./mobile-student-portal-openapi.yaml).
