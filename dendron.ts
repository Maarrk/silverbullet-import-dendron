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

// note that this requires a newline after the ending "---"
const frontMatterRegex = /^---\n(([^\n]|\n)*?)---\n/;

type DendronData = {
  id: string;
  title: string;
  created: number;
  modified: number;
  desc?: string | null;
};

export async function importPages() {
  const pages = await space.listPages();

  // following examples from cheap_yaml.ts and client.ts to find frontmatter quickly
  const dendronPages = await pages.reduce(async (accPromise, page) => {
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
        const pageText = text.slice(match[0].length);
        acc.push({ name: page.name, data: data, pageText: pageText });
      }
    }
    return acc;
  }, Promise.resolve(Array<{ name: string; data: DendronData; pageText: string }>()));
  // ^ this as initial value took me longer than it should have

  const lang = buildDendronMarkdown();

  for await (const oldPage of dendronPages) {
    const newName = stripQuotes(oldPage.data.title);

    console.log("newName", newName, "old", oldPage.name, oldPage.data.title);

    const newData = oldPage.data as any; // any required to delete properties
    delete newData.id;
    delete newData.title;
    delete newData.created;
    delete newData.modified;
    delete newData.desc;
    newData.aliases = [oldPage.name];

    const tree = parse(lang, oldPage.pageText);
    swapLinkAliasOrder(tree);

    const newText = [
      "---",
      (await YAML.stringify(newData)).slice(0, -1), // remove trailing newline
      "---",
      ...(typeof oldPage.data.desc === "string"
        ? [stripQuotes(oldPage.data.desc) + "\n"]
        : []), // conditional element
      renderToText(tree),
    ].join("\n");
    await space.writePage(newName, newText);
  }

  await editor.flashNotification(`Imported ${dendronPages.length} pages`);
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
