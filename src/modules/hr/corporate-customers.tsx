"use client";

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
  SlidersHorizontal,
  Trash2,
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
}: {
  data: CorporateCustomerData;
  onCreate: () => void;
  onEdit: (customer: CorporateCustomerRow) => void;
  onDelete: (customer: CorporateCustomerRow) => void;
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
        <select
          aria-label="Şirkət statusu"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="all">Bütün statuslar</option>
          {Object.entries(statusMeta).map(([value, meta]) => (
            <option value={value} key={value}>{meta.label}</option>
          ))}
        </select>
        <select
          aria-label="Aylıq büdcə aralığı"
          value={budget}
          onChange={(event) => {
            setBudget(event.target.value);
            setPage(1);
          }}
        >
          <option value="all">Bütün büdcələr</option>
          <option value="under-5000">5 000 ₼-dək</option>
          <option value="5000-10000">5 000–10 000 ₼</option>
          <option value="over-10000">10 000 ₼-dan çox</option>
        </select>
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
                {data.permissions.canManage ? <th><span className="sr-only">Əməliyyatlar</span></th> : null}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((customer) => (
                <CorporateCustomerTableRow
                  key={customer.id}
                  customer={customer}
                  canManage={data.permissions.canManage}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={data.permissions.canManage ? 8 : 7} className="corporate-empty-cell">
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
  onEdit,
  onDelete,
}: {
  customer: CorporateCustomerRow;
  canManage: boolean;
  onEdit: (customer: CorporateCustomerRow) => void;
  onDelete: (customer: CorporateCustomerRow) => void;
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
          </span>
        </div>
      </td>
      <td className="corporate-money"><strong>{formatCurrency(customer.monthlyBudget)}</strong></td>
      <td className="corporate-money">{customer.contractValue === null ? "—" : formatCurrency(customer.contractValue)}</td>
      <td className="corporate-payment-date">{formatDate(customer.paymentDate)}</td>
      <td><Badge variant="outline" className={`corporate-status ${statusMeta[customer.status].className}`}>{statusMeta[customer.status].label}</Badge></td>
      <td className="corporate-updated">{formatUpdatedAt(customer.updatedAt)}</td>
      {canManage ? (
        <td className="corporate-action-cell">
          <details className="corporate-row-menu">
            <summary aria-label={`${customer.name} üçün əməliyyatlar`}><MoreHorizontal /></summary>
            <div>
              <button type="button" onClick={() => onEdit(customer)}><Pencil /> Redaktə et</button>
              <button type="button" className="is-danger" onClick={() => onDelete(customer)}><Trash2 /> Sil</button>
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
              <select name="status" defaultValue={customer?.status ?? "ACTIVE"}>
                {Object.entries(statusMeta).map(([value, meta]) => <option value={value} key={value}>{meta.label}</option>)}
              </select>
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
                    disabled={contacts.length === 1}
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
                      <Input value={contact.phone} onChange={(event) => updateContact(contact.key, "phone", event.target.value)} type="tel" maxLength={40} placeholder="+994 50 123 45 67" />
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

function emptyContact(key: string, isPrimary: boolean): ContactDraft {
  return { id: "", key, fullName: "", position: "", phone: "", email: "", isPrimary };
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
