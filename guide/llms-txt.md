---
title: llms.txt
description: The llms.txt files each travel blog publishes, from the site overview down to one file per destination.
order: 6
---

## What it exposes

[llms.txt](https://llmstxt.org/) is a Markdown file that gives a language model
a short overview of a site and links to the pages worth reading. The travel
blogs publish a tree of them:

| Path | Content |
| --- | --- |
| `/llms.txt` | The site overview: a heading, a summary, then one linked section per category and a "Guides & about" section |
| `/{category}/llms.txt` | One destination or theme, with the category's description and its articles |
| `/llms-full.txt` | The full text of every article in one file, for loading a whole corpus at once |

Try [travelmemo.com/llms.txt](https://travelmemo.com/llms.txt) and
[reisememo.ch/llms.txt](https://reisememo.ch/llms.txt). Each blog writes its
files in its own language.

## What the proposal defines and what the blogs add

The proposal defines the root `/llms.txt` and its shape: an H1, a summary in a
blockquote, and sections of Markdown links. The per-category files, the full
text file, and the decision to list every destination rather than a small
selection are choices these blogs made.

## How it is generated

`scripts/generate_llmstxt.py` in entity-map builds the tree from the published
articles and the WordPress category descriptions, and uploads it. The blog
serves the files from that snapshot; there is no file on disk.

## How to follow it

Start at the root file, open a category section, then follow a link to a single
article's Markdown document in the [OKF bundle](okf.md). That is progressive
disclosure: overview, then section, then document, each one a small fetch.
