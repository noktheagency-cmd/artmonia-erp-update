import "server-only";

import { HrCorporateCustomerStatus } from "@/generated/prisma/client";
import { requireErpActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";

export type CorporateCustomerStatus = "ACTIVE" | "POTENTIAL" | "PAUSED" | "INACTIVE";

export type CorporateContactRow = {
  id: string;
  fullName: string;
  position: string;
  phone: string;
  email: string;
  isPrimary: boolean;
};

export type CorporateCustomerRow = {
  id: string;
  name: string;
  taxId: string;
  status: CorporateCustomerStatus;
  monthlyBudget: number;
  contractValue: number | null;
  note: string;
  contacts: CorporateContactRow[];
  updatedAt: string;
};

export type CorporateCustomerData = {
  customers: CorporateCustomerRow[];
  stats: {
    activeCustomers: number;
    monthlyBudget: number;
    contractValue: number;
    contacts: number;
    totalCustomers: number;
  };
  isTruncated: boolean;
  permissions: {
    canRead: boolean;
    canManage: boolean;
    canExport: boolean;
  };
};

const MAX_CUSTOMERS = 250;

export async function getCorporateCustomerData(): Promise<CorporateCustomerData> {
  const actor = await requireErpActor();

  if (!actor.permissions.has("hr.corporate.read")) {
    return emptyCorporateCustomerData();
  }

  const prisma = getPrisma();
  const [customerRows, totals, activeCustomers, contactCount] = await Promise.all([
    prisma.hrCorporateCustomer.findMany({
      select: {
        id: true,
        name: true,
        taxId: true,
        status: true,
        monthlyBudget: true,
        contractValue: true,
        note: true,
        updatedAt: true,
        contacts: {
          select: {
            id: true,
            fullName: true,
            position: true,
            phone: true,
            email: true,
            isPrimary: true,
          },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          take: 20,
        },
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: MAX_CUSTOMERS + 1,
    }),
    prisma.hrCorporateCustomer.aggregate({
      _count: { _all: true },
      _sum: { monthlyBudget: true, contractValue: true },
    }),
    prisma.hrCorporateCustomer.count({
      where: { status: HrCorporateCustomerStatus.ACTIVE },
    }),
    prisma.hrCorporateContact.count(),
  ]);

  const isTruncated = customerRows.length > MAX_CUSTOMERS;
  const customers = customerRows.slice(0, MAX_CUSTOMERS).map((customer) => ({
    id: customer.id,
    name: customer.name,
    taxId: customer.taxId ?? "",
    status: customer.status,
    monthlyBudget: Number(customer.monthlyBudget),
    contractValue: customer.contractValue === null ? null : Number(customer.contractValue),
    note: customer.note ?? "",
    contacts: customer.contacts.map((contact) => ({
      id: contact.id,
      fullName: contact.fullName,
      position: contact.position ?? "",
      phone: contact.phone ?? "",
      email: contact.email ?? "",
      isPrimary: contact.isPrimary,
    })),
    updatedAt: customer.updatedAt.toISOString(),
  }));

  return {
    customers,
    isTruncated,
    stats: {
      activeCustomers,
      monthlyBudget: Number(totals._sum.monthlyBudget ?? 0),
      contractValue: Number(totals._sum.contractValue ?? 0),
      contacts: contactCount,
      totalCustomers: totals._count._all,
    },
    permissions: {
      canRead: true,
      canManage: actor.permissions.has("hr.corporate.manage"),
      canExport: actor.permissions.has("report.export"),
    },
  };
}

function emptyCorporateCustomerData(): CorporateCustomerData {
  return {
    customers: [],
    stats: {
      activeCustomers: 0,
      monthlyBudget: 0,
      contractValue: 0,
      contacts: 0,
      totalCustomers: 0,
    },
    isTruncated: false,
    permissions: { canRead: false, canManage: false, canExport: false },
  };
}
