---
title: Measuring AI traffic
description: How AI crawler fetches and human visits to the travel blogs are counted, what each source can and cannot see, and why public views show relative figures only.
order: 9
---

## Three kinds of AI fetch

AI crawlers are grouped by what they fetch for:

| Purpose | Examples | Sends readers back? |
| --- | --- | --- |
| **Training**: collects text for model corpora | GPTBot, ClaudeBot, Common Crawl | No |
| **Search**: indexes pages for AI answers with attribution | OAI-SearchBot, Claude-SearchBot, PerplexityBot | Sometimes, through citations |
| **User**: fetches a page live because a person asked | ChatGPT-User, Claude-User, Perplexity-User | When the person clicks |

Human visitors, including those arriving from an AI answer, are counted
separately as readers.

## What each source sees

| Source | Sees | Misses |
| --- | --- | --- |
| **Edge logs** (Cloudflare, Travelmemo) | Every request, cached or not, with the country it came from | Nothing on Reisememo, which is not behind Cloudflare |
| **Server logs** (Apache and nginx, Reisememo) | Every request that reaches the server | Requests answered by a cache in front of it |
| **Plugin counters** | Fetches of the virtual outputs (llms.txt, EntityMap, OKF) | Article pages, because the page cache serves those without running PHP |
| **GA4** | Human readers, their city and the article they read | Crawlers, which do not run its script |

The travel blogs' crawler counts come from the edge and server logs, loaded
nightly into BigQuery, so they count article pages as well. On a day that both
Reisememo log sources cover, only one is used, so no fetch is counted twice.

## Rules for publishing figures

- **Relative figures only on public views.** The Explorer, this guide and any
  public article show shares, tiers and log-scaled sizes, never raw request
  counts, clicks or queries.
- **Date every figure.** A share without its window and date is not a finding.
- **Label estimates.** A number derived from a sample or a model is marked as
  such.

## Where it shows in the Explorer

An entity's cylinder height is how often AI agents fetched it in the last 30
days, relative to the rest of its class. In live mode, AI agents appear as
satellites coloured by purpose, and readers glow at their city. See
[Using the Explorer](explorer.md).
