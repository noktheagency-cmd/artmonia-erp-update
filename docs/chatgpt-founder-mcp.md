# Artmonia ERP → ChatGPT Founder MCP

Bu sənəd Railway-də işləyən read-only Artmonia ERP MCP server-ini ChatGPT-yə
Supabase OAuth 2.1 ilə qoşmaq üçündür. Claude və ChatGPT üçün ayrıca OAuth
client-lər istifadə olunur; hər ikisi eyni founder-only MCP endpoint-ə çıxır.

## Təhlükəsizlik modeli

- Yalnız `MCP_OAUTH_CLIENT_IDS` allowlist-indəki Supabase OAuth client-lər qəbul olunur.
- Token sahibi ERP-də aktiv `SUPER_ADMIN` olmalıdır.
- Bütün MCP tool-ları read-only-dır və hər icra `MCP_READ` audit qeydi yaradır.
- ChatGPT client secret Railway-ə yazılmır; yalnız ChatGPT app konfiqurasiyasında saxlanır.
- Claude client ID və secret-i dəyişdirilmir.

## ChatGPT app və Supabase client

1. ChatGPT Web-də `Settings → Account security and login → Developer mode`
   aktiv et.
2. `Apps → Create app` aç və MCP URL kimi
   `https://erp.artmoniya.com/mcp` yaz.
3. `OAuth → Advanced OAuth settings` bölməsində göstərilən callback URL-ni
   dəqiq kopyala. Callback hər yaradılan ChatGPT app üçün fərqli ola bilər;
   başqa hesabda köhnə callback-i təkrar istifadə etmə.
4. Supabase `Authentication → OAuth Apps → New OAuth App` bölməsində ayrıca
   confidential client yarat:
   - Name: `ChatGPT — Artmonia Founder`
   - Redirect URI: ChatGPT-nin göstərdiyi dəqiq callback
   - Public Client: off
   - Token Endpoint Auth Method: `client_secret_post`
5. Yaranan Client ID və Client Secret-i ChatGPT-dəki user-defined OAuth client
   sahələrinə daxil et. Token auth method olaraq `client_secret_post` seç.
6. Default scopes: `openid`, `email`, `profile`.

## Railway

Claude və ChatGPT client ID-lərini vergüllə ayır:

```dotenv
MCP_OAUTH_CLIENT_IDS=<claude-client-id>,<chatgpt-client-id>
MCP_ALLOWED_ORIGINS=https://claude.ai,https://claude.com,https://chatgpt.com,https://chat.openai.com
```

Secret-ləri Railway-ə əlavə etmə. Deploy tamamlandıqdan sonra ChatGPT-də app-i
yarat, Founder ERP hesabı ilə OAuth consent-i təsdiqlə və tool scan-i tamamla.

## Başqa ChatGPT hesabına qoşmaq

Hər hesabda Developer Mode-u ayrıca aktiv et və yeni ChatGPT app yarat. Yeni
app-in callback URL-si ilə ayrıca Supabase OAuth client yaratmaq tövsiyə olunur.
Sonra həmin client ID-ni `MCP_OAUTH_CLIENT_IDS` allowlist-inə əlavə edib Railway
redeploy et. Bu yanaşma hər hesabı ayrıca revoke və audit etməyə imkan verir.

## MCP autentifikasiya diaqnostikası

### MFA və OAuth sessiyaları

Supabase OAuth code exchange ayrıca sessiya yaradır; brauzerin `aal2`
claim-i OAuth tokeninə avtomatik köçürülmür. ERP consent səhifəsi və action
MFA təsdiqli Founder tələb edir. Uğurlu təsdiqdən sonra (əvvəlki consent üçün
avtomatik redirect daxil) `MCP_OAUTH_APPROVED` audit hadisəsi əlavə edilir.
Client və istifadəçi Supabase-in serverdəki approved authorization qeydindən
yoxlanılır; brauzerdən göndərilən client/actor məlumatına etibar edilmir.

`aal1` OAuth tokeni yalnız həmin istifadəçi/client üçün ən son MFA icazəsi
olduqda qəbul edilir. OAuth sessiyası icazədən sonra yaradılmalı, əsas
brauzer sessiyası hələ `aal2`, aktiv, ləğv edilməmiş və 7 gündən cavan
olmalıdır. İstifadəçinin təsdiqli MFA faktoru da qalmalıdır. OAuth sessiyasının
öz 7 günlük, ləğv və Founder yoxlamaları ayrıca qüvvədədir. Yeni icazə əvvəlki
OAuth sessiyalarını əvəz edir; əsas sessiyanın bağlanması connector-u da bağlayır.
Audit tarixçəsi dəyişdirilmir; mövcud indekslə son icazə oxunur. Miqrasiya yoxdur.

Deploy-dan sonra connector-u yenidən authorize etmək lazımdır; köhnə tokenlər
üçün avtomatik icazə/backfill yoxdur. Qəbul yoxlaması: yeni qoşulma ilə oxu
uğurlu olmalı; əsas ERP sessiyasını bağladıqdan sonra həmin connector rədd
edilməlidir. Bu canlı yoxlamalar yalnız istifadəçinin test sessiyası ilə edilir.

Mənbə: https://github.com/supabase/auth/blob/master/internal/api/oauthserver/handlers.go

Railway runtime loglarında `[mcp] authentication rejected` axtarın.
`reason` yalnız sabit kod olur; token, secret, JWT claim-ləri və şəxsi məlumatlar
bu diaqnostik loga yazılmır. Giriş qaydaları dəyişmir.

- `TOKEN_VERIFICATION_FAILED`: tokenin imzası/etibarlılığı təsdiqlənmədi.
- `TOKEN_CLAIMS_INVALID_OR_EXPIRED`: tələb olunan claim yoxdur, issuer uyğun deyil və ya token bitib.
- `CLIENT_NOT_APPROVED`: OAuth client allowlist-də yoxdur.
- `AUDIENCE_MISMATCH`: konfiqurasiya edilmiş audience uyğun deyil.
- `FOUNDER_NOT_ACTIVE`: aktiv SUPER_ADMIN hesabı tapılmadı.
- `SESSION_ID_INVALID`: tokenin session ID-si yoxdur və ya formatı yanlışdır.
- `MFA_REQUIRED`: token `aal2` deyil və etibarlı MFA delegasiyası tapılmadı.
- `SESSION_EXPIRED_OR_REVOKED`: sessiya yoxdur, bitib, 7 günlük həddi keçib və ya ləğv edilib.

Token olmadan ilkin discovery sorğusunun 401 cavabı bu logu yaratmır və normaldır.
HTTP 401 təkbaşına MFA problemini sübut etmir. Bu logun olmaması da uğurlu
autentifikasiya demək deyil; header və infrastruktur xətaları ayrıca araşdırılmalıdır.

## Qəbul testləri

1. `Artmonia ERP-nin cari ümumi vəziyyətini göstər.`
2. `ERP data quality audit apar və yüksək riskləri prioritetləşdir.`
3. `Son MCP_READ audit qeydlərini göstər.`

Gözlənilən nəticə: ChatGPT yalnız elan edilmiş read-only tool-ları görür,
Founder olmayan hesab rədd edilir və hər tool icrası audit jurnalına düşür.

Rəsmi istinadlar:

- [OpenAI Developer Mode and MCP apps](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt)
- [Supabase OAuth Server](https://supabase.com/docs/guides/auth/oauth-server/getting-started)
