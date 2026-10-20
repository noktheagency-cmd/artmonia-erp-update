import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { currentBakuMonthValue, MonthPicker } from "./month-picker";

test("formats the current Baku month as YYYY-MM", () => {
  assert.equal(
    currentBakuMonthValue(new Date("2026-09-01T20:30:00.000Z")),
    "2026-09",
  );
});

test("repairs a dotted payment date sliced into the month field", () => {
  const html = renderToStaticMarkup(
    createElement(MonthPicker, {
      name: "billingMonth",
      value: "20.10.2",
      allowClear: false,
    }),
  );

  assert.match(html, new RegExp(`value="${currentBakuMonthValue()}"`));
  assert.doesNotMatch(html, /20\.10\.2/);
});

test("renders a selected month with Azerbaijani label", () => {
  const html = renderToStaticMarkup(
    createElement(MonthPicker, {
      name: "billingMonth",
      defaultValue: "2026-10",
      allowClear: false,
    }),
  );

  assert.match(html, /value="2026-10"/);
  assert.match(html, /Oktyabr 2026/);
});
