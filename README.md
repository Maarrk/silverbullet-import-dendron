# Dendron import plug

Dendron import is a plug for [SilverBullet](https://silverbullet.md) that converts note files created in a [Dendron](https://www.dendron.so/) [vault](https://wiki.dendron.so/notes/6682fca0-65ed-402c-8634-94cd51463cc4/) to SilverBullet [space](https://silverbullet.md/Spaces)

> [!WARNING]
> This plug is deprecated because of changes in SilverBullet 0.6.1 (see below).
> Also it already served me to import my notes, so there is little motivation to improve it.

> Plugs now can no longer define their own markdown syntax, migrated all plug-specific syntax into the main parser. This should remove a bunch of editor “flashing”, especially during sync.
>
> source: [SilverBullet CHANGELOG for 0.6.1](https://silverbullet.md/CHANGELOG#0.6.1)

## Usage

Open the Dendron vault as a space. Then run {[Import: Dendron]} command, the note files will be modified in-place.

### Configuration

Configure the plug in your SETTINGS page, by adding the following in the YAML block. Those are the default values, which will be used if you omit any of them:

```yaml
dendron:
  flattenHierarchy: false
  aliasOldName: false
  includeDescription: true
  linkParent: false
  nameOverrides: {}
```

They can be used for the following:

- `flattenHierarchy`: create pages in the main folder, instead of creating folders for every level of Dendroin hierarchy
- `aliasOldName`: place old filename in `aliases` field of the frontmatter
- `includeDescription`: place contents of `desc` field used by Dendron as first paragraph of text
- `allowSkippedContent`: proceed with import when some skipped pages weren't empty
- `linkParent`: place a link to dendron parent note if it exists in a paragraph at the start of text; the value can be either boolean (i.e. `true`) to place just the link, or text like `Parent note: {{parent}}`
- `nameOverrides`: mapping from complete dendron path to new folder names; this will be used even if `flattenHierarchy` is set

## Roadmap

- [x] Only import notes with Dendron frontmatter: id, title, created, modified; remove these when done
- [x] List all dendron pages, with their imported counterparts
- [x] Separate command to clean up all imported Dendron notes
- [x] Detect conflicts if a created note already exists
  - [x] Show error on duplicate titles, unless it's an empty tag page ([tag pages aren't expected to have content](https://github.com/silverbulletmd/silverbullet/issues/98))
  - [x] Report error if tag page has any content
- [x] Confirmation modal on destructive operations
  - [x] Cancel operation
  - [x] Show affected files, also affected/total count
- [x] Switch order of address and display text in wikilinks
- [x] Change `@person` links to regular wikilinks
  - [ ] Don't affect e-mail adresses
- [ ] Change links referring to a specific header with `#` to use the header as written, instead of a slug
- [ ] Convert [Note References](https://wiki.dendron.so/notes/f1af56bb-db27-47ae-8406-61a98de6c78c/) to [Live Templates](https://silverbullet.md/Live%20Templates) showing the same amount of context
- [x] Ensure page tags are imported
- [ ] Ensure inline (`$\alpha$`) and block KaTeX math expressions (`$$ \alpha = \beta $$`) don't conflict with SilverBullet `$anchors`.
- [x] Configuration following other plugs
  - [ ] Waiting for upstream config unification
- [x] Optional features toggled with configuration
  - [x] Flatten hierarchy (no folders, just note titles)
    - [x] Allow configuration for some hierarchy to remain, like `user.` to `People/`
  - [x] Put Dendron hierarchical name into `aliases`
  - [x] Move dendron `desc` from frontmatter into first paragraph
  - [x] Link to parent note in first paragraph
