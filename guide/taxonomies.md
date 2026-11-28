---
title: WordPress taxonomies
description: How ontology entities are mirrored into WordPress as terms, and why those terms are never edited by hand.
order: 4
---

## What it exposes

Each entity becomes a term in one of four custom WordPress taxonomies:
`wm_place`, `wm_topic` (topics, products and trips), `wm_org` and `wm_person`.
Each term carries the entity's `ontology_id`, its Schema.org type, its
Wikidata ID and its `sameAs` links as term meta.

The terms are bookkeeping for the CMS: they let WordPress list the posts about
an entity, and they back the entity pages at `/ontology/{class}/{slug}`. The
public tag archives that readers browse come from the normal WordPress tags
and are not affected by these terms.

## How it is generated

`scripts/ontology_sync_terms.py` in entity-map writes every entity as a term
from the YAML. The sync only adds and updates: a manual edit in WordPress admin
is overwritten on the next run, and a deleted YAML entity leaves its term
behind until it is cleaned up deliberately. To change a term, change the YAML.

## How to follow it

On an article, the attached `wm_*` terms match the post's `meta.ontology_ids`.
On the entity page, the term's description and links come straight from the
YAML.
