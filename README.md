# cole harrison — personal site

A release index: research output as a dated, chronological log.

One page. No framework, no dependencies, no `node_modules`. Content lives in
`content/*.json`; `build.mjs` renders it into a static `index.html` at the repo
root.

```sh
npm run build     # content/*.json -> index.html + styles.css
npm run serve     # build, then http://localhost:4173
```

## editing

| file | what's in it |
| --- | --- |
| `content/research.json` | the publications — this is the site |
| `content/opensource.json` | code worth pointing at |
| `content/news.json` | dated one-liners; `[label](url)` links inline in the text |
| `content/site.json` | name, bio, affiliations, contact links |
| `media/` | one figure per publication (see `media/README.md`) |
| `src/styles.css` | all of the styling |

Two conventions the build honours everywhere:

- `"draft": true` on any item keeps it out of the build. Use it to stage a
  release before it's public.
- An empty `"url": ""` drops that link, so a paper can carry `Paper` / `Code` /
  `Project` slots before all of them exist without shipping a dead link.

If a figure's file is missing the entry still renders, without it, and
`npm run build` names the entry and the path it wanted. Nothing fails silently.

Run `npm run build` after any edit. `index.html`, `styles.css`, `robots.txt`,
and `sitemap.xml` are generated — edit the sources, not the output.

## affiliation marks

Orgs are declared once in `content/site.json` under `orgs`, and entries
reference them by key:

```json
"orgs": ["stanford"]
```

Each org may name a `logo` in `media/logos/`. No logo means the org's name is
set in the site's own type instead, so an entry never breaks while you're
sourcing a mark.

Everything renders monochrome, by two routes:

- **SVG** is inlined and its brand colours swapped for theme variables — brand
  fill becomes `currentColor`, white becomes `var(--paper)`. That keeps interior
  detail: the tree is cut *out* of the Stanford block-S, and flattening it into
  a silhouette would lose it.
- **Raster** is painted as a CSS mask, which takes `currentColor` the same way.

Either way the mark inverts with the theme. This matters — cardinal red and
Ai2's pink would be the only colour on the page besides the signal yellow, and
would read as clip-art against a monochrome layout.

Marks are **normalised by area, not by height**. Aspect ratios here run from
0.65 (the Stanford block-S) to 3.06 (the Ai2 wordmark), a 4.7x spread — matching
heights leaves the narrow mark looking half the weight of the wordmark, and
matching widths makes it illegible. Equal ink area is what the eye actually
compares, so the build reads each file's intrinsic aspect (SVG `viewBox`, or the
PNG IHDR chunk) and solves for `w = √(AREA·ar)`, `h = √(AREA/ar)`. `AREA` is set
so the widest mark lands near 3.2rem.

That gives every mark a different height, which would make the rail — and so the
gap between title and authors — vary per entry. So the band is pinned to the
tallest mark on the site, also computed at build time, and every row comes out
identical.

Source logos rarely arrive usable. Of the three here: the Stanford SVG was
clean; Ai2 came as an AVIF animation frame, pink on black with no alpha, so the
alpha was rebuilt from luminance; and the UW PNG reported `hasAlpha: yes` but
was uniformly opaque with the transparency checkerboard baked into the pixels,
so its alpha was derived from colour and ramped to drop the checkerboard. Both
rasters were then cropped to their content bounds and scaled to 96px tall —
roughly 5x the display size, enough for retina without the weight.

## seo

Generated on every build: `robots.txt`, `sitemap.xml` (with `lastmod`), `404.html`,
`site.webmanifest`, and `.nojekyll` — the last is required, or GitHub Pages runs
Jekyll and silently drops any path starting with an underscore.

In `<head>`: canonical, full Open Graph set including a 1200x630 `og:image`,
`twitter:card=summary_large_image`, `meta author`, favicon set (svg/ico/32/180/192/512),
and `theme-color`. Profile links carry `rel="me"`.

`media/og.png` is the social card, rendered from the site's own stylesheet at
1200x630. Re-render it if the bio or portrait changes.

Structured data is a JSON-LD `@graph`: one `Person` node with an `@id`, plus a
`ScholarlyArticle` per paper whose `author` points back at it. Do **not** use
`Person.subjectOf` for this — schema.org reads that as "a work *about* this
person", which asserts the opposite of authorship.

Search Console and Bing verification are wired but inert until tokens exist. Add
to `content/site.json`:

```json
"verification": { "google": "<token>", "bing": "<token>" }
```

Deliberately **not** done, and why:

- **No Google Scholar `citation_*` tags.** Scholar indexes pages that host the
  PDF; every paper here links out to arXiv, which already owns that record.
  Duplicating the metadata would compete with it.
- **No per-paper stub pages.** Each paper's project page outranks a thin local
  copy, and one page keeps all the text on the canonical URL.
- **No Atom feed** until there is something to syndicate.
- **The email is text, not a `mailto:`**, and is absent from the JSON-LD — that
  was the most harvestable copy on the page.

## performance

- Videos carry `preload="none"` and start via IntersectionObserver. `autoplay`
  overrides `preload`, so leaving it on fetched ~1.5 MB before the user scrolled.
- Repeated org logos are emitted once as `<symbol>`s and referenced with `<use>`.
  Inlining the Stanford mark per entry duplicated 6 KB.
- Figures are encoded near their display size. A 1800px source in a 16rem column
  is ~7x oversampled.
- The portrait carries `fetchpriority="high"` as the likely LCP element.

## deploying

Live at **https://jcoleharrison.github.io/**, served by GitHub Pages from
`main` at the repo root. There is no CI and no Actions workflow — Pages serves
the committed files directly, which is why the built output is tracked rather
than gitignored.

The repo **must** stay named `jcoleharrison.github.io` (exactly the GitHub
username) for the root URL. Any other name makes it a project page at
`jcoleharrison.github.io/<repo>/`, which would also require changing `url` in
`content/site.json`.

### the loop

```sh
npm run build                    # regenerate index.html, styles.css, 404, sitemap, manifest
git add -A && git commit -m "..."
git push                         # Pages redeploys in ~1 min
```

`npm run build` is not optional — `index.html` is generated, so editing
`content/*.json` without rebuilding pushes stale HTML. Never hand-edit
`index.html`, `styles.css` (root), `404.html`, `robots.txt`, `sitemap.xml`, or
`site.webmanifest`; they are all overwritten on every build.

### checking a deploy

```sh
gh api repos/jcoleharrison/jcoleharrison.github.io/pages --jq .status   # building | built
curl -sI https://jcoleharrison.github.io/ | head -1
```

Assets are content-hashed, so a redeploy invalidates caches on its own. The one
exception is `index.html` itself, which Pages serves with a short TTL — a hard
reload settles it.

### if it needs to move

- **Custom domain** — add a `CNAME` file containing the bare domain, point DNS
  at the Pages IPs, and set `url` in `content/site.json` to match. That `url`
  feeds the canonical tag, Open Graph, the absolute `og:image`, the sitemap, and
  the JSON-LD `@id`, so it is the single thing to get right.
- **The previous Jekyll site** is preserved, private, at
  `jcoleharrison.github.io-archive`. It was never deployed.

## the reference

Look and feel is taken from [pi.website](https://www.pi.website/). Lifted from
their stylesheet directly:

| | |
| --- | --- |
| background | `#f5f4ef` bone |
| foreground | `#000` pure black |
| muted text | `#686868` |
| links | `#595959` — grey and underlined, **no accent colour anywhere** |
| card border | `#403e37` |
| divider | `#e5e4dc` |
| body font | `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace` — a system stack, no webfont |

Their serif is **Signifier** (Klim Type Foundry, commercially licensed), used
only for the wordmark and page headings. We can't redistribute it, so `.serif`
falls back to whatever good serif is already installed: Iowan Old Style,
Palatino, Charter, Source Serif 4, Georgia. If you want closer, Source Serif 4
is open-licensed and self-hostable.

PI's index uses three tiers of container, and the tier carries meaning:

1. **heavy plate** — black border plus hard offset shadow, for flagship releases
2. **light card** — faint border and fill, for posts
3. **no box** — plain text, for ordinary papers

This site implements tiers 1 and 3, driven by `"highlight": true` in
`content/research.json`. It is not an odd/even effect — set the flag on whatever
you consider flagship.

PI ships light only. Dark here is the same system inverted, offered as an
opt-in rather than a default.

The one departure from PI is colour: their highlight yellow is given a job they
don't give it — the plate shadow, the beads, and a marker-pen link hover. It is
the only hue on the page. Those rules sit under the `signal` heading in
`src/styles.css`.

## design notes

A name, two paragraphs, a list of papers. Mono throughout, serif for the
wordmark and headings, one yellow doing all the emphasis.
Modelled on how working researchers actually publish a homepage.

Light and dark both ship, but the page is **light by default regardless of the
visitor's system setting** — `prefers-color-scheme` is deliberately not consulted.
Dark is reached only through the sun/moon toggle beside the nav, and the choice
persists in `localStorage`. A tiny script in `<head>` applies a stored choice
before first paint so the other theme never flashes. Both icons ship in the
markup and CSS picks one from the root attribute, so the correct glyph paints
without waiting on script.

The stylesheet URL carries a hash of its own contents (`styles.css?v=…`),
so a browser holding an old copy fetches the new one instead of rendering a
previous design.

A paper entry carries four things and nothing else:

    ●   Title                                    July 10, 2026
        Authors
        Project  Paper  Code

No summary, no subtitle, no metric callout, no contribution note, no category
label. Anyone who wants more clicks Paper — that is what the link is for.

**Media is inline.** The figure takes a 13rem column beside the text, so an
entry stays a single band instead of becoming a hero image. Below 46rem it drops
back under the text. The item text is wrapped in `.item-body` on purpose: if the
figure spanned grid rows instead, the rows would stretch to its height and open a
gap between the title and the authors.

**Media follows the plate tier.** A figure appears only on flagged entries, so
the flagship work carries evidence and the rest of the index stays scannable.
Override per entry with `"figure": true` / `false`; it defaults to `highlight`.
Figures keep their natural proportions — these are paper teasers, and cropping
them to a uniform ratio would cut panels off — with `width`/`height` declared so
nothing reflows on load. Set `"type": "video"` and the same slot renders a
muted, looping, `playsinline` `<video>`; add a `poster` for the first frame.

Videos are re-encoded for the web before they go in `media/` — 640px wide, 24fps,
CRF 31, no audio track, `+faststart`. Sources have arrived at up to 22 MB; encoded
they land at 0.2-0.9 MB. `media/README.md` has the ffmpeg line.

Every figure sits in a 16:9 box with `object-fit: contain`, so the column is flush
whatever the source ratio is and nothing gets cropped. `height: auto` is required
alongside `aspect-ratio` — without it the HTML `height` attribute wins and the box
inherits the asset's full pixel height.

Entries carry the same inline padding whether or not they are plated, so plated
and unplated rows share one left edge for text and one right edge for media.

Always re-encode from `media/_originals/`, never from an already compressed file
— speed changes and re-crops compound otherwise.

- `media/_originals/` — sources as delivered. Gitignored; ~134 MB.
- `media/_unused/` — superseded stills, kept because they're content.

**The bio gets the heaviest plate on the page.** On PI the boxed entries pull
the eye straight down the timeline and the intro paragraph never gets read.
Giving the bio a container — the strongest one — is what makes it compete.

The rest:

- **Prerendered, not client-rendered.** The text is in the HTML. A page whose
  body is assembled by JS has nothing for a crawler to read, which was the whole
  problem with the old site.
- **Author names are not highlighted.** Cole is not first author on any of
  these, and bolding your own name in a list you didn't lead reads badly.
- **Affiliations are linked where they're named**, in the bio, rather than
  repeated as a row of links underneath it.
- **Keywords live in the JSON-LD**, not on the page. `knowsAbout` does the SEO
  work without putting a keyword row in front of a human reader.
- **No news feed.** Every news item restated a publication that is already on
  the page, with the same three links.
- **No resume**, no work history, no dates, no footer.
