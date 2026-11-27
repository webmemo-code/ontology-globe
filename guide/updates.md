---
title: How the guide updates
description: How the article index stays current with the two blogs, and what happens when the data is incomplete.
order: 11
---

## Where the data comes from

The article index is generated from two files in this repository:
`public/graph.json` (every published article, its entities and its
counterpart) and `public/headings.json` (each article's title). They are the
same snapshot the Explorer loads, exported from both blogs by
`scripts/export_viz_graph.py` in entity-map.

The guide never calls WordPress itself, so its build needs no passwords or
API keys.

## When it updates

Every push to `main` builds the Explorer and the guide together and deploys
both to GitHub Pages. A refreshed snapshot committed to `main` therefore
updates the index within minutes, and the guide can never disagree with the
globe. The footer of each page shows when the snapshot was last committed.

Articles are keyed by blog and WordPress post ID, so a changed URL or title
updates the existing entry. An article removed from the snapshot disappears
from the index.

## What happens when the data is wrong

Before anything is written, the build checks the snapshot: both blogs are
present and their article counts match the header, every article has a title
and a URL on its own blog, every entity exists in the graph, and every
counterpart is an article on the other blog. Any failure stops the build with
the full list of problems. The deploy is then skipped and the last good
version stays online.

## Authored pages

The explanatory pages are Markdown files in
[guide/](https://github.com/webmemo-code/travel-graph-explorer/tree/main/guide)
and change through pull requests like any other code.
