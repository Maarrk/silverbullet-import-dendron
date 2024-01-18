import { assertEquals } from "std/assert";
import { parse } from "markdown_parser/parse_tree.ts";
import { findNodeOfType, renderToText } from "$sb/lib/tree.ts";
import { buildDendronMarkdown, swapLinkAliasOrder } from "./dendron.ts";

const dendronSample = `---
type: page
tags: [higher.lower, multi-part]
---
# This is a doc

Here is a [[page.link]] and an [[aliased|page.with.deep.hierarchy]].

This is a user link @name-surname, which shouldn't include the comma.

Supper`;

Deno.test("basic language", () => {
  const lang = buildDendronMarkdown();
  const tree = parse(lang, dendronSample);
  assertEquals(renderToText(tree), dendronSample);
});

Deno.test("aliased links", () => {
  const lang = buildDendronMarkdown();
  const tree = parse(lang, dendronSample);

  swapLinkAliasOrder(tree);

  const aliasNode = findNodeOfType(tree, "WikiLinkAlias");
  assertEquals(aliasNode?.children![0].text, "aliased");
});
