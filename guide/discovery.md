---
title: Discovery
description: How a crawler finds the EntityMap, llms.txt and OKF bundle on each travel blog, through robots.txt and HTML head links.
order: 8
---

An output nobody can find is not read. Each blog points to its outputs in two
places, and both can be checked by hand.

## robots.txt

Open [travelmemo.com/robots.txt](https://travelmemo.com/robots.txt) or
[reisememo.ch/robots.txt](https://reisememo.ch/robots.txt). The block the
blogs add looks like this:

```
# AI-visibility artifacts
Content-Signal: search=yes, ai-input=yes, ai-train=yes
Allow: /entitymap.json
Allow: /entitymap.html
Allow: /llms.txt
Allow: /llms-full.txt
Allow: /okf/
Okf: https://travelmemo.com/okf/
Sitemap: https://travelmemo.com/okf/sitemap.xml
```

- `Allow:` is **permission, not a pointer**. It says a crawler may fetch a
  path; it never tells it the path exists.
- `Sitemap:` is the standard directive that hands over a list of URLs, and it
  is the line crawlers demonstrably act on.
- `Content-Signal:` states how the content may be used (Cloudflare's Content
  Signals Policy).
- `Okf:` is a convention these blogs invented. Parsers ignore what they do not
  know, so it costs nothing, but nobody is expected to read it.

## HTML head links

The **front page** of each blog links all three outputs:

```html
<link rel="describedby" type="text/plain" title="llms.txt" href="https://travelmemo.com/llms.txt" />
<link rel="alternate" type="application/json" title="EntityMap" href="https://travelmemo.com/entitymap.json" />
<link rel="alternate" type="text/markdown" title="OKF bundle" href="https://travelmemo.com/okf/" />
```

Each **article** links its own neighbourhood:

- `rel="alternate" type="text/markdown"` to its own OKF document, the same
  article in another encoding;
- `rel="describedby"` to the llms.txt of its category, which describes the
  article's subject area;
- `rel="related"` to the OKF folders that contain it, nearest first;
- `rel="alternate"` to `/entitymap.json`, then `rel="related"` to each of its
  entities in `/entitymap.html`.

The link relation matters: `alternate` claims the target is the same content,
`describedby` that it describes it, `related` only that it is connected.

## Checking it yourself

Fetch the raw HTML rather than reading it in a browser that runs scripts:

```powershell
curl.exe -s https://travelmemo.com/ | Select-String '<link rel="(describedby|alternate|related)"'
```

Then fetch each target and confirm it answers 200 with the type the link
claims.

Design note:
[ADR-009](https://github.com/webmemo-code/entity-map/blob/main/docs/adr/009-ai-crawler-policy-and-indexnow.md)
(crawler policy and IndexNow).
