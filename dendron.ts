import { editor, space } from "$sb/silverbullet-syscall/mod.ts";
import * as YAML from "$sb/plugos-syscall/yaml.ts";
import buildMarkdown from "markdown_parser/parser.ts";
import { parse } from "markdown_parser/parse_tree.ts";
import { WikiLinkTag } from "markdown_parser/customtags.ts";
import { Language } from "@codemirror/language";
import {
  ParseTree,
  findNodeOfType,
  renderToText,
  replaceNodesMatching,
} from "$sb/lib/tree.ts";
import { PageMeta } from "$sb/types.ts";
import { extractFrontmatter } from "$sb/lib/frontmatter.ts";
import { readSetting } from "$sb/lib/settings_page.ts";
import title from "title";

export type DendronPageMeta = PageMeta & {
  title: string;
  contentLength: number;
  importAs: string;
  imported: boolean;
};

export type Config = {
  flattenHierarchy: boolean;
  nameOverrides: Record<string, string>;
};

export const defaultConfig: Config = {
  flattenHierarchy: false,
  nameOverrides: {},
};

async function getConfig(): Promise<Config> {
  return { ...defaultConfig, ...(await readSetting("dendron", {})) };
}

/**
 * Empty tag pages are not considered duplicates
 */
function isEmptyTag(page: DendronPageMeta) {
  return page.name.startsWith("tags.") && page.contentLength === 0;
}

async function listDendronPages(): Promise<DendronPageMeta[]> {
  const config = await getConfig();
  const pages = await space.listPages();

  // note that this doesn't check for a newline after the ending "---"
  const frontMatterRegex = /^---\n(([^\n]|\n)*?)---/;
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
        typeof data.updated === "number"
      ) {
        const content = text.slice(match[0].length).trim();
        acc.push({
          ...page,
          title: stripQuotes(data.title),
          contentLength: content.length,
        });
      }
    }
    return acc;
  }, Promise.resolve(Array<PageMeta & { title: string; contentLength: number }>()));

  const mapping = hierarchyMapping(dendronPages, config);
  const existingPages = new Set<string>(pages.map((p) => p.name));
  return dendronPages.map((dp) => {
    // we're guaranteed mapping has every page in this array by `hierarchyMapping`
    const newName = mapping.get(dp.name) as string;
    return {
      ...dp,
      importAs: newName,
      imported: existingPages.has(newName),
    };
  });
}

/**
 * build a map from old dendron names to new note names
 * @param dendronPages list of pages in the space to map
 * @param config plug configuration (passed in for testing)
 * @returns mapping from old page name to new name
 */
export function hierarchyMapping(
  dendronPages: Array<PageMeta & { title: string }>,
  config: Config
): Map<string, string> {
  const dendronSeparator = ".";
  const spaceSeparator = "/";

  dendronPages.sort((a, b) => {
    // by number of name parts
    return (
      a.name.split(dendronSeparator).length -
      b.name.split(dendronSeparator).length
    );
  });

  const partMapping = new Map<string, string>();
  if (!config.flattenHierarchy) {
    // for each name sub sequence add mapping to title
    for (const page of dendronPages) {
      const parts = page.name.split(dendronSeparator);
      for (let count = 1; count <= parts.length; count++) {
        const subPart = parts.slice(0, count).join(dendronSeparator);
        if (count === parts.length) {
          // full page path, save the title
          partMapping.set(subPart, page.title);
        } else if (!partMapping.has(subPart)) {
          // this path is missing, generate title
          if (subPart.toLowerCase() === subPart) {
            // no capitalization, make a title
            partMapping.set(subPart, title(parts[count - 1].replace("-", " ")));
          } else {
            // preserve custom capitalization
            partMapping.set(subPart, parts[count - 1]);
          }
        }
      }
    }
  }
  // override these mappings with ones from config
  for (const subPart in config.nameOverrides) {
    partMapping.set(subPart, config.nameOverrides[subPart]);
  }

  const pageMapping = new Map<string, string>();
  for (const page of dendronPages) {
    // for each subsequence of parts of name, add part to new name
    const dendronParts = page.name.split(dendronSeparator);
    const spaceParts = [];
    for (let count = 1; count < dendronParts.length; count++) {
      const subPart = dendronParts.slice(0, count).join(dendronSeparator);
      if (partMapping.has(subPart)) {
        spaceParts.push(partMapping.get(subPart));
      }
    }
    spaceParts.push(page.title);

    pageMapping.set(page.name, spaceParts.join(spaceSeparator));
  }

  return pageMapping;
}

export async function importPages() {
  const dendronPages = await listDendronPages();
  const lang = buildDendronMarkdown();

  {
    const importNames = new Set<string>();
    for (const page of dendronPages) {
      if (isEmptyTag(page)) continue;

      if (importNames.has(page.importAs)) {
        await editor.flashNotification(
          'Some page titles are conflicting, check "Dendron: Show state" command',
          "error"
        );
        return;
      } else {
        importNames.add(page.importAs);
      }
    }
  }

  const importedPages = dendronPages.reduce((acc, p) => {
    if (p.imported) {
      acc.push(p.importAs);
    }
    return acc;
  }, Array<string>());
  if (importedPages.length > 0) {
    const ok = await editor.confirm(
      `These ${
        importedPages.length
      } pages would be overwritten by import: ${importedPages.join(", ")}`
    );
    if (!ok) {
      await editor.flashNotification("Import cancelled");
      return;
    }
  }

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
    delete frontmatter["updated"];

    replaceUserLinks(tree);
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
  // with the simplified buildMarkdown setup, I can only create single nodes
  // (it uses internally match[0].length of the regex)
  return buildMarkdown([
    {
      nodeType: "UserLink",
      // same regex as Dendron, allows hyphen and period
      regex:
        /@[^#@|\[\]\s,;:'\"<>()?!`~«‹»›„“‟”’❝❞❮❯⹂〝〞〟＂‚‘‛❛❜❟［］【】…‥「」『』·؟،।॥‽⸘¡¿⁈⁉]+/,
      firstCharCodes: [64 /* @ */],
      tag: WikiLinkTag,
    },
  ]);
}

/**
 * Change all nodes of type "UserLink" into correct wikilinks.
 * Example: `@some-person` into `[[user.some-person]]`
 * @param tree modified in place
 */
export function replaceUserLinks(tree: ParseTree): void {
  const defaultLang = buildMarkdown([]);

  replaceNodesMatching(tree, (t) => {
    if (t.type !== "UserLink") return undefined;

    const userName = t.children![0].text?.slice(1);
    // I want the exact same structure as if it was just a text replacement,
    // but it's more efficient and correct to do it on the tree
    // HACK: Changes length, messing up positions of everything after
    return parse(defaultLang, `[[user.${userName}]]`);
  });
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

    // HACK: Doesn't update the position of the pipe mark
    t.children![1].children![0].text = pageText;
    t.children![3].children![0].text = aliasText;
    return t;
  });
}

/**
 * Create a report page, similar to "Broken Links: Show" command
 */
export async function showState(): Promise<void> {
  const pageName = "DENDRON IMPORT";
  const dendronPages = await listDendronPages();

  const pagesByTitle = new Map<string, DendronPageMeta[]>();
  const imported = [];
  const unimported = [];
  for (const page of dendronPages) {
    const title = page.importAs;
    if (pagesByTitle.has(title)) {
      pagesByTitle.get(title)?.push(page);
    } else {
      pagesByTitle.set(title, [page]);
    }

    if (page.imported) {
      imported.push({ from: page.name, to: page.importAs });
    } else {
      unimported.push(page.name);
    }
  }
  const conflictLines = [];
  for (const [title, pages] of pagesByTitle) {
    if (pages.length > 1 && pages.filter((p) => !isEmptyTag(p)).length > 1) {
      conflictLines.push(`* [[${title}]]:`);
      for (const page of pages) {
        conflictLines.push(`  * [[${page.name}]]`);
      }
    }
  }

  const reportText = [
    "## Conflicting",
    ...conflictLines,
    conflictLines.length === 0 ? "*(none)*\n" : "",
    "## Not imported",
    ...unimported.map((from) => `* [[${from}]]`),
    unimported.length === 0 ? "*(none)*\n" : "",
    "## Imported",
    ...imported.map((imp) => `* [[${imp.from}]]: [[${imp.to}]]`),
    imported.length === 0 ? "*(none)*\n" : "",
  ].join("\n");
  await space.writePage(pageName, reportText);
  await editor.navigate(pageName);
}

export async function deleteImported(): Promise<void> {
  const dendronPages = await listDendronPages();

  const pagesToRemove = dendronPages.reduce((acc, p) => {
    if (p.imported) {
      acc.push(p.name);
    }
    return acc;
  }, Array<string>());

  if (pagesToRemove.length == 0) {
    await editor.flashNotification("No previously imported pages to delete");
    return;
  }

  const ok = await editor.confirm(
    `These ${pagesToRemove.length} pages will be deleted: ${pagesToRemove.join(
      ", "
    )}`
  );
  if (!ok) {
    await editor.flashNotification("Deletion cancelled");
    return;
  }

  for await (const name of pagesToRemove) {
    space.deletePage(name);
  }
  await editor.flashNotification(`${pagesToRemove.length} pages deleted`);
}
