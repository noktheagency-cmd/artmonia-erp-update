import assert from "node:assert/strict";
import test from "node:test";
import {
  knowledgeDocumentToPlainText,
  parseKnowledgeDocument,
} from "@/modules/about/knowledge-document";

test("knowledge document keeps supported rich text and produces searchable text", () => {
  const document = parseKnowledgeDocument(JSON.stringify({
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Missiyamız" }] },
      { type: "paragraph", content: [{ type: "text", text: "Yaradıcı inkişaf", marks: [{ type: "bold" }] }] },
    ],
  }));

  assert.equal(document.content?.[0]?.attrs?.level, 2);
  assert.equal(knowledgeDocumentToPlainText(document), "Missiyamız\nYaradıcı inkişaf");
});

test("knowledge document removes unsafe links", () => {
  const document = parseKnowledgeDocument(JSON.stringify({
    type: "doc",
    content: [{
      type: "paragraph",
      content: [{ type: "text", text: "Keçid", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }],
    }],
  }));

  assert.equal(document.content?.[0]?.content?.[0]?.marks, undefined);
});

test("knowledge document rejects unsupported nodes", () => {
  assert.throws(
    () => parseKnowledgeDocument(JSON.stringify({ type: "doc", content: [{ type: "image", attrs: { src: "x" } }] })),
    /dəstəklənməyən/,
  );
});
