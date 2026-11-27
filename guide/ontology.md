---
title: Ontology and content graph
description: The YAML ontology both travel blogs share, how entities get their identity, and how articles link to them.
order: 2
---

## One source of truth

Every entity lives in exactly one YAML file in the
[entity-map](https://github.com/webmemo-code/entity-map/tree/main/ontology)
repository. Everything else, from JSON-LD to the WordPress terms, is generated
from those files and never edited by hand. The tree has three tiers:

| Folder | Holds | Used by |
| --- | --- | --- |
| `shared/` | People (the two authors) | all sites |
| `travel/` | Places, topics, organizations, trips | Travelmemo and Reisememo |
| `travelmemo/`, `reisememo/` | Site configuration and overrides | one site each |

The entity classes are **places** (continents, countries, regions, cities,
sights, lakes, mountains), **topics** (hiking, wellness, culinary tourism),
**organizations** (hotel brands, airlines, tourism boards), **trips**
(itineraries drawn stop by stop) and **people**.

## What the two blogs share, and what they do not

The blogs share the entity, not its web address.

- **Shared:** the YAML key (`places/zermatt`), the Wikidata Q-number (`Q27494`),
  the `sameAs` links to Wikipedia, and the labels in both languages.
- **Per blog:** the `@id`. Each site has its own URI namespace, so the same
  town is `https://travelmemo.com/ontology/places/zermatt` on Travelmemo and
  `https://reisememo.ch/ontology/places/zermatt` on Reisememo. Each URI is a
  real page on its blog. Authors follow the same rule: Walter is
  `https://travelmemo.com/author/walter-schaerer` on one blog and
  `https://reisememo.ch/author/walter-schaerer` on the other.

What ties the two `@id`s together for a machine is the Wikidata ID they both
point to. That is why every entity must carry a verified Wikidata Q-number:
one Q-number is one entity, and two entities with the same Q-number are
duplicates by definition.

## Places form a hierarchy

Each place names the place it lies in (`containedInPlace`), so Zermatt sits in
Valais, Valais in Switzerland, Switzerland in Europe. The chain is built only
as deep as the articles need: a city mentioned once in passing hangs directly
off its country until an article is actually about its region.

## From article to entity

An editor never types entity IDs. A script suggests the entities an article is
about, from its WordPress tags and its text, and a person approves each
suggestion in a review file before it is written to the post as
`meta.ontology_ids`. That list is the link between an article and the graph.
Every output reads it.

When the generator builds an article's JSON-LD, it sorts those entities into
two roles: the ones the article is **about** (named in a heading, or the
topic of the piece) and the ones it only **mentions** in passing.

## Cross-blog links

Some stories exist on both blogs. The link between them is explicit: a post
carries `meta.translation_url` pointing at its counterpart on the other blog.
That link drives the `hreflang` alternates in the HTML and the counterpart
column of the [article index](articles/index.html). Two articles that share
entities are about the same subject, but they are not translations of each
other unless that link says so.
