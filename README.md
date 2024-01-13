# Dendron import plug

Dendron import is a plug for [SilverBullet](https://silverbullet.md) to that converts note files created in a [Dendron](https://www.dendron.so/) [vault](https://wiki.dendron.so/notes/6682fca0-65ed-402c-8634-94cd51463cc4/) to SilverBullet [space](https://silverbullet.md/Spaces)

## Usage

Open the Dendron vault as a space. Then run {[Import: Dendron]} command, the note files will be modified in-place.

## Roadmap

- [ ] Complete writing this, based on [Dendron Concepts](https://wiki.dendron.so/notes/c6fd6bc4-7f75-4cbb-8f34-f7b99bfe2d50/)
- [ ] Only modify notes with Dendron frontmatter: id, title, created, modified; remove these when done
- [ ] Detect conflicts if a created note already exists
- [ ] Confirmation modal
  - [ ] Cancel operation
  - [ ] Show affected files, also affected/total count
- [ ] Switch order of address and display text in wikilinks
- [ ] Change `@person` links to regular wikilinks
- [ ] Create `$anchor` for every `#header` referenced in some link, change the link from `#` to `$` syntax
- [ ] Convert [Note References](https://wiki.dendron.so/notes/f1af56bb-db27-47ae-8406-61a98de6c78c/) to [Live Templates](https://silverbullet.md/Live%20Templates) showing the same amount of context
- [ ] Ensure page tags work as expected
- [ ] Ensure inline (`$\alpha$`) and block KaTex math expressions (`$$ \alpha = \beta $$`) don't conflict with SilverBullet `$anchors`.
- [ ] Configuration following other plugs
- [ ] Optional features toggled with configuration
  - [ ] Flatten hierarchy (no folders, just note titles)
    - [ ] Show error on duplicate titles, unless it's an empty tag page ([tag pages aren't expected to have content](https://github.com/silverbulletmd/silverbullet/issues/98))
