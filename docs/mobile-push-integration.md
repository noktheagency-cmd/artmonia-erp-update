# ERP → Mobile push contract v1

Base URL: `https://erp.artmoniya.com`.

Worker OpenAPI: `docs/mobile-push-openapi.yaml`.
Mövcud tələbə inbox OpenAPI: `docs/mobile-student-portal-openapi.yaml`.

ERP Profile → Mobil bildirişlər paneli yalnız Vaqif və İsmet üçün açıqdır.
ERP başlıq, mətn, növ, prioritet, yönləndirmə, şəkil URL-si, alıcılar və Bakı vaxtı ilə
planlaşdırmanı idarə edir. Alıcı siyahısı göndəriş yaradılarkən sabitlənir.
Yalnız ACTIVE mobil hesabı, ACTIVE tələbə statusu və aktiv enrollment olan tələbələr seçilir.
Proqram üzrə seçim yalnız həmin proqramda aktiv enrollment olanları əhatə edir.

## Mobil tərəfin hazırlayacağı hissə

Supabase Edge Function daxilində server-only dispatcher yaradın və hər dəqiqə işlədin.
Bu dispatcher cihaz push tokenlərini, bildiriş icazələrini və preferences-i mobil bazadan oxumalıdır.
ERP push token saxlamır. ERP-də ayrıca cron qurmaq tələb olunmur: planlaşdırılmış işi vaxtı çatanda claim endpoint qaytarır.
Dispatcher qoşulana qədər ERP-də göndərişlər növbədə qalır; telefon push-u göndərilmiş sayılmır.

1. Claim endpoint-dən maksimum 25–50 iş alın.
2. `recipientAuthUserId` ilə mobil istifadəçinin uyğun cihazlarını tapın.
3. İcazə yoxdursa `skipped` + `PREFERENCE_DISABLED`; token yoxdursa `skipped` + `NO_DEVICE` bildirin.
4. Provider-ə göndərib nəticəni acknowledge edin.
5. Provider receipt varsa ayrıca yoxlayıb `delivered` və ya `failed` bildirin.
6. Bildirişə toxunuş zamanı `notification.data.destination` ilə mobil ekranı açın;
   `external` üçün yalnız etibarlı HTTPS `url` açın. Tanınmayan destination → Notifications.
7. Native push üçün provider-in payload ölçü limitini qoruyun; lazım olduqda native body-ni qısaldın.
   Tam mətn ERP notification inbox-da qalır. Şəkil göstərilməsi platformanın imkanlarından asılıdır.

## Təhlükəsizlik

Worker endpoint-ləri yalnız server-to-server:

```http
Authorization: Bearer <ERP_ATTENDANCE_SERVER_TOKEN>
Content-Type: application/json
X-Request-Id: <optional UUID>
```

Bu iki endpoint üçün tələbə JWT-si yoxdur: dispatcher müxtəlif istifadəçilərin növbəsini emal edir.
**Bunları tələbənin çağırdığı ümumi Edge Function proxy-sinin allowlist-inə əlavə etməyin.**
Dispatcher-in öz invokasiyası ayrıca server secret/JWT yoxlaması ilə qorunmalıdır.
ERP token və nəticədəki auth user ID-lər mobil tətbiqə qaytarılmamalıdır.
Mövcud `/me/*` endpoint-lərində iki-header autentifikasiya olduğu kimi qalır.

## POST /api/mobile/v1/push/claim

Body: `{"limit":25}`. Default 25, interval 1–50. Unknown fields rədd edilir.
Bu əməliyyat queue state dəyişdirdiyinə görə POST-dur.

```json
{
  "items": [{
    "deliveryId": "delivery-uuid",
    "recipientAuthUserId": "supabase-auth-user-uuid",
    "leaseToken": "lease-uuid",
    "leaseExpiresAt": "2026-09-05T14:05:00.000Z",
    "attempt": 1,
    "notification": {
      "id": "push:delivery-uuid",
      "title": "Yeni workshop",
      "body": "Bu həftə yaradıcılıq workshop-umuza qoşul!",
      "type": "announcement",
      "imageUrl": null,
      "priority": "normal",
      "occurredAt": "2026-09-05T14:00:00.000Z",
      "expiresAt": "2026-09-12T14:00:00.000Z",
      "data": {
        "version": 1,
        "event": "erp.push.published",
        "notificationId": "push:delivery-uuid",
        "campaignId": "campaign-uuid",
        "destination": "notifications",
        "url": null
      }
    }
  }],
  "serverTime": "2026-09-05T14:00:00.000Z"
}
```

`items: []` normaldır. UUID placeholder-ları sənəd üçündür; real API UUID qaytarır.
`destination`: notifications, home, lessons, journey, package, profile, external.
`type`: arbitrary ERP category; tanınmayan növ ümumi bildiriş kimi göstərilməlidir.
`priority`: normal / high.

Lease 5 dəqiqədir. Eyni iş eyni vaxtda iki worker-ə verilmir.
Worker vaxtı bitmiş lease ilə provider-ə yeni göndəriş başlamamalıdır.
ERP eyni alıcı üçün kampaniyanı bir dəfə yaradır, amma lease/retry mexanizmi at-least-once-dur:
provider göndərişi ilə ERP ACK arasında worker çökərsə təkrar cəhd mümkündür.
Mobil dispatcher `deliveryId` + device üzrə davamlı deduplication ledger saxlamalıdır.
Provider ticket alınmış iş üçün ACK təkrarlansın, push təkrar göndərilməsin.
Native client də notificationId ilə lokal dublikat göstərilməsini məhdudlaşdırsın.

## POST /api/mobile/v1/push/acknowledge

```json
{
  "deliveryId": "delivery-uuid",
  "leaseToken": "lease-uuid",
  "status": "accepted",
  "providerReference": "provider-ticket-or-dispatcher-reference",
  "code": "OK"
}
```

`providerReference` optional (1–300 simvol); `code` optional ([A-Za-z0-9_.-], 1–120).
Tokenlər və şəxsi məlumatlar `code` və `providerReference` daxilində göndərilməməlidir.

| status | Mənası |
| --- | --- |
| accepted | Provider qəbul edib; telefonda görünməsi və ya oxunması təsdiqlənmir |
| delivered | Provider delivery receipt təsdiqi; tələbənin oxuması demək deyil |
| retry | Müvəqqəti xəta; ERP növbəti cəhdi gecikdirir |
| failed | Yekun xəta |
| skipped | Token yoxdur, preference/permission bağlıdır və s. |

Cavab: `{"id":"delivery-uuid","status":"accepted","repeated":false}`.
Eyni terminal status + eyni lease yenidən ACK edilə bilər (`repeated:true`).
Accepted nəticəsindən delivered və ya failed receipt keçidi mümkündür.
Retry 2, 4, 8, 16 dəqiqə geri çəkilmə ilə, maksimum 5 claim cəhdi.
Beşinci cəhddən sonra retry nəticəsi failed olur.
Push göndərmə pəncərəsi scheduledAt-dən 7 gündür; inbox tarixçəsi saxlanılır.
Alıcı deaktivləşərsə, müddət bitərsə və ya admin dayandırarsa növbəti claim onu ötürür.
Dayandırma gözləyən işlərə aiddir, işlənən və provider-ə ötürülmüş push geri çağırılmır.
Çox cihaz varsa dispatcher öz ledger-ində cihaz nəticələrini birləşdirib ERP-yə bir alıcı nəticəsi göndərsin.

Xətalar: 401 UNAUTHORIZED, 400 INVALID_REQUEST, 404 NOT_FOUND, 409 CONFLICT (stale lease / terminal state), 500 INTERNAL_ERROR.
409 olduqda köhnə iş üzrə yeni provider göndərişi etməyin.

## Mövcud mobil inbox

`GET /api/mobile/v1/me/notifications` ERP push-larını da qaytarır.
ID `push:<deliveryUuid>`, `event.name: erp.push.published`, `entity.type: mobile_push_campaign`.
Yönləndirmə məlumatları `event.metadata.destination/url/imageUrl/priority` daxilindədir.
Inbox event-də `event.version:1` var. Native push `data` sahəsi yuxarıdakı claim formatındadır.
İndi və planlaşdırılmış mesajlar yalnız vaxtı çatanda inbox-da görünür.
Alıcı olmayan tələbə bu mesajı görə və read statusunu dəyişə bilməz.
Read/unread mövcud `PATCH /api/mobile/v1/me/notifications/{notificationId}/read`
müqaviləsini istifadə edir: body `{ "read": true }` və ya `{ "read": false }`.
Mobil schema notification `type` üçün qapalı enum tətbiq etməməlidir.

## Qəbul testi

Əvvəlcə bir test tələbəsi və bir real cihaz ilə yoxlayın:
normal native push; toxunuşla yönləndirmə; inbox/read/unread; icazəsiz/no-token skip;
təkrar worker/ACK; planlaşdırma; pending cancel; cihaz logout zamanı köhnə tokenin deaktivləşməsi.
Mobil dispatcher və cihaz testi tamamlanmadan toplu production göndərişinə başlamayın.

ERP testləri transaction rollback ilə işlədilib; real tələbələrə test bildirişi göndərilməyib.
