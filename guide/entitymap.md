---
title: EntityMap
description: The entity-first discovery index each travel blog publishes at /entitymap.json for AI retrieval systems.
order: 5
---

## What it exposes

[EntityMap](https://entitymap.org/spec/v1.0) is a discovery index organized by
entity rather than by URL: "sitemap.xml, but for what a site knows". Each blog
publishes one at `/entitymap.json`, with a readable twin at `/entitymap.html`.

- [travelmemo.com/entitymap.json](https://travelmemo.com/entitymap.json)
- [reisememo.ch/entitymap.json](https://reisememo.ch/entitymap.json)

Each entity entry carries its type from the specification's fixed list of
types, its labels and description, its identity links, typed relations to other
entities (a place `PART_OF` its country, an author `RELATES_TO` the topics they
know), and between one and five evidence passages (`hasChunks`) quoted from real
articles about it.

## How it is generated

`scripts/generate_entitymap.py` in entity-map builds the map from the ontology
and the articles' text. It refuses to publish a map that breaks the
specification, not just one with the wrong shape. The finished file is uploaded
to the blog, which serves it from that snapshot.

## How to follow it

Every article that names entities links into the map from its `<head>`: one
`rel="alternate"` link to `/entitymap.json` and one `rel="related"` link per
entity to its anchor in `/entitymap.html`. Each entry's identity links lead to
Wikidata, where the counterpart on the other blog shares the same Q-number.

Design note:
[ADR-004](https://github.com/webmemo-code/entity-map/blob/main/docs/adr/004-ai-visibility-push-then-serve.md)
(push, then serve).
