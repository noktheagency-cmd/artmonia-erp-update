# Artmonia ERP → Claude Founder MCP

Bu inteqrasiya Claude hesabını Railway-də işləyən Artmonia ERP-yə uzaq
Streamable HTTP MCP connector kimi qoşur.

## Təhlükəsizlik sərhədi

- Yalnız etibarlı Supabase OAuth access token qəbul olunur.
- OAuth tokenindəki `client_id` Railway-dəki `MCP_OAUTH_CLIENT_IDS`
  allowlist-ində olmalıdır. Tək client üçün köhnə `MCP_OAUTH_CLIENT_ID`
  fallback kimi dəstəklənir.
- Tokenin `sub` dəyəri ERP-də aktiv `SUPER_ADMIN` istifadəçisinə bağlı olmalıdır.
- MCP tool-ları yalnız oxuyur; biznes məlumatı əlavə etmir, dəyişmir və silmir.
- Sxem yoxlamasından keçmiş hər autentifikasiya olunmuş tool icrası
  `AuditLog` cədvəlinə `MCP_READ` kimi yazılır. Sorğu parametrləri və
  nəticələri audit jurnalına kopyalanmır.
- Nəticələr səhifələnir və tarix intervalı maksimum 366 günlə məhdudlaşdırılır.
- İxtiyari SQL icrası verən tool yoxdur.

## Mövcud tool-lar

| Tool | Təyinat |
| --- | --- |
| `erp_system_overview` | ERP-nin cari idarəetmə və maliyyə icmalı |
| `erp_students_search` | Tələbə, aktiv proqram, müəllim və borc axtarışı |
| `erp_crm_leads_search` | CRM lead, mərhələ, prioritet və follow-up axtarışı |
| `erp_finance_summary` | Ödəniş, xərc, invoice və borclu xülasəsi |
| `erp_tasks_search` | Tapşırıq, məsul şəxs və gecikmə axtarışı |
| `erp_staff_directory` | Əməkdaş/müəllim və əməkhaqqı kataloqu |
| `erp_groups_search` | Qrup, cədvəl, müəllim və üzv sayı |
| `erp_workshops_search` | Workshop iştirakçı və maliyyə nəticələri |
| `erp_marketing_summary` | Kampaniya, reklam xərci, gəlir və conversion |
| `erp_audit_log_search` | ERP və MCP audit jurnalının axtarışı |
| `erp_data_quality_audit` | Məlumat və əməliyyat risklərinin avtomatik auditi |

## 1. Supabase OAuth server-i hazırla

Supabase Dashboard-da:

1. `Authentication → Signing Keys` bölməsində asimmetrik imzalama açarı
   (`RS256` və ya `ES256`) istifadə olunduğunu təsdiqlə. `openid` scope-u üçün
   bu vacibdir.
2. `Authentication → URL Configuration` bölməsində Site URL-i Railway
   tətbiqinin origin-i et:
   `https://<railway-domain>` — `/mcp` əlavə etmə.
3. `Authentication → OAuth Server` bölməsində OAuth 2.1 server-i aktiv et.
4. Authorization Path dəyərini `/oauth/consent` et.
5. Dynamic Client Registration-u söndür. Bu connector əvvəlcədən qeydiyyatdan
   keçmiş, sabit Claude client ID-si ilə işləyir.
6. `Authentication → OAuth Apps → Add a new client` seç:
   - Name: `Claude — Artmonia Founder`
   - Type: `Confidential`
   - Redirect URI-lər:
     - `https://claude.ai/api/mcp/auth_callback`
     - `https://claude.com/api/mcp/auth_callback`
7. Yaranan Client ID və Client Secret-i təhlükəsiz yerdə saxla. Secret sonradan
   yenidən göstərilməyə bilər.

Rəsmi istinadlar:

- [Supabase OAuth 2.1 setup](https://supabase.com/docs/guides/auth/oauth-server/getting-started)
- [Supabase MCP authentication](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication)
- [Claude connector authentication](https://claude.com/docs/connectors/building/authentication)

## 2. Railway environment variables

Railway service-də bunları əlavə et:

```dotenv
MCP_PUBLIC_URL=https://<railway-domain>/mcp
MCP_OAUTH_CLIENT_IDS=<claude-supabase-oauth-client-uuid>
MCP_ALLOWED_ORIGINS=https://claude.ai,https://claude.com
```

Mövcud dəyişənlər də qalmalıdır:

```dotenv
NEXT_PUBLIC_APP_URL=https://<railway-domain>
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
DATABASE_URL=<supabase-transaction-pooler-url>
DIRECT_URL=<supabase-direct-or-session-pooler-url>
```

İlk qoşulmada `MCP_EXPECTED_AUDIENCE` boş qala bilər. Növbəti security
hardening mərhələsində Supabase Custom Access Token Hook ilə yalnız bu
`client_id` üçün `aud` claim-i `MCP_PUBLIC_URL` dəyərinə bağlanıb sonra
`MCP_EXPECTED_AUDIENCE` eyni URL-ə set edilə bilər.

Railway deploy-dan sonra aşağıdakı URL-lər public olmalıdır:

- `https://<railway-domain>/mcp`
- `https://<railway-domain>/.well-known/oauth-protected-resource/mcp`
- `https://<railway-domain>/.well-known/oauth-protected-resource`
- `https://<railway-domain>/oauth/consent`

`/mcp` token olmadan `401` qaytarmalıdır. Bu gözlənilən və düzgün davranışdır.

## 3. Founder hesabının uyğunluğunu yoxla

Founder Supabase Auth hesabının UUID-si ERP-də `User.authUserId` sahəsinə
bağlanmalı, istifadəçi aktiv olmalı və `SUPER_ADMIN` rolu daşımalıdır.

SQL və ya manual production data dəyişikliyi etmə. Mövcud ERP admin
prosesindən hesabı bağla və rollar ekranından rolu təsdiqlə.

## 4. Claude-da connector əlavə et

Fərdi Pro/Max hesabında:

1. `Customize → Connectors` aç.
2. `+ → Add custom connector` seç.
3. Name: `Artmonia ERP — Founder`.
4. URL: `https://<railway-domain>/mcp`.
5. `Advanced settings` daxilində Supabase OAuth App-dan götürülən Client ID
   və Client Secret-i yaz.
6. `Add`, sonra `Connect` seç.
7. Açılan ERP login səhifəsində Founder hesabı ilə daxil ol.
8. Razılıq ekranında read-only sərhədi yoxla və `Claude-a icazə ver` seç.

Team/Enterprise hesabında connector-u əvvəlcə Organization Owner
`Organization settings → Connectors` bölməsindən əlavə edir; Founder sonra öz
hesabını ayrıca connect edir.

Claude remote connector-a öz cloud infrastrukturu üzərindən qoşulur. Buna
görə Railway URL-i public HTTPS olmalıdır.

## 5. Qəbul testləri

Connector aktiv conversation-da bu sualları ardıcıllıqla yoxla:

1. `Artmonia ERP-nin cari ümumi vəziyyətini göstər.`
2. `Aktiv tələbələr arasında borcu olanları tap və ən böyük borcdan sırala.`
3. `Son 30 günün ödəniş, xərc və net cash-flow xülasəsini ver.`
4. `Gecikmiş CRM follow-up və tapşırıqları audit et.`
5. `ERP data quality audit apar və yüksək riskləri prioritetləşdir.`
6. `Son MCP_READ audit qeydlərini göstər.`

Qəbul meyarları:

- Claude yalnız elan edilmiş read-only tool-ları görür.
- Founder olmayan hesab `401` ilə rədd olunur.
- Başqa OAuth client ID ilə alınmış token rədd olunur.
- Sxem yoxlamasından keçmiş hər uğurlu və uğursuz tool icrası audit jurnalında
  görünür; auth rəddləri Railway təhlükəsizlik logları ilə izlənir.
- Tool nəticələri məhduddur; bütün cədvəlin sərhədsiz export-u mümkün deyil.
- Railway loglarında access token, database URL və ya sorğu nəticəsi görünmür.

## 6. Ləğv və incident proseduru

Connector girişini dərhal dayandırmaq üçün:

1. Claude `Customize → Connectors` bölməsində connector-u disconnect et.
2. Supabase-də Founder-in OAuth grant-ını revoke et.
3. Lazımdırsa OAuth App Client Secret-i rotate et.
4. Təcili halda Railway-də `MCP_OAUTH_CLIENT_IDS` allowlist-indən həmin client
   ID-ni çıxar və redeploy et; həmin client-in tokenləri connector tərəfindən
   dərhal rədd ediləcək.
5. `AuditLog` içində `action = MCP_READ` qeydlərini zaman və IP üzrə araşdır.

## Sonrakı mərhələ

Yazma əməliyyatları ayrıca fazadır. Gələcəkdə əlavə edilərsə, hər mutation
tool-u ayrıca allowlist, preview, insan təsdiqi, idempotency key və dəyişiklik
auditinə malik olmalıdır. Cari Founder connector-a mutation tool əlavə etmə.
