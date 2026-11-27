---
title: Schema.org JSON-LD
description: The structured-data graph every travel article carries, and what search engines and AI systems read from it.
order: 3
---

## What it exposes

Every article page carries one JSON-LD `@graph` in its HTML. It holds the
`BlogPosting`, its author as a `Person`, the publishing `Organization` with its
logo, and every entity the article is tagged with, each typed (`City`,
`TouristAttraction`, `Brand`, `DefinedTerm` for topics) and linked to Wikidata
through `sameAs`.

The graph is walked, not just listed. If an article is about Zermatt, the graph
also contains Valais, Switzerland and Europe, because each place names the one
it lies in.

Entities the article is about go into `about`; entities it only names in
passing go into `mentions`. Hotels an author stayed at once are post-local
`LodgingBusiness` nodes in `mentions`, identified by the property's own URL.

Category archives get a `CollectionPage` and each front page a homepage graph.

## How it is generated

`scripts/webmemo-schema-direct.py` in entity-map builds each graph from the
ontology and the post's `meta.ontology_ids` and uploads it to the blog through
the webmemo-schema plugin, which prints it into the page. Nothing in the graph
is typed by hand.

## How to follow it

Open any article, view the source and search for `application/ld+json`. Each
entity's `@id` is a real URL: open it and the blog serves the entity page as
HTML, or as JSON-LD when asked for `application/ld+json`. To reach the same
entity on the other blog, compare the Wikidata ID, not the `@id`
(see [Ontology and content graph](ontology.md)).

Design notes:
[ADR-001](https://github.com/webmemo-code/entity-map/blob/main/docs/adr/001-multi-site-ontology-architecture.md),
[ADR-008](https://github.com/webmemo-code/entity-map/blob/main/docs/adr/008-term-scoped-schema-via-wm-schema-object-model.md).
