import { assert, assertEquals } from "std/assert";
import { parse } from "markdown_parser/parse_tree.ts";
import {
  collectNodesOfType,
  findNodeOfType,
  renderToText,
} from "$sb/lib/tree.ts";
import {
  buildDendronMarkdown,
  replaceUserLinks,
  swapLinkAliasOrder,
} from "./dendron.ts";

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

Deno.test("user tags to links", () => {
  const lang = buildDendronMarkdown();
  let tree = parse(lang, dendronSample);

  let userLinkNode = findNodeOfType(tree, "UserLink");
  assertEquals(userLinkNode?.children![0].text, "@name-surname");

  replaceUserLinks(tree);

  userLinkNode = findNodeOfType(tree, "UserLink");
  assert(userLinkNode === null || userLinkNode === undefined);

  const links = collectNodesOfType(tree, "WikiLink");
  assertEquals(links.length, 3);
  let nameNode = findNodeOfType(links[2], "WikiLinkPage");
  assertEquals(nameNode?.children![0].text, "user.name-surname");

  tree = parse(lang, "Czy zadziała @Brzęczyszczykiewicz.Grzegorz?");
  replaceUserLinks(tree);
  nameNode = findNodeOfType(tree, "WikiLinkPage");
  assertEquals(
    nameNode?.children![0].text,
    "user.Brzęczyszczykiewicz.Grzegorz"
  );
});
