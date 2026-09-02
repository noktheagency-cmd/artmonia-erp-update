import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { currentBakuDateValue, DatePicker } from "./date-picker";

test("uses the current calendar day in Baku when UTC is still on the previous day", () => {
  assert.equal(
    currentBakuDateValue(new Date("2026-09-01T20:30:00.000Z")),
    "2026-09-02",
  );
});

test("keeps the same day before the Baku midnight boundary", () => {
  assert.equal(
    currentBakuDateValue(new Date("2026-09-01T19:59:59.000Z")),
    "2026-09-01",
  );
});

test("renders today's Baku date when a popup date has no default value", () => {
  const today = currentBakuDateValue();
  const html = renderToStaticMarkup(createElement(DatePicker, { name: "date" }));

  assert.match(html, new RegExp(`value="${today}"`));
  assert.match(html, new RegExp(today.split("-").reverse().join("\\.")));
});

test("preserves an existing date in edit popups", () => {
  const html = renderToStaticMarkup(createElement(DatePicker, {
    name: "date",
    defaultValue: "2025-01-15",
  }));

  assert.match(html, /value="2025-01-15"/);
  assert.match(html, /15\.01\.2025/);
});
