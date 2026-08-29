"use client";

import { useMemo, useState } from "react";
import { Check, Search, UsersRound } from "lucide-react";
import type { TaskData } from "@/modules/tasks/queries";
import styles from "./task-assignee-picker.module.css";

export function TaskAssigneePicker({
  employees,
}: {
  employees: TaskData["employees"];
}) {
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const visibleEmployees = useMemo(() => {
    const normalizedQuery = normalize(query);
    return normalizedQuery
      ? employees.filter((employee) => normalize(employee.label).includes(normalizedQuery))
      : employees;
  }, [employees, query]);

  function toggle(employeeId: string) {
    setSelectedIds((current) =>
      current.includes(employeeId)
        ? current.filter((id) => id !== employeeId)
        : [...current, employeeId],
    );
  }

  return (
    <fieldset className={styles.picker} aria-required="true">
      <legend>İşçilər</legend>
      <div className={styles.toolbar}>
        <label>
          <Search aria-hidden="true" size={15} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="İşçi axtar..."
            aria-label="Task üçün işçi axtar"
          />
        </label>
        <span><UsersRound aria-hidden="true" size={14} /> {selectedIds.length} seçilib</span>
      </div>
      <div className={styles.options} role="group" aria-label="Taskın icraçılarını seçin">
        {visibleEmployees.map((employee) => {
          const checked = selected.has(employee.value);
          return (
            <label className={checked ? styles.selected : undefined} key={employee.value}>
              <input
                type="checkbox"
                name="ownerUserIds"
                value={employee.value}
                checked={checked}
                onChange={() => toggle(employee.value)}
              />
              <span className={styles.check}>{checked ? <Check aria-hidden="true" size={13} /> : null}</span>
              <span>{employee.label}</span>
            </label>
          );
        })}
        {visibleEmployees.length === 0 ? <p>Uyğun işçi tapılmadı.</p> : null}
      </div>
      <small>Bir və ya bir neçə əməkdaş seçə bilərsiniz.</small>
    </fieldset>
  );
}

function normalize(value: string) {
  return value
    .toLocaleLowerCase("az")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("ə", "e")
    .replaceAll("ı", "i")
    .replaceAll("ş", "s")
    .replaceAll("ç", "c")
    .replaceAll("ğ", "g")
    .replaceAll("ö", "o")
    .replaceAll("ü", "u")
    .trim();
}
