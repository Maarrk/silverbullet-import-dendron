import { editor, space } from "$sb/silverbullet-syscall/mod.ts";
import * as YAML from "$sb/plugos-syscall/yaml.ts";
import buildMarkdown from "markdown_parser/parser.ts";
import { parse } from "markdown_parser/parse_tree.ts";
import { Language } from "@codemirror/language";
import {
  ParseTree,
  findNodeOfType,
  renderToText,
  replaceNodesMatching,
} from "$sb/lib/tree.ts";
import { PageMeta } from "$sb/types.ts";
import { extractFrontmatter } from "$sb/lib/frontmatter.ts";

async function listDendronPages(): Promise<
  Array<PageMeta & { title: string }>
> {
  const pages = await space.listPages();

  // note that this requires a newline after the ending "---"
  const frontMatterRegex = /^---\n(([^\n]|\n)*?)---\n/;

  // following examples from cheap_yaml.ts and client.ts to find frontmatter quickly
  return pages.reduce(async (accPromise, page) => {
    const acc = await accPromise;
    const text = await space.readPage(page.name);
    const match = frontMatterRegex.exec(text);
    if (match) {
      const data = await YAML.parse(match[1]);
      // is there a nicer way to downcast in typescript?
      if (
        typeof data.id === "string" &&
        typeof data.title === "string" &&
        typeof data.created === "number" &&
        typeof data.modified === "number"
      ) {
        acc.push({ ...page, title: stripQuotes(data.title) });
      }
    }
    return acc;
  }, Promise.resolve(Array<PageMeta & { title: string }>()));
}

export async function importPages() {
  const dendronPages = await listDendronPages();
  const lang = buildDendronMarkdown();

  for await (const oldPage of dendronPages) {
    const tree = parse(lang, await space.readPage(oldPage.name));

    const frontmatter = await extractFrontmatter(tree, {
      removeFrontmatterSection: true,
    });

    const newName = oldPage.title;
    let description: string | null = null;
    if ("desc" in frontmatter) {
      description = frontmatter["desc"];
    }
    frontmatter["aliases"] = [oldPage.name];

    // removeKeys on extracFrontmatter didn't work as expected
    delete frontmatter["id"];
    delete frontmatter["desc"];
    delete frontmatter["title"];
    delete frontmatter["created"];
    delete frontmatter["modified"];

    swapLinkAliasOrder(tree);

    const newText = [
      "---",
      (await YAML.stringify(frontmatter)).slice(0, -1), // remove trailing newline
      "---",
      ...(typeof description === "string" ? [stripQuotes(description)] : []), // conditional element
      renderToText(tree),
    ].join("\n");
    await space.writePage(newName, newText);
  }

  const pageCount = dendronPages.length;
  await editor.flashNotification(
    `Imported ${pageCount} page${pageCount === 1 ? "" : "s"}`
  );
}

/**
 * Remove matching pairs of quotes at either end
 */
function stripQuotes(text: string): string {
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'")) ||
    (text.startsWith("“") && text.endsWith("”"))
  ) {
    return stripQuotes(text.slice(1, -1));
  } else return text;
}

export function buildDendronMarkdown(): Language {
  return buildMarkdown([]);
}

export function swapLinkAliasOrder(tree: ParseTree): void {
  replaceNodesMatching(tree, (t) => {
    if (t.type !== "WikiLink") return undefined;

    if (!t.children || t.children.length !== 5)
      // mark[[, page, mark|, alias, mark]]
      return undefined;

    // get the values swapped
    const aliasText = findNodeOfType(t, "WikiLinkPage")?.children![0].text;
    const pageText = findNodeOfType(t, "WikiLinkAlias")?.children![0].text;

    t.children![1].children![0].text = pageText;
    t.children![3].children![0].text = aliasText;
    return t;
  });
}

async function hierarchyMapping(): Promise<Record<string, string>> {
  const dendronPages = await listDendronPages();
  const mapping: Record<string, string> = {};
  for (const page of dendronPages) {
    mapping[page.name] = page.title;
  }
  return mapping;
}

/**
 * Create a report page, similar to "Broken Links: Show" command
 */
export async function showState(): Promise<void> {
  const pageName = "DENDRON IMPORT";
  const mapping = await hierarchyMapping();
  const existingPages = new Set(
    (await space.listPages()).map((page) => {
      return page.name;
    })
  );

  console.log("mapping", mapping);
  console.log("existingPages", existingPages);

  const imported = [];
  const unimported = [];
  for (const from in mapping) {
    const to = mapping[from];
    if (existingPages.has(to)) {
      imported.push({ from: from, to: to });
    } else {
      unimported.push(from);
    }
  }

  const reportText = [
    "## Not imported",
    ...unimported.map((from) => `* [[${from}]]`),
    "",
    "## Imported",
    ...imported.map((imp) => `* [[${imp.from}]]: [[${imp.to}]]`),
  ].join("\n");
  await space.writePage(pageName, reportText);
  await editor.navigate(pageName);
}
