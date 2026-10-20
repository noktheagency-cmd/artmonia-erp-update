"use client";

import { useContext } from "react";
import { createPortal } from "react-dom";
import { HeaderActionsContext } from "@/components/layout/header-actions-context";

export function DashboardGreeting({ name }: { name: string }) {
  const headerActionsTarget = useContext(HeaderActionsContext);
  if (!headerActionsTarget) return null;

  return createPortal(
    <div className="owner-dashboard-greeting">
      <h1 id="owner-dashboard-title"><span>Salam,</span> {name}</h1>
    </div>,
    headerActionsTarget,
  );
}
