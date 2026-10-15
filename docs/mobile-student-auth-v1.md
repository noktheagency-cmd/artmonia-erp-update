# Artmonia mobile student authentication v1

## Identity rule

An Auth user can be an ordinary community member without an ERP student.
For linked student accounts: `1 Supabase Auth user = 1 ERP student`.

The authoritative mapping is stored server-side in `erp.student_mobile_accounts`. The mobile client must never choose or trust an ERP `Student.id`. Authorization uses the Supabase access token (`auth.users.id`) and the ERP mapping.

## Account provisioning

The invitation-based creation flow is superseded by [mobile access v1](mobile-access-v1-handoff.md).

1. The user registers in the mobile application with their own password; Supabase Auth owns signup and email verification.
2. After email verification, the trusted gateway calls `POST /api/mobile/v1/me/access` with no body.
3. ERP retains an existing mapping or checks the authoritative verified Auth email against ERP student contact emails.
4. Exactly one unclaimed student and compatible phone information produce an `ACTIVE` mapping; conflicts stay `member / review_required`.
5. No match stays `member / not_found`. No ERP student or staff record is created.
6. A later ERP student record is discovered by the next access request.

ERP's old account-creation action now returns `FORBIDDEN` with a self-registration explanation and cannot invite or create Auth users. Existing passwords, mappings, setup links and authorized password-recovery/device-reset/disable controls remain supported.

ERP never stores, displays, or sends a plaintext password.

## Mobile sign-in

```ts
const { data, error } = await supabase.auth.signInWithPassword({
  email: loginEmail.trim().toLowerCase(),
  password,
})
```

Use only the project URL and publishable key in the application. Never put a Supabase secret/service-role key or `ERP_ATTENDANCE_SERVER_TOKEN` in Expo public variables.

## Attendance forwarding

The mobile app sends its normal Supabase `Authorization: Bearer <access_token>` request to the JWT-protected Edge Function. The Edge Function forwards the same token to ERP as:

```http
X-Student-Authorization: Bearer <access_token>
```

The Edge Function also sends its server-only ERP credential as:

```http
Authorization: Bearer <ERP_ATTENDANCE_SERVER_TOKEN>
```

ERP verifies both credentials, resolves the student from the JWT, and ignores client-controlled identity data.

## Account states

- `INVITED`: invite sent; password/setup has not yet been observed by ERP.
- `ACTIVE`: a valid authenticated mobile request has been received.
- `DISABLED`: ERP blocks access even if an older Supabase JWT has not expired yet.

ERP supports sending a new setup/reset link, disabling access, and enabling access from the student's profile.

`INVITED` is a legacy state only; new automatic mappings start `ACTIVE`. Academic APIs require a mapping, verified email, a live Auth session, an unbanned user, and the existing student lifecycle checks. Editable Auth metadata never grants ERP employee/admin permissions.
