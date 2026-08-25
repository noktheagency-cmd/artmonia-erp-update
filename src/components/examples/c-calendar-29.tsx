"use client";

import { useId, useState } from "react";
import {
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { az } from "date-fns/locale";
import { CalendarIcon, CheckIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type CompleteDateRange = { from: Date; to: Date };

type PatternProps = {
  initialRange: CompleteDateRange;
  canApply: boolean;
  onApply: (range: CompleteDateRange) => void;
};

type PresetKey = "week" | "month" | "three-months";

const presets: Array<{ key: PresetKey; label: string }> = [
  { key: "month", label: "Bu ay" },
  { key: "three-months", label: "Son 3 ay" },
  { key: "week", label: "Bu həftə" },
];

const monthNames = [
  "Yanvar",
  "Fevral",
  "Mart",
  "Aprel",
  "May",
  "İyun",
  "İyul",
  "Avqust",
  "Sentyabr",
  "Oktyabr",
  "Noyabr",
  "Dekabr",
] as const;

const shortMonthNames = [
  "yan",
  "fev",
  "mar",
  "apr",
  "may",
  "iyn",
  "iyl",
  "avq",
  "sen",
  "okt",
  "noy",
  "dek",
] as const;

export function Pattern({ initialRange, canApply, onApply }: PatternProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(initialRange.to);
  const [date, setDate] = useState<DateRange>(initialRange);

  function choosePreset(preset: PresetKey) {
    const nextRange = getPresetRange(preset, new Date());
    setDate(nextRange);
    setMonth(nextRange.to);
  }

  function apply() {
    if (!date.from || !date.to || !canApply) return;
    onApply({ from: date.from, to: date.to });
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            size="lg"
            className="group/pick-date h-[50px] max-w-48 justify-between px-3 hover:border-primary/30 hover:bg-background aria-expanded:border-primary/30 aria-expanded:bg-background aria-expanded:text-foreground"
            aria-label="ERP tarix aralığını seç"
          />
        }
      >
        <span className="hidden truncate lg:inline">{formatRange(date)}</span>
        <CalendarIcon data-icon="inline-end" aria-hidden="true" />
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="max-h-[calc(100dvh-1rem)] w-[19rem] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl p-0"
      >
        <Card size="sm" className="gap-0 p-0">
          <CardHeader className="border-b px-3 py-2.5">
            <CardTitle>Tarix aralığı</CardTitle>
            <CardDescription className="sr-only">
              Hazır aralıq seçin və ya təqvim üzərindən tarixləri qeyd edin.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-0">
            <Calendar
              mode="range"
              month={month}
              onMonthChange={setMonth}
              onSelect={(newDate) => {
                if (newDate) setDate(newDate);
              }}
              selected={date}
              locale={az}
              showOutsideDays={false}
              className="mx-auto p-2 [--cell-size:2rem]"
              classNames={{
                month: "flex w-full flex-col gap-2",
                week: "mt-1 flex w-full",
                weekday:
                  "flex-1 rounded-(--cell-radius) text-[0.7rem] font-medium text-muted-foreground/80 select-none",
                range_start:
                  "relative isolate z-0 rounded-l-(--cell-radius) bg-primary/10 after:absolute after:inset-y-0 after:right-0 after:w-4 after:bg-primary/10",
                range_middle: "rounded-none bg-primary/10",
                range_end:
                  "relative isolate z-0 rounded-r-(--cell-radius) bg-primary/10 after:absolute after:inset-y-0 after:left-0 after:w-4 after:bg-primary/10",
                day_button:
                  "text-xs data-[range-middle=true]:bg-primary/10 data-[range-middle=true]:text-primary data-[range-middle=true]:hover:bg-primary/15 data-[range-start=true]:shadow-sm data-[range-end=true]:shadow-sm",
              }}
              formatters={{
                formatCaption: (value) => `${monthNames[value.getMonth()]} ${value.getFullYear()}`,
                formatMonthDropdown: (value) => monthNames[value.getMonth()],
              }}
            />

            <div className="flex flex-wrap gap-1 border-t px-2 py-2">
              {presets.map((preset) => {
                const active = sameRange(date, getPresetRange(preset.key, new Date()));
                return (
                  <Button
                    key={preset.key}
                    type="button"
                    className={cn(
                      "flex-1 px-2",
                      active && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
                    )}
                    onClick={() => choosePreset(preset.key)}
                    size="xs"
                    variant="ghost"
                    aria-pressed={active}
                  >
                    {active ? <CheckIcon data-icon="inline-start" /> : null}
                    {preset.label}
                  </Button>
                );
              })}
            </div>
          </CardContent>

          <CardFooter className="justify-between gap-2 bg-background px-2.5 py-2">
            <span className="truncate text-xs text-muted-foreground">{formatRange(date)}</span>
            <Button type="button" size="xs" onClick={apply} disabled={!date.from || !date.to || !canApply}>
              Tətbiq et
            </Button>
          </CardFooter>
        </Card>
      </PopoverContent>
    </Popover>
  );
}

function getPresetRange(preset: PresetKey, reference: Date): CompleteDateRange {
  if (preset === "week") {
    return {
      from: startOfWeek(reference, { weekStartsOn: 1 }),
      to: endOfWeek(reference, { weekStartsOn: 1 }),
    };
  }
  if (preset === "three-months") {
    return {
      from: startOfMonth(subMonths(reference, 2)),
      to: endOfMonth(reference),
    };
  }
  return { from: startOfMonth(reference), to: endOfMonth(reference) };
}

function sameRange(first: DateRange, second: CompleteDateRange) {
  return Boolean(
    first.from
    && first.to
    && dateKey(first.from) === dateKey(second.from)
    && dateKey(first.to) === dateKey(second.to),
  );
}

function formatRange(range: DateRange) {
  if (!range.from) return "Tarix seçin";
  if (!range.to) return formatDate(range.from);
  return `${formatDate(range.from)} – ${formatDate(range.to)}`;
}

function formatDate(value: Date) {
  return `${value.getDate()} ${shortMonthNames[value.getMonth()]}`;
}

function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
