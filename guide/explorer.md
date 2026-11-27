---
title: Using the Explorer
description: How to read the 3D globe of the travel ontology, follow an article to its entities, and interpret live reader and AI agent activity.
order: 10
---

The [Explorer](../) shows the whole ontology as a globe. The full reference for
every encoding is in the
[README](https://github.com/webmemo-code/travel-graph-explorer#readme); this
page covers the paths you will use most.

## Two views

- **◍ Globe** opens from outside, with Switzerland facing you. Fly inside to see
  places on shells by level and topics on a wheel in the middle.
- **⬡ How it works** stacks the ontology, the two blogs, the generated outputs
  and the groups that read them. Click any tile for a plain-language
  explanation, and this guide for the details.

## Follow an entity to its articles

Click an entity, search for it, or take the guided tour. Its article dots light
up on the globe with rays out to each one. A place also opens its **lens**: the
regions, towns and sights inside it, with article counts per blog and the
articles' photos.

## Follow an article to its entities

Open an article from the lens or from search. It draws rays to every entity it
is tagged with, the same list the [article index](articles/index.html) shows.

## What the sizes mean

- **Width** of a cylinder: how many articles are tagged with the entity.
- **Height**: how often AI agents fetched its entity page in the last 30 days,
  relative to its class. No fetches means a flat disc.
- **Halo**: a top search performer. **Outline**: an orphan with no article yet,
  like Liechtenstein on Travelmemo.

## Live mode

Turn on **Live** in the top bar, or open the Explorer with `?live`. Readers of
the last 30 minutes glow at their city with a line to the article they read.
AI agents hover as satellites coloured by purpose (training, search, on a
user's behalf) and beam to what they fetched. The feed shows presence, never
counts. Agents on article pages do not appear live, because the page cache
answers those before the plugin can see them.
