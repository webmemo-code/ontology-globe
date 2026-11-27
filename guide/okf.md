---
title: Open Knowledge Format (OKF)
description: The Markdown bundle each travel blog publishes under /okf/, with one document per article filed by destination and need.
order: 7
---

## What it exposes

The [Open Knowledge Format](https://github.com/open-knowledge-format/open-knowledge-format/blob/main/SPEC.md)
publishes a site's knowledge as a bundle of Markdown documents. Each travel
blog serves its own bundle under `/okf/`:

- [travelmemo.com/okf/](https://travelmemo.com/okf/)
- [reisememo.ch/okf/](https://reisememo.ch/okf/)

Every article becomes one document. Its YAML front matter states what a
machine needs without parsing the prose: the entities the article is tagged
with, its photos with their captions and keywords, the affiliate hosts it links
to, and who verified it. The Markdown body below is a curated version of the
article. Where a model wrote that version, the document names the model and
the article it was derived from, never the article's author.

## The directory tree

Documents are filed by destination and need, for example `schweiz/hiking/`.
`/okf/index.md` is the entry point; each folder has its own `index.md` linking
the documents and folders inside it. `/okf/log.md` lists every document in the
bundle, and `/okf/sitemap.xml` hands the same list to crawlers.

When a document moves to a new folder, its old address answers with a
permanent redirect to the new one. A short alias at `/okf/{slug}.md` also
redirects to the document's current place.

## How it is generated

The bundled OKF WordPress plugin builds the bundle and regenerates a document
whenever its article is saved. The folder each article belongs in is planned
in entity-map (`scripts/generate_okf_paths.py`) and written to the post.

## How to follow it

From an article's HTML, a `rel="alternate"` link of type `text/markdown` leads
to its OKF document, and `rel="related"` links lead up through the folders that
contain it. From [llms.txt](llms-txt.md), the root file links the bundle.

Design notes:
[ADR-006](https://github.com/webmemo-code/entity-map/blob/main/docs/adr/006-okf-body-curated-not-verbatim.md),
[ADR-007](https://github.com/webmemo-code/entity-map/blob/main/docs/adr/007-okf-self-contained-bundle-at-okf-path.md),
[ADR-011](https://github.com/webmemo-code/entity-map/blob/main/docs/adr/011-okf-bundle-directory-tree.md).
