---
title: How the travel graph works
description: How Travelmemo and Reisememo publish one shared travel ontology to search engines and AI systems, and how to read the Explorer that shows it.
order: 1
---

Travelmemo (English) and Reisememo (German) are two travel blogs that share one
ontology: a set of YAML files that names every place, topic, organization, trip
and author the blogs write about. Each blog turns that ontology into the
machine-readable outputs that search engines and AI systems read. The
[Explorer](../) shows the result as a globe.

This guide explains that chain for anyone who works on **GEO** (generative
engine optimization), **AEO** (answer engine optimization) or **GAIO**
(generative AI optimization). The three names describe the same goal from
different angles: an AI system that answers a travel question should find the
right article, understand what it is about, and cite it correctly.

## One request, followed backwards

Take Liechtenstein. An AI crawler fetches
`https://reisememo.ch/ontology/places/liechtenstein`, the entity page for the
country on Reisememo. Followed backwards, that request leads through every
layer this guide describes:

1. **The ontology.** `ontology/travel/places/liechtenstein.yaml` defines the
   entity once for both blogs: its key `places/liechtenstein`, its labels in
   English and German, Wikidata `Q347`, its position, and that it lies in
   Europe. See [Ontology and content graph](ontology.md).
2. **The articles.** Two Reisememo articles are tagged with it, a winter hike
   from Malbun and a hotel in Vaduz. Travelmemo has none yet, so the entity is
   an orphan there. The [article index](articles/index.html) lists both.
3. **The outputs.** The tag puts Liechtenstein into each article's
   [Schema.org JSON-LD](schema-org.md), into the blog's
   [EntityMap](entitymap.md), into the Liechtenstein section of its
   [llms.txt](llms-txt.md) and into the front matter of its
   [OKF](okf.md) documents.
4. **Discovery.** The crawler found the entity page through links the blog
   publishes on purpose. See [Discovery](discovery.md).
5. **Measurement.** The fetch is counted before the page cache and shows up on
   the globe as a taller Liechtenstein cylinder. See
   [Measuring AI traffic](ai-traffic.md) and [Using the Explorer](explorer.md).

## What lives where

| Layer | Repository |
| --- | --- |
| Ontology YAML, generators, the WordPress plugins | [entity-map](https://github.com/webmemo-code/entity-map) |
| The Explorer and this guide | [travel-graph-explorer](https://github.com/webmemo-code/travel-graph-explorer) |

The design decisions behind the outputs are recorded as architecture decision
records in [entity-map/docs/adr](https://github.com/webmemo-code/entity-map/tree/main/docs/adr).
This guide explains them; where the two ever disagree, the ADR and the code
are right.
