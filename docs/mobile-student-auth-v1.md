# Artmonia mobile student authentication v1

## Identity rule

`1 Supabase Auth user = 1 ERP student`.

The authoritative mapping is stored server-side in `erp.student_mobile_accounts`. The mobile client must never choose or trust an ERP `Student.id`. Authorization uses the Supabase access token (`auth.users.id`) and the ERP mapping.

## Account provisioning

1. ERP creates or updates a student with a unique email.
2. An authorized ERP user selects **Mobil hesab yarat**.
3. ERP calls Supabase Admin Auth on the server and sends the invitation.
4. The student opens the email link at `/mobile-auth/setup` and creates an 8+ character password.
5. The student signs in from mobile with email and password.
6. The first authenticated ERP request changes the mapping from `INVITED` to `ACTIVE`.

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
