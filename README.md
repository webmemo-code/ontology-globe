# Travel Ontology

Interactive 3D map of the knowledge graph behind
[travelmemo.com](https://travelmemo.com) and [reisememo.ch](https://reisememo.ch).
Every box is one entity from the ontology both blogs share: a place, a topic,
an organization, a trip or an author.

**Live:** https://webmemo-code.github.io/ontology-globe/

![Inside the globe](docs/globe-inside.jpg)

## Two views

**⬡ How it works.** The entities form a small globe: the ontology, the
single source of truth. Stacked above it are the two WordPress sites, the
generated outputs (JSON-LD, taxonomies, EntityMap, llms.txt, OKF) and the
groups that read them. Click any tile for a plain-language explanation.

![How it works](docs/how-it-works.jpg)

**◍ Globe.** The small globe grows into the big one. It opens from outside,
with Switzerland facing you; fly inside to see the places hanging on their shells.

| Encoding | Meaning |
|---|---|
| Dot on the skin | One article at the place it is about (orange EN, grey DE); brightness and size = relative search tier |
| Bars on a country | Article count per blog on a log scale: orange Travelmemo, grey Reisememo |
| Dotted land | True geography (Natural Earth); a selected country is outlined |
| Boxes inside | Places on shells by level: continents nearest you, sights nearest the skin |
| Topic wheel | Topics sit on a level wheel inside the globe: direction = family, distance from the centre = how specific. Companies hang over their headquarters, the authors' faces at the zenith |
| Purple tubes | Trips, drawn stop by stop in itinerary order |
| Halo / outline | Top 10% or top 25% search performer / orphan with no article yet |
| Select | An entity lights its article dots in gold (dim amber where filed under another country), with rays out to each; an article draws rays to its entities |

![The globe from outside](docs/globe-outside.jpg)

**● Live** (globe view, or `?live` in the URL): Readers of the last 30 minutes glow at their country, with a
flowing line to the article they read (GA4 Realtime): solid orange for Travelmemo,
dashed orange for Reisememo. AI agents are satellites coloured by purpose
(training, search, on a user's behalf): each hovers over the country its request
came from (Cloudflare on Travelmemo, IPinfo Lite on Reisememo) on a thin tether,
and beams to the article or entity it fetched from there. When the country is
unknown it hovers over the operator's headquarters instead.

Agents on article pages are not
seen, because the page cache serves those without PHP. `?live=demo` feeds
made-up traffic for previews and recordings.

## Lifted from the Periodic Cube of AI

Inspired by Walter's [Periodic Cube of AI](https://webmemo.ch/periodic-cube-of-ai)
