# Əməkdaşın şəxsi kabinetinin dayandırılması və silinməsi

Rollar və icazələr → rol → İstifadəçilər bölməsində hər giriş hesabının yanında hesab əməliyyatları var. Bu əməliyyatlar HR-dan əməkdaşı çıxarmaq/arxivləmək əməliyyatından ayrıdır.

## RBAC

- `auth.user.status.change`: girişi dayandırmaq və yenidən bərpa etmək.
- `auth.user.delete`: Auth giriş hesabını silmək və ERP rol təyinatlarını çıxarmaq.
- Hər iki icazə `Sistem → İstifadəçilər` altında görünür, həssasdır və `auth.user.read` asılılığı var. Onları rollara yalnız Super Admin verə bilər. Super Admin kataloqu avtomatik alır; digər rollara yeni icazələr avtomatik verilmir. Bu səhifəyə daxil olmaq üçün əvvəlki `auth.role.read` tələbi saxlanır.
- Server hər sorğuda uyğun ayrıca icazəni yoxlayır. `auth.user.manage` bu yeni icazələri əvəz etmir. İstifadəçi öz hesabını və SUPER_ADMIN, ADMIN, OWNER kodlu qorunan hesabları bu bölmədən dəyişə bilməz.
- Arxivdəki/INACTIVE əməkdaşın hesabı bu düymə ilə yenidən aktivləşdirilmir. Tələbə mobil kabineti ilə eyni Auth identifikatorundan istifadə olunan hesabda əvvəlcə girişlər ayrılmalıdır.

## Davranış

Dayandırma zamanı ERP istifadəçisi qeyri-aktiv olur, sessiya qeydləri ləğv olunur və hədəf hesabın `auth.sessions` qeydləri silinir. Auth hesabına ban tətbiq edilir. Rol təyinatları və əməkdaş profili qalır. Bərpa yalnız Auth ban uğurla götürüldükdən sonra ERP girişini açır; əvvəlki sessiyalar yenidən açılmır.

Giriş hesabının silinməsində Auth identifikatoru server admin API-si ilə silinir, sonra ERP istifadəçisinin `authUserId` əlaqəsi və rol təyinatları çıxarılır. ERP istifadəçisinin tarixi ID-si, HR əməkdaş profili, müəllim/tələbə əlaqələri, CRM, satış, ödəniş və audit qeydləri saxlanır. Satış sahibi və keçmiş audit icraçısı dəyişmir. Silinmiş giriş üçün yenidən hesab yaratmaq tələb olunur; bu, deaktiv hesabı bərpa etməkdən fərqlidir. HR profili ilə bağlı hesab mövcud Super Admin hesab-yaratma axınından yenidən yaradıla bilər.

## Xəta və təkrar sorğu

ERP və Auth ayrıca sistemlər olduğu üçün iki mərhələ var. Əvvəl yerli tranzaksiya girişi bağlayır, sessiyaları ləğv edir və `auth.account.lifecycle.request` audit qeydi yaradır. Sonra Auth əməliyyatı icra olunur. Uğurlu nəticə ikinci tranzaksiyada `auth.account.lifecycle.complete` ilə tamamlanır. Mövcud audit yazıları dəyişdirilmir.

Şəbəkə/Auth xətasında hesab bağlı qalır. Eyni `requestKey`, əməliyyat, ilkin hesab versiyası və səbəblə təkrar icra davam edir. UI eyni sorğunu saxlayır; səhifə yenilənəndə tamamlanmamış sorğu auditdən oxunur və “Yenidən cəhd et” göstərilir. Başqa əməliyyat pending sorğunu əvəz edib girişi aça bilməz. Eyni sorğu tamamlanıbsa, təkrar Auth çağırışı edilmir. Sonradan yaradılmış yeni Auth hesabı köhnə sorğunun təkrarı ilə silinmir.

Auth silinib, son DB tranzaksiyası uğursuz olubsa, növbəti cəhd yalnız təsdiqli `user_not_found` cavabını əvvəlki silinmənin nəticəsi kimi qəbul edir. Naməlum 404 və digər xətalar silinmə təsdiqi sayılmır. Auth gecikməsi/xətası zamanı giriş avtomatik açılmır. Səbəb 5–500 simvoldur; köhnəlmiş hesab versiyası və dəyişdirilmiş təkrar sorğu rədd edilir.

İcazə kataloqu koddan render edilir, rol saxlananda mövcud `resolvePermissionRows` axını yeni icazələri DB-də həll edir. Bu dəyişiklik ayrıca sxem miqrasiyası və canlı hesablarda avtomatik əməliyyat tələb etmir.

## İstifadəçi yoxlaması

1. Super Admin → Rollar və icazələr → test roluna yeni status/silmə icazəsini verin. İcazəsiz hesabda əməliyyat düymələri görünməməlidir.
2. Yalnız test girişində “Girişi dayandır” → səbəb → təsdiq edin. Açıq digər cihazın növbəti ERP sorğusu rədd edilməli, yeni giriş açılmamalıdır. Eyni istifadəçi rol siyahısında dayandırılmış kimi qalmalıdır.
3. “Girişi bərpa et” → səbəb → təsdiq edin. Yeni login mümkün olmalıdır; köhnə sessiya bərpa olunmamalıdır.
4. Test girişini silin. Giriş rol siyahısından çıxmalı, əlaqəli HR profili və əməliyyat tarixçəsi qalmalıdır. Auditdə səbəb və tamamlanmış əməliyyat görünməlidir.

Avtomatik testlər: `src/modules/roles/account-lifecycle-service.test.ts` və `src/server/rbac/permissions.test.ts`. Bunlar saxta Auth provider və tranzaksiya modeli ilə icra olunur; canlı hesab bağlanmır və silinmir. Real Auth/browser acceptance yoxlamasını istifadəçi test hesabı ilə aparır.
