import { editor, space } from "$sb/silverbullet-syscall/mod.ts";
import * as YAML from "$sb/plugos-syscall/yaml.ts";

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

  // doesn't parse into a tree because of Dendron's syntax
  for await (const oldPage of dendronPages) {
    // remove double and single quotes on either end
    const newName = stripQuotes(oldPage.data.title);

    console.log("newName", newName, "old", oldPage.name, oldPage.data.title);

    const newData = oldPage.data as any; // any required to delete properties
    delete newData.id;
    delete newData.title;
    delete newData.created;
    delete newData.modified;
    delete newData.desc;
    newData.aliases = [oldPage.name];

    const newText = [
      "---",
      (await YAML.stringify(newData)).slice(0, -1), // remove trailing newline
      "---",
      ...(typeof oldPage.data.desc === "string"
        ? [stripQuotes(oldPage.data.desc) + "\n"]
        : []), // conditional element
      oldPage.pageText,
    ].join("\n");
    await space.writePage(newName, newText);
  }

  await editor.flashNotification(`Imported ${dendronPages.length} pages`);
}

function stripQuotes(text: string): string {
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'")) ||
    (text.startsWith("“") && text.endsWith("”"))
  ) {
    return stripQuotes(text.slice(1, -1));
  } else return text;
}
