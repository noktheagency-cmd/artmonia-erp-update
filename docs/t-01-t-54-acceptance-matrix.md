# T-01…T-54 acceptance matrix

Source: `Artmonia-ERP-Biznes-Mentiqi-2026-10-18.pdf` §21.

Run automated pack + BK-25 gap check:

```bash
npm run test:acceptance
```

Catalog source of truth: `src/modules/acceptance/t-cases.ts`.

| ID | Mode | Event | Expected |
|----|------|-------|----------|
| T-01 | automated | Ödənişsiz ilkin kart | Slot gözləyir; satış 0 |
| T-02 | automated | 19 AZN + müqavilə | Satış yox |
| T-03 | automated | 20 AZN, müqavilə yox | Satış yox |
| T-04 | automated | 20 AZN + müqavilə | Satış var; aktiv PRESENT ilə |
| T-05 | automated | Qalıq ödəniş | Eyni satış |
| T-06 | automated | Slot + plan | Aktiv deyil |
| T-07 | manual | Qalıq + PRESENT | Blok |
| T-08 | automated | Tam haqq + PRESENT | ACTIVE |
| T-09 | automated | Plan buraxılıb, sonra PRESENT | Tarix sürüşmür |
| T-10 | automated | Görüş var, aylıq dərs yox | Billing yox |
| T-11 | manual | Double-complete | Bir satış |
| T-12 | manual | Idempotent ödəniş | İkinci satış yox |
| T-13 | manual | Profil redaktə | Billing/satış sabit |
| T-14 | automated | Qeydiyyatda iştirak təsdiqi | Dialog policy |
| T-15 | manual | İkinci iştirak yox | UI |
| T-16 | automated | Birbaşa qəbul | Görüş məcburi deyil |
| T-17 | manual | NO_SHOW sonra birbaşa | UI |
| T-18 | manual | Nəticəsiz görüş + birbaşa | UI |
| T-19 | automated | Konsultasiya yetər | Sınaq məcburi deyil |
| T-20 | automated | Konsultasiya+sınaq = Görüş | Label/report |
| T-21…T-24 | manual | Görüş plan/nəticə | UI |
| T-25…T-27 | manual | Faktura/dövr | UI/DB |
| T-28 | automated | Aylıq yeniləmə ≠ satış | Policy |
| T-29 | automated | Absent tarix sürüşdürmür | Payroll denom |
| T-30 | automated | Freeze billing davam | BK-10 |
| T-31 | manual | Freeze borc | UI |
| T-32 | automated | 14 gün auto-stop yox | BK-11 |
| T-33 | automated | Manual STOP | Yer azad |
| T-34 | automated | Freeze return ≠ satış | Policy |
| T-35 | automated | STOPPED return = satış | RETURN |
| T-36 | automated | Köhnə borc ≠ yeni satış | Policy |
| T-37 | automated | İlk ay upgrade blok | BK-15 |
| T-38 | automated | 2-ci dövr upgrade OK | BK-15 |
| T-39 | manual | Birdəfəlik dərs | UI |
| T-40 | manual | 3 zəng / 1 unique | UI |
| T-41 | automated | WA sent ≠ əlaqə | Policy |
| T-42 | automated | WA reply = əlaqə | Policy |
| T-43 | manual | Sonra telefon | UI |
| T-44 | automated | Sale by qualified_at | SQL |
| T-45 | manual | As-of hesabat | UI |
| T-46 | automated | Aylıq cəm | SQL helper |
| T-47 | automated | 0 lead → 0% | Math |
| T-48…T-54 | manual | Kart/filtr/RBAC/cache | UI |

## BK-25

```bash
npm run db:backfill-course-sales
npm run db:backfill-course-sales:apply   # after review
```

`test:acceptance` fails if tracked gaps remain.
