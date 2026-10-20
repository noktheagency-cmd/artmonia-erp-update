"use client";

import Link from "next/link";
import type { Route } from "next";
import {
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  ContactRound,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserPlus,
  WalletCards,
} from "lucide-react";
import {
  useDeferredValue,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FormSelect } from "@/components/ui/select";
import type {
  CorporateContactRow,
  CorporateCustomerData,
  CorporateCustomerRow,
  CorporateCustomerStatus,
} from "@/modules/hr/corporate-customer-data";
import "./corporate-customers.css";

const PAGE_SIZE = 8;

const statusMeta: Record<CorporateCustomerStatus, { label: string; className: string }> = {
  ACTIVE: { label: "Aktiv", className: "is-active" },
  POTENTIAL: { label: "Potensial", className: "is-potential" },
  PAUSED: { label: "Dayandırılıb", className: "is-paused" },
  INACTIVE: { label: "Deaktiv", className: "is-inactive" },
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const azMonthNames = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avq", "sen", "okt", "noy", "dek"];

type ContactDraft = CorporateContactRow & { key: string };

export function CorporateCustomerWorkspace({
  data,
  onCreate,
  onEdit,
  onDelete,
  onManageAccounts,
}: {
  data: CorporateCustomerData;
  onCreate: () => void;
  onEdit: (customer: CorporateCustomerRow) => void;
  onDelete: (customer: CorporateCustomerRow) => void;
  onManageAccounts: (customer: CorporateCustomerRow) => void;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [status, setStatus] = useState("all");
  const [budget, setBudget] = useState("all");
  const [page, setPage] = useState(1);

  const filteredCustomers = useMemo(() => {
    const needle = deferredQuery.trim().toLocaleLowerCase("az");
    return data.customers.filter((customer) => {
      const searchable = [
        customer.name,
        customer.taxId,
        ...customer.contacts.flatMap((contact) => [
          contact.fullName,
          contact.position,
          contact.phone,
          contact.email,
        ]),
      ].join(" ").toLocaleLowerCase("az");

      return (
        (!needle || searchable.includes(needle)) &&
        (status === "all" || customer.status === status) &&
        matchesBudget(customer.monthlyBudget, budget)
      );
    });
  }, [budget, data.customers, deferredQuery, status]);

  const pageCount = Math.max(1, Math.ceil(filteredCustomers.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filteredCustomers.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  function clearFilters() {
    setQuery("");
    setStatus("all");
    setBudget("all");
    setPage(1);
  }

  return (
    <div className="corporate-workspace">
      <div className="corporate-filter-band">
        <label className="corporate-search">
          <Search aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Şirkət, VÖEN və ya əlaqəli şəxs axtar..."
          />
        </label>
        <FormSelect
          name="corporateStatus"
          aria-label="Şirkət statusu"
          value={status}
          onValueChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
          emptyLabel="Bütün statuslar"
          emptyValue="all"
          options={Object.entries(statusMeta).map(([value, meta]) => ({
            value,
            label: meta.label,
          }))}
          className="corporate-filter-select"
        />
        <FormSelect
          name="corporateBudget"
          aria-label="Aylıq büdcə aralığı"
          value={budget}
          onValueChange={(value) => {
            setBudget(value);
            setPage(1);
          }}
          emptyLabel="Bütün büdcələr"
          emptyValue="all"
          options={[
            { value: "under-5000", label: "5 000 ₼-dək" },
            { value: "5000-10000", label: "5 000–10 000 ₼" },
            { value: "over-10000", label: "10 000 ₼-dan çox" },
          ]}
          className="corporate-filter-select"
        />
        <Button variant="ghost" onClick={clearFilters}>
          <SlidersHorizontal data-icon="inline-start" /> Təmizlə
        </Button>
        <span className="corporate-result-count">{filteredCustomers.length} nəticə</span>
      </div>

      <section className="corporate-kpi-grid" aria-label="Korporativ müştəri göstəriciləri">
        <CorporateKpi
          icon={<Building2 />}
          label="Aktiv şirkətlər"
          value={String(data.stats.activeCustomers)}
          tone="green"
        />
        <CorporateKpi
          icon={<WalletCards />}
          label="Aylıq büdcə"
          value={formatCurrency(data.stats.monthlyBudget)}
          tone="violet"
        />
        <CorporateKpi
          icon={<FileText />}
          label="Müqavilə dəyəri"
          value={formatCurrency(data.stats.contractValue)}
          tone="orange"
        />
        <CorporateKpi
          icon={<ContactRound />}
          label="Əlaqəli şəxslər"
          value={String(data.stats.contacts)}
          tone="amber"
        />
      </section>

      {data.isTruncated ? (
        <p className="corporate-limit-note" role="status">
          İlk 250 şirkət göstərilir. Daha dəqiq nəticə üçün filtrlərdən istifadə edin.
        </p>
      ) : null}

      <section className="corporate-table-surface">
        <div className="corporate-table-scroll" data-erp-table-scroll="">
          <table>
            <thead>
              <tr>
                <th>Şirkət</th>
                <th>Əlaqəli şəxslər</th>
                <th>Aylıq büdcə</th>
                <th>Müqavilə dəyəri</th>
                <th>Ödəniş tarixi</th>
                <th>Status</th>
                <th>Son yenilənmə</th>
                {data.permissions.canManage || data.permissions.canManageAccounts ? <th className="corporate-action-cell"><span className="sr-only">Əməliyyatlar</span></th> : null}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((customer) => (
                <CorporateCustomerTableRow
                  key={customer.id}
                  customer={customer}
                  canManage={data.permissions.canManage}
                  canManageAccounts={data.permissions.canManageAccounts}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onManageAccounts={onManageAccounts}
                />
              ))}
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={data.permissions.canManage || data.permissions.canManageAccounts ? 8 : 7} className="corporate-empty-cell">
                    <Building2 />
                    <strong>{data.customers.length ? "Uyğun şirkət tapılmadı" : "Korporativ müştəri yoxdur"}</strong>
                    <span>{data.customers.length ? "Axtarış və filtrləri dəyişin." : "İlk şirkəti və əlaqəli şəxsləri əlavə edin."}</span>
                    {!data.customers.length && data.permissions.canManage ? (
                      <Button size="sm" onClick={onCreate}><Plus /> Şirkət əlavə et</Button>
                    ) : null}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {filteredCustomers.length > 0 ? (
          <footer className="corporate-pagination">
            <span>
              {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredCustomers.length)} / {filteredCustomers.length} nəticə
            </span>
            <div>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Əvvəlki səhifə"
                disabled={currentPage === 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                <ChevronLeft />
              </Button>
              <span>{currentPage} / {pageCount}</span>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Növbəti səhifə"
                disabled={currentPage === pageCount}
                onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
              >
                <ChevronRight />
              </Button>
            </div>
          </footer>
        ) : null}
      </section>
    </div>
  );
}

function CorporateKpi({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "green" | "violet" | "orange" | "amber";
}) {
  return (
    <article className={`corporate-kpi is-${tone}`}>
      <span aria-hidden="true">{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function CorporateCustomerTableRow({
  customer,
  canManage,
  canManageAccounts,
  onEdit,
  onDelete,
  onManageAccounts,
}: {
  customer: CorporateCustomerRow;
  canManage: boolean;
  canManageAccounts: boolean;
  onEdit: (customer: CorporateCustomerRow) => void;
  onDelete: (customer: CorporateCustomerRow) => void;
  onManageAccounts: (customer: CorporateCustomerRow) => void;
}) {
  const primaryContact = customer.contacts.find((contact) => contact.isPrimary) ?? customer.contacts[0];

  return (
    <tr>
      <td>
        <button
          className="corporate-company-button"
          type="button"
          disabled={!canManage}
          onClick={() => onEdit(customer)}
        >
          <span className="corporate-company-mark"><Building2 /></span>
          <span>
            <strong>{customer.name}</strong>
            <small>{customer.taxId ? `VÖEN: ${customer.taxId}` : "VÖEN qeyd edilməyib"}</small>
          </span>
        </button>
      </td>
      <td>
        <div className="corporate-contacts-cell">
          <span className="corporate-contact-avatars" aria-hidden="true">
            {customer.contacts.slice(0, 3).map((contact) => (
              <i key={contact.id}>{initials(contact.fullName)}</i>
            ))}
            {customer.contacts.length > 3 ? <i>+{customer.contacts.length - 3}</i> : null}
          </span>
          <span>
            <strong>{primaryContact?.fullName ?? "—"}</strong>
            <small>{primaryContact ? `${primaryContact.position || "Əlaqəli şəxs"} · ${customer.contacts.length} nəfər` : "Əlaqəli şəxs yoxdur"}</small>
            {customer.contacts.some((contact) => contact.accountStatus !== "NOT_CREATED") ? <em className="corporate-account-indicator"><ShieldCheck /> Giriş hesabı var</em> : null}
          </span>
        </div>
      </td>
      <td className="corporate-money"><strong>{formatCurrency(customer.monthlyBudget)}</strong></td>
      <td className="corporate-money">{customer.contractValue === null ? "—" : formatCurrency(customer.contractValue)}</td>
      <td className="corporate-payment-date">{formatDate(customer.paymentDate)}</td>
      <td><Badge variant="outline" className={`corporate-status ${statusMeta[customer.status].className}`}>{statusMeta[customer.status].label}</Badge></td>
      <td className="corporate-updated">{formatUpdatedAt(customer.updatedAt)}</td>
      {canManage || canManageAccounts ? (
        <td className="corporate-action-cell">
          <details className="corporate-row-menu">
            <summary aria-label={`${customer.name} üçün əməliyyatlar`}><MoreHorizontal /></summary>
            <div>
              {canManageAccounts ? <button type="button" onClick={() => onManageAccounts(customer)}><ShieldCheck /> Giriş hesabları</button> : null}
              {canManage ? <button type="button" onClick={() => onEdit(customer)}><Pencil /> Redaktə et</button> : null}
              {canManage ? <button type="button" className="is-danger" onClick={() => onDelete(customer)}><Trash2 /> Sil</button> : null}
            </div>
          </details>
        </td>
      ) : null}
    </tr>
  );
}

export function CorporateCustomerDialog({
  customer,
  pending,
  onClose,
  onSubmit,
}: {
  customer?: CorporateCustomerRow;
  pending: boolean;
  onClose: () => void;
  onSubmit: (formData: FormData) => void;
}) {
  const contactSequence = useRef((customer?.contacts.length ?? 1) + 1);
  const [contacts, setContacts] = useState<ContactDraft[]>(() =>
    customer?.contacts.length
      ? customer.contacts.map((contact) => ({ ...contact, key: contact.id }))
      : [emptyContact("new-contact-1", true)],
  );

  function updateContact(key: string, field: keyof CorporateContactRow, value: string | boolean) {
    setContacts((current) => current.map((contact) => {
      if (field === "isPrimary" && value === true) {
        return { ...contact, isPrimary: contact.key === key };
      }
      return contact.key === key ? { ...contact, [field]: value } : contact;
    }));
  }

  function addContact() {
    const key = `new-contact-${contactSequence.current++}`;
    setContacts((current) => [...current, emptyContact(key, current.length === 0)]);
  }

  function removeContact(key: string) {
    setContacts((current) => {
      if (current.length === 1) return current;
      const removed = current.find((contact) => contact.key === key);
      const next = current.filter((contact) => contact.key !== key);
      return removed?.isPrimary
        ? next.map((contact, index) => ({ ...contact, isPrimary: index === 0 }))
        : next;
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("contacts", JSON.stringify(contacts.map((contact) => ({
      ...(contact.id ? { id: contact.id } : {}),
      fullName: contact.fullName,
      position: contact.position,
      phone: contact.phone,
      email: contact.email,
      isPrimary: contact.isPrimary,
    }))));
    onSubmit(formData);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="corporate-customer-dialog">
        <DialogHeader className="corporate-dialog-header">
          <span className="corporate-dialog-icon"><Building2 /></span>
          <div>
            <DialogTitle>{customer ? "Şirkəti redaktə et" : "Yeni şirkət"}</DialogTitle>
            <DialogDescription>Şirkət və əlaqəli şəxslərin məlumatlarını əlavə edin.</DialogDescription>
          </div>
        </DialogHeader>
        <form className="corporate-dialog-form" onSubmit={handleSubmit}>
          {customer ? <input type="hidden" name="id" value={customer.id} /> : null}
          <section className="corporate-company-fields">
            <h3>Şirkət məlumatları</h3>
            <label>
              <span>Şirkət adı <b>*</b></span>
              <Input name="name" defaultValue={customer?.name} minLength={2} maxLength={160} required autoFocus />
            </label>
            <label>
              <span>VÖEN</span>
              <Input name="taxId" defaultValue={customer?.taxId} inputMode="numeric" pattern="[0-9]{10}" maxLength={10} placeholder="Məsələn: 1406789123" />
            </label>
            <label>
              <span>Status</span>
              <FormSelect
                name="status"
                defaultValue={customer?.status ?? "ACTIVE"}
                options={Object.entries(statusMeta).map(([value, meta]) => ({
                  value,
                  label: meta.label,
                }))}
              />
            </label>
            <div className="corporate-money-fields">
              <label>
                <span>Aylıq büdcə <b>*</b></span>
                <span className="corporate-money-input"><Input name="monthlyBudget" type="number" defaultValue={customer?.monthlyBudget} min="0.01" max="1000000000" step="0.01" placeholder="Məsələn: 8 500" required /><i>₼</i></span>
              </label>
              <label>
                <span>Müqavilə dəyəri <small>İstəyə bağlı</small></span>
                <span className="corporate-money-input"><Input name="contractValue" type="number" defaultValue={customer?.contractValue ?? ""} min="0" max="1000000000" step="0.01" placeholder="Məsələn: 42 000" /><i>₼</i></span>
              </label>
            </div>
            <label>
              <span>Ödəniş tarixi <small>İstəyə bağlı</small></span>
              <DatePicker
                name="paymentDate"
                defaultValue={customer?.paymentDate}
                aria-label="Ödəniş tarixi"
                popoverPlacement="floating"
              />
            </label>
            <label>
              <span>Qeyd</span>
              <textarea name="note" defaultValue={customer?.note} maxLength={2000} placeholder="Əlavə qeydlər (istəyə bağlı)" />
            </label>
          </section>

          <section className="corporate-contact-fields">
            <header>
              <div>
                <h3>Əlaqəli şəxslər</h3>
                <p>Şirkətlə əlaqə saxlanılacaq şəxsləri qeyd edin.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addContact} disabled={contacts.length >= 20}>
                <Plus /> Şəxs əlavə et
              </Button>
            </header>
            <div className="corporate-contact-list">
              {contacts.map((contact, index) => (
                <fieldset className="corporate-contact-block" key={contact.key}>
                  <legend>Əlaqəli şəxs {index + 1}</legend>
                  <label className="corporate-primary-contact">
                    <input
                      type="radio"
                      name="primary-contact"
                      checked={contact.isPrimary}
                      onChange={() => updateContact(contact.key, "isPrimary", true)}
                    />
                    <span>Əsas əlaqə</span>
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="corporate-remove-contact"
                    aria-label={`Əlaqəli şəxs ${index + 1}-i sil`}
                    disabled={contacts.length === 1 || Boolean(contact.userId)}
                    title={contact.userId ? "ERP hesabı olan əlaqəli şəxs silinə bilməz" : undefined}
                    onClick={() => removeContact(contact.key)}
                  >
                    <Trash2 />
                  </Button>
                  <div className="corporate-contact-grid">
                    <label>
                      <span>Ad və soyad <b>*</b></span>
                      <Input value={contact.fullName} onChange={(event) => updateContact(contact.key, "fullName", event.target.value)} minLength={2} maxLength={120} required />
                    </label>
                    <label>
                      <span>Vəzifə</span>
                      <Input value={contact.position} onChange={(event) => updateContact(contact.key, "position", event.target.value)} maxLength={100} />
                    </label>
                    <label>
                      <span>Telefon</span>
                      <Input value={contact.phone} onChange={(event) => updateContact(contact.key, "phone", event.target.value)} type="tel" name="phone" placeholder="+994501234567" />
                    </label>
                    <label>
                      <span>E-poçt</span>
                      <Input value={contact.email} onChange={(event) => updateContact(contact.key, "email", event.target.value)} type="email" maxLength={254} />
                    </label>
                  </div>
                </fieldset>
              ))}
            </div>
          </section>

          <DialogFooter className="corporate-dialog-footer">
            <Button type="button" variant="outline" onClick={onClose}>Ləğv et</Button>
            <Button type="submit" disabled={pending}>
              <Check /> {pending ? "Yadda saxlanılır..." : "Şirkəti yadda saxla"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CorporateCustomerDeleteDialog({
  customer,
  pending,
  onClose,
  onConfirm,
}: {
  customer: CorporateCustomerRow;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="hr-confirm-dialog">
        <DialogHeader>
          <DialogTitle>Şirkəti silmək?</DialogTitle>
          <DialogDescription>
            {customer.name} və onun {customer.contacts.length} əlaqəli şəxsi həmişəlik silinəcək.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Ləğv et</Button>
          <Button variant="destructive" disabled={pending} onClick={onConfirm}>Sil</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CorporateContactAccountsDialog({
  customer,
  roleOptions,
  pending,
  onClose,
  onSubmit,
}: {
  customer: CorporateCustomerRow;
  roleOptions: CorporateCustomerData["accountRoleOptions"];
  pending: boolean;
  onClose: () => void;
  onSubmit: (formData: FormData) => void;
}) {
  const [selectedId, setSelectedId] = useState(customer.contacts[0]?.id ?? "");
  const selected = customer.contacts.find((contact) => contact.id === selectedId) ?? customer.contacts[0] ?? null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="corporate-account-dialog">
        <DialogHeader className="corporate-dialog-header">
          <span className="corporate-dialog-icon"><ShieldCheck /></span>
          <div>
            <DialogTitle>Əlaqəli şəxslərin giriş hesabları</DialogTitle>
            <DialogDescription>{customer.name} üçün login məlumatlarını və icazə rollarını idarə edin.</DialogDescription>
          </div>
        </DialogHeader>
        <div className="corporate-account-layout">
          <nav aria-label="Əlaqəli şəxslər">
            {customer.contacts.map((contact) => (
              <button key={contact.id} type="button" className={contact.id === selected?.id ? "is-selected" : undefined} onClick={() => setSelectedId(contact.id)}>
                <i>{initials(contact.fullName)}</i>
                <span><strong>{contact.fullName}</strong><small>{contact.position || "Əlaqəli şəxs"}</small></span>
                <AccountDot status={contact.accountStatus} />
              </button>
            ))}
          </nav>
          <section className="corporate-account-detail">
            {selected ? (
              <>
                <header>
                  <div><small>Korporativ profil</small><h3>{selected.fullName}</h3><p>{selected.position || "Əlaqəli şəxs"} · {customer.name}</p></div>
                  <AccountLabel status={selected.accountStatus} />
                </header>
                {selected.accountStatus === "NOT_CREATED" ? (
                  <CorporateAccountCreationForm key={selected.id} contact={selected} roleOptions={roleOptions} pending={pending} onSubmit={onSubmit} />
                ) : (
                  <div className="corporate-existing-account">
                    <dl>
                      <div><dt>Login e-poçtu</dt><dd>{selected.loginEmail ?? "—"}</dd></div>
                      <div><dt>Sistem rolları</dt><dd>{selected.roles.map((role) => role.name).join(", ") || "Rol yoxdur"}</dd></div>
                    </dl>
                    <p>Parol, login e-poçtu, rollar, aktiv sessiyalar və hesab statusu Audit və təhlükəsizlik bölməsində idarə olunur.</p>
                    <Link className="corporate-account-audit-link" href={`/audit?tab=accounts&profileType=CORPORATE_CONTACT&profileId=${selected.id}` as Route}><ShieldCheck /> Audit və təhlükəsizlikdə aç</Link>
                  </div>
                )}
              </>
            ) : <div className="corporate-account-empty">Əlaqəli şəxs tapılmadı.</div>}
          </section>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Bağla</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CorporateAccountCreationForm({
  contact,
  roleOptions,
  pending,
  onSubmit,
}: {
  contact: CorporateContactRow;
  roleOptions: CorporateCustomerData["accountRoleOptions"];
  pending: boolean;
  onSubmit: (formData: FormData) => void;
}) {
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (!roleIds.length) { setError("Ən az bir sistem rolu seçilməlidir."); return; }
    if (!strongPassword(password)) { setError("Parol ən az 16 simvol, böyük/kiçik hərf, rəqəm və xüsusi simvol daxil etməlidir."); return; }
    if (password !== form.get("confirmation")) { setError("Parollar eyni deyil."); return; }
    form.delete("confirmation");
    form.set("roleIds", JSON.stringify(roleIds));
    onSubmit(form);
  }

  return (
    <form className="corporate-account-form" onSubmit={submit}>
      <input type="hidden" name="profileType" value="CORPORATE_CONTACT" />
      <input type="hidden" name="profileId" value={contact.id} />
      <label><span>Login e-poçtu</span><Input name="loginEmail" type="email" defaultValue={contact.email} required autoComplete="off" /></label>
      <fieldset><legend>İcazə rolları</legend><div>{roleOptions.map((role) => <label key={role.id}><input type="checkbox" checked={roleIds.includes(role.id)} onChange={() => setRoleIds((current) => current.includes(role.id) ? current.filter((id) => id !== role.id) : [...current, role.id])} /><span>{role.name}</span></label>)}</div></fieldset>
      <div className="corporate-account-passwords"><label><span>İlkin parol</span><Input name="password" type="password" minLength={16} maxLength={72} required autoComplete="new-password" /></label><label><span>Parolu təsdiqlə</span><Input name="confirmation" type="password" minLength={16} maxLength={72} required autoComplete="new-password" /></label></div>
      {error ? <p className="corporate-account-error">{error}</p> : null}
      <Button type="submit" disabled={pending || !roleOptions.length}><UserPlus /> {pending ? "Hesab yaradılır..." : "Giriş hesabı yarat"}</Button>
    </form>
  );
}

function AccountDot({ status }: { status: CorporateContactRow["accountStatus"] }) {
  return <em className="corporate-account-dot" data-status={status} aria-label={status === "ACTIVE" ? "Aktiv hesab" : status === "DISABLED" ? "Deaktiv hesab" : "Hesab yaradılmayıb"} />;
}

function AccountLabel({ status }: { status: CorporateContactRow["accountStatus"] }) {
  return <span className="corporate-account-label" data-status={status}><i />{status === "ACTIVE" ? "Aktiv hesab" : status === "DISABLED" ? "Deaktiv hesab" : "Hesab yaradılmayıb"}</span>;
}

function strongPassword(value: string) {
  return value.length >= 16 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
}

function emptyContact(key: string, isPrimary: boolean): ContactDraft {
  return { id: "", key, fullName: "", position: "", phone: "", email: "", isPrimary, userId: null, loginEmail: null, accountStatus: "NOT_CREATED", roles: [] };
}

function matchesBudget(value: number, filter: string) {
  if (filter === "under-5000") return value < 5_000;
  if (filter === "5000-10000") return value >= 5_000 && value <= 10_000;
  if (filter === "over-10000") return value > 10_000;
  return true;
}

function formatCurrency(value: number) {
  return `${currencyFormatter.format(value).replaceAll(",", " ")} ₼`;
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  const bakuTime = new Date(date.getTime() + 4 * 60 * 60 * 1000);
  const day = String(bakuTime.getUTCDate()).padStart(2, "0");
  const month = azMonthNames[bakuTime.getUTCMonth()];
  const year = bakuTime.getUTCFullYear();
  const hour = String(bakuTime.getUTCHours()).padStart(2, "0");
  const minute = String(bakuTime.getUTCMinutes()).padStart(2, "0");

  return `${day} ${month} ${year}, ${hour}:${minute}`;
}

function formatDate(value: string) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("az") || "Ş";
}
