import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Combobox } from "@base-ui/react/combobox";
import { resolveSelectValueItem } from "./select-value";

type Item = { value: string; label: string };
const empty = "__empty__";

function submittedValue(items: Item[], current: string) {
  const html = renderToStaticMarkup(createElement(Combobox.Root<Item>, {
    name: "educationLevel",
    value: resolveSelectValueItem(items, current, empty),
    items,
    itemToStringValue: (item) => item.value,
    itemToStringLabel: (item) => item.label,
  }));
  const field = html.match(/<input\b[^>]*name="educationLevel"[^>]*>/)?.[0];
  assert.ok(field, "combobox must serialize the named form field");
  return field.match(/\bvalue="([^"]*)"/)?.[1] ?? "";
}

test("a saved education level is submitted before its catalog has loaded", () => {
  assert.equal(submittedValue([], "Universitetdə təhsil alır"), "Universitetdə təhsil alır");
});

test("loading other choices must not silently clear the saved form value", () => {
  const items = [{ value: "Orta təhsil alır", label: "Orta təhsil alır" }];
  assert.equal(submittedValue(items, "Uşaqdır, hələ məktəbə gedmir"), "Uşaqdır, hələ məktəbə gedmir");
});

test("loaded options submit the stored value while retaining the catalog label", () => {
  const item = { value: "stored-value", label: "Təhsil pilləsi" };
  assert.equal(resolveSelectValueItem([item], item.value, empty), item);
  assert.equal(submittedValue([item], item.value), "stored-value");
});

test("an explicitly empty selection stays empty instead of restoring the old value", () => {
  assert.equal(submittedValue([], empty), "");
  assert.equal(submittedValue([], ""), "");
});
