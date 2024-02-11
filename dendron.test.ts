import { assert, assertEquals } from "std/assert";
import { parse } from "markdown_parser/parse_tree.ts";
import {
  ParseTree,
  collectNodesOfType,
  findNodeOfType,
  renderToText,
} from "$sb/lib/tree.ts";
import {
  buildDendronMarkdown,
  defaultConfig,
  hierarchyMapping,
  replaceUserLinks,
  replacePageLinks,
  swapLinkAliasOrder,
} from "./dendron.ts";
import { PageMeta } from "$sb/types.ts";

const dendronSample = `---
type: page
tags: [higher.lower, multi-part]
---
# This is a doc

Here is a [[page.link]] and an [[aliased|page.with.deep.hierarchy]].

This is a user link @name-surname, which shouldn't include the comma.
But this e-mail address user@example.com shouldn't be converted.`;

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

  const userLinks = collectNodesOfType(tree, "UserLink");
  assertEquals(userLinks.length, 1);

  let userLinkNode: ParseTree | null = userLinks[0];
  assertEquals(userLinks[0].children![0].text, "@name-surname");

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

Deno.test("changing hierarchy", () => {
  const config = defaultConfig;
  type TitledMeta = PageMeta & { title: string };
  let pages: TitledMeta[] = [];
  const makePage: (name: string, title: string) => TitledMeta = (
    name: string,
    title: string
  ) => {
    return {
      ref: "",
      tags: [],
      name,
      created: "2024-01-23",
      lastModified: "2024-01-23",
      perm: "rw",
      title,
    };
  };

  // Zero pages
  assertEquals(hierarchyMapping(pages, config), new Map<string, string>());

  // One simple page
  pages = [makePage("tla", "Three Letter Acronym")];
  assertEquals(
    hierarchyMapping(pages, config),
    new Map([["tla", "Three Letter Acronym"]])
  );

  // Use parent pages for folder names
  config.flattenHierarchy = false;
  pages = [makePage("topic.detail", "Detail"), makePage("topic", "Topic")];
  assertEquals(
    hierarchyMapping(pages, config),
    new Map([
      ["topic", "Topic"],
      ["topic.detail", "Topic/Detail"],
    ])
  );

  // Flatten hierarchy to last page
  config.flattenHierarchy = true;
  pages = [makePage("topic.detail", "Detail"), makePage("topic", "Topic")];
  assertEquals(
    hierarchyMapping(pages, config),
    new Map([
      ["topic", "Topic"],
      ["topic.detail", "Detail"],
    ])
  );

  // Generate missing titles like dendron, see https://wiki.dendron.so/notes/8d3c8142-7481-40da-9a5c-69a3d4bab697/#naming
  config.flattenHierarchy = false;
  pages = [
    makePage("awesome-apples.page", "Page"),
    makePage("Custom-Capitalization.page", "Page"),
  ];
  assertEquals(
    hierarchyMapping(pages, config),
    new Map([
      ["awesome-apples.page", "Awesome Apples/Page"],
      ["Custom-Capitalization.page", "Custom-Capitalization/Page"],
    ])
  );

  // Maintain overriden names
  config.flattenHierarchy = true;
  config.nameOverrides = {
    users: "People",
  };
  pages = [
    makePage("topic.detail", "Detail"),
    makePage("users.person", "Person"),
    makePage("users.org.member", "Member"),
  ];
  assertEquals(
    hierarchyMapping(pages, config),
    new Map([
      ["topic.detail", "Detail"],
      ["users.person", "People/Person"],
      ["users.org.member", "People/Member"],
    ])
  );
});

Deno.test("replacing links", () => {
  const lang = buildDendronMarkdown();
  const mapping = new Map([
    ["page.link", "Link"],
    ["page.with.deep.hierarchy", "Deep Hierarchy"],
  ]);
  const tree = parse(lang, dendronSample);

  swapLinkAliasOrder(tree);
  replacePageLinks(tree, mapping);

  const links = collectNodesOfType(tree, "WikiLinkPage");
  assertEquals(links.length, 2);
  assertEquals(links[0].children![0].text, "Link");
  assertEquals(links[1].children![0].text, "Deep Hierarchy");
});
