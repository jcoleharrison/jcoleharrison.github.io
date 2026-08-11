#!/usr/bin/env node
// Renders content/*.json into a static index.html. No dependencies, no framework.
//   node build.mjs
// Everything lands in the repo root so GitHub Pages can serve it directly.
//
// The page is prerendered rather than assembled in the browser: the text has to
// be in the HTML for anything to index it.

import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const read = (f) => JSON.parse(readFileSync(join(root, "content", f), "utf8"));

// Anything with "draft": true stays out of the build. Anything with an empty
// url stays out too, so a placeholder never ships as a dead link.
const live = (xs) => (xs ?? []).filter((x) => !x.draft && x.url !== "");

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const site = read("site.json");
const research = live(read("research.json"));
const opensource = live(read("opensource.json"));
const news = live(read("news.json"));



const hash = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 8);

// Assets are overwritten in place — a re-encode keeps the same filename — so
// every URL carries a hash of the file's contents. Without it a browser goes on
// serving the copy it cached the first time.
const assetHashes = new Map();
const bust = (path) => {
  if (!assetHashes.has(path)) assetHashes.set(path, hash(readFileSync(join(root, path))));
  return `${path}?v=${assetHashes.get(path)}`;
};

const cssHash = hash(readFileSync(join(root, "src", "styles.css")));

// Google shows ~60 characters. The role earns the page results beyond the
// exact-name query, which a bare name cannot.
const pageTitle = site.role ? `${site.name} — ${site.role}` : site.name;

const MONTHS =
  "January February March April May June July August September October November December".split(" ");
const longDate = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};

// News is dated to the month; the day is precision nobody needs for an event.
const SHORT = MONTHS.map((m) => (m.length > 3 ? m.slice(0, 3) + "." : m));
const monthDate = (iso) => {
  const [y, m] = iso.split("-").map(Number);
  return `${SHORT[m - 1]} ${y}`;
};

// Just enough markdown for news items: [label](url). Escaping runs first, so
// the surrounding prose is still safe.
const inlineLinks = (text) =>
  esc(text).replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => `<a href="${url}">${label}</a>`);

const linkRow = (links, cls) => {
  const items = live(links);
  if (!items.length) return "";
  return `<p class="${cls}">${items
    .map((l) => `<a href="${esc(l.url)}">${esc(l.label)}</a>`)
    .join("")}</p>`;
};

// The bio already names every affiliation, so link them where they're written
// instead of repeating the list underneath it.
const linkify = (text, targets) =>
  live(targets).reduce(
    (out, t) => out.replaceAll(esc(t.label), `<a href="${esc(t.url)}">${esc(t.label)}</a>`),
    esc(text)
  );

const missing = [];

// Social preview card. Rendered from the site's own styles; see README.
const ogImage = existsSync(join(root, "media/og.png")) ? "media/og.png" : "";

// An affiliation renders as a monochrome mark. If an SVG exists at the org's
// `logo` path it is drawn as a mask so it takes the page's ink colour and works
// in both themes; otherwise it falls back to the org's name set in the site's
// own type. Drop a file in and it swaps over with no other change.
// Intrinsic aspect, so CSS can size a mark from its height alone.
const aspectOf = (file) => {
  const buf = readFileSync(join(root, file));
  if (file.endsWith(".svg")) {
    const vb = buf.toString().match(/viewBox="[\d.\s-]*?([\d.]+)[,\s]+([\d.]+)"/);
    return vb ? Number(vb[1]) / Number(vb[2]) : 1;
  }
  // PNG: width and height live in the IHDR chunk at bytes 16..24
  return buf.readUInt32BE(16) / buf.readUInt32BE(20);
};

// An SVG is inlined and its brand colours swapped for theme variables, which
// keeps interior detail (the white cuts in the Stanford tree would be lost if it
// were flattened into a mask). A raster has no such structure, so it is painted
// as a mask and takes the ink colour that way.
// Collected while rendering, then emitted once as <symbol>s. Inlining the full
// path data per occurrence duplicated 6 KB of the Stanford mark.
const sprites = new Map();

const svgBody = (file) =>
  readFileSync(join(root, file), "utf8")
    .replace(/<\?xml[\s\S]*?\?>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s(width|height)="[^"]*"/g, "")
    .replace(/fill="(#fff|#ffffff|white)"/gi, 'fill="var(--paper)"')
    .replace(/fill="(?!none|var\()[^"]*"/gi, 'fill="currentColor"')
    .trim();

const spriteRef = (key, file, label, style) => {
  if (!sprites.has(key)) {
    const raw = svgBody(file);
    const viewBox = raw.match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 1 1";
    const inner = raw.replace(/^<svg[^>]*>/i, "").replace(/<\/svg>\s*$/i, "");
    sprites.set(key, `<symbol id="org-${esc(key)}" viewBox="${esc(viewBox)}">${inner}</symbol>`);
  }
  return `<svg class="org-logo" style="${style}" role="img" aria-label="${esc(
    label
  )}"><use href="#org-${esc(key)}" /></svg>`;
};

// These marks range from 0.65 (Stanford's block-S) to 3.06 (the Ai2 wordmark) —
// a 4.7x spread. Fitting them to a common box at equal height leaves the tall
// narrow mark looking half the weight of the wordmark, so they're normalised by
// AREA instead: every mark covers the same ink, which is what the eye actually
// compares. AREA is set so the widest mark lands at about 3.2rem across.
const AREA = 3.344;
const fit = (ar) => ({ w: Math.sqrt(AREA * ar), h: Math.sqrt(AREA / ar) });

// Area normalisation gives each mark a different height, which would make the
// rail — and so the gap between title and authors — vary per entry. Pinning the
// band to the tallest mark on the site keeps every row identical.
const bandHeight = Math.max(
  1.4,
  ...Object.values(site.orgs ?? {})
    .filter((o) => o.logo && existsSync(join(root, o.logo)))
    .map((o) => fit(aspectOf(o.logo)).h)
);

const orgMark = (key) => {
  const org = site.orgs?.[key];
  if (!org) return "";
  const hasLogo = org.logo && existsSync(join(root, org.logo));

  const vars = [
    org.color ? `--brand:${esc(org.color)}` : "",
    org.colorDark ? `--brand-dk:${esc(org.colorDark)}` : "",
  ].filter(Boolean);

  let inner = esc(org.label);
  if (hasLogo) {
    const { w, h } = fit(aspectOf(org.logo));
    const box = `--logo-w:${w.toFixed(3)}rem;--logo-h:${h.toFixed(3)}rem`;
    inner = org.logo.endsWith(".svg")
      ? spriteRef(key, org.logo, org.label, box)
      : `<span class="org-logo" style="--logo:url('${esc(
          bust(org.logo)
        )}');${box}" role="img" aria-label="${esc(org.label)}"></span>`;
  }

  return `<li class="org${hasLogo ? " has-logo" : ""}"${
    vars.length ? ` style="${vars.join(";")}"` : ""
  }>${org.url ? `<a href="${esc(org.url)}">${inner}</a>` : inner}</li>`;
};

const orgRow = (keys) => {
  const marks = (keys ?? []).map(orgMark).filter(Boolean).join("");
  return marks
    ? `\n                <ul class="item-orgs" style="--org-band:${bandHeight.toFixed(
        3
      )}rem">${marks}</ul>`
    : "";
};

const media = (p) => {
  const m = p.media;
  // A figure is opt-in; it follows the plate tier unless the entry says otherwise.
  if (!m?.src || !(p.figure ?? p.highlight)) return "";
  // Never ship a broken image into a plate — skip it and say so at build time.
  if (!existsSync(join(root, m.src))) {
    missing.push(`${p.id} -> ${m.src}`);
    return "";
  }
  const href = live(p.links)[0]?.url;
  const dims = `width="${esc(m.width ?? "")}" height="${esc(m.height ?? "")}"`;

  const inner =
    m.type === "video"
      ? `<video src="${esc(bust(m.src))}"${
          m.poster && existsSync(join(root, m.poster)) ? ` poster="${esc(bust(m.poster))}"` : ""
        } ${dims} loop muted playsinline preload="none" aria-label="${esc(
          m.alt ?? ""
        )}"></video>`
      : `<img src="${esc(bust(m.src))}" alt="${esc(m.alt ?? "")}" ${dims} loading="lazy" decoding="async" />`;

  return `
            <figure class="item-media">${
              // not aria-hidden: the alt text is worth announcing. tabindex -1 only
              // avoids a duplicate tab stop, since the title links to the same place.
              href ? `<a href="${esc(href)}" tabindex="-1">${inner}</a>` : inner
            }</figure>`;
};

const item = (p) => {
  const fig = media(p);
  return `
          <li class="item${p.highlight ? " plate" : ""}${fig ? " has-media" : ""}">
            <div class="item-body">
              <div class="item-head">
                <h3 class="item-title">${
                  live(p.links)[0]
                    ? `<a href="${esc(live(p.links)[0].url)}">${esc(p.title)}</a>`
                    : esc(p.title)
                }</h3>
                <p class="item-date"><time datetime="${esc(p.date)}">${esc(longDate(p.date))}</time></p>${orgRow(p.orgs)}
              </div>
              <p class="item-authors">${esc(p.authors)}</p>
              ${linkRow(p.links, "item-links")}
            </div>${fig}
          </li>`;
};

const newsItem = (n) => `
          <li>
            <span class="news-date">[<time datetime="${esc(n.date)}">${esc(
              monthDate(n.date)
            )}</time>]</span> ${inlineLinks(n.text)}
          </li>`;

const repo = (r) => `
          <li>
            <div class="item-head">
              <h3 class="item-title">${esc(r.name)}</h3>
            </div>
            <p class="item-note">${esc(r.note)}</p>
            ${linkRow(r.links, "item-links")}
          </li>`;

// Sits inside the intro plate, which already provides the container.
const portrait = (() => {
  const p = site.portrait;
  if (!p?.src || !existsSync(join(root, p.src))) return "";
  return `
        <figure class="portrait"><img src="${esc(bust(p.src))}" alt="${esc(
          p.alt ?? site.name
        )}" width="${esc(p.width ?? "")}" height="${esc(
          p.height ?? ""
        )}" fetchpriority="high" /></figure>`;
})();

const jsonld = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Person",
      "@id": `${site.url}/#me`,
      name: site.name,
      description: site.description,
      url: site.url,
      ...(site.role ? { jobTitle: site.role } : {}),
      ...(site.portrait?.src ? { image: `${site.url}/${site.portrait.src}` } : {}),
      knowsAbout: site.interests,
      // Only real employers. Collaborating with people at a lab is not an
      // organizational affiliation, and schema.org reads it as one.
      affiliation: site.affiliations
        .filter((a) => a.affiliation)
        .map((a) => ({ "@type": "Organization", name: a.label, url: a.url })),
      worksFor: site.affiliations
        .filter((a) => a.affiliation)
        .map((a) => ({ "@type": "Organization", name: a.label, url: a.url })),
      sameAs: live(site.links)
        .filter((l) => l.url.startsWith("http"))
        .map((l) => l.url),
    },
    // author, not subjectOf: schema.org reads subjectOf as "a work ABOUT this
    // Thing", which forfeits the authorship signal entirely.
    ...research.map((r) => ({
      "@type": "ScholarlyArticle",
      headline: r.title,
      datePublished: r.date,
      url: live(r.links)[0]?.url,
      author: { "@id": `${site.url}/#me` },
    })),
  ],
};

const body = {
  research: research.map(item).join(""),
  opensource: opensource.map(repo).join(""),
  news: news.map(newsItem).join(""),
};

const spriteSheet = sprites.size
  ? `\n    <svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">${[
      ...sprites.values(),
    ].join("")}</svg>`
  : "";

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(pageTitle)}</title>
    <meta name="description" content="${esc(site.description)}" />
    <meta name="author" content="${esc(site.name)}" />
    <link rel="canonical" href="${esc(site.url)}/" />
    <meta property="og:type" content="profile" />
    <meta property="og:title" content="${esc(pageTitle)}" />
    <meta property="og:description" content="${esc(site.description)}" />
    <meta property="og:url" content="${esc(site.url)}/" />
    <meta property="og:site_name" content="${esc(site.name)}" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:profile:first_name" content="${esc(site.name.split(" ")[0])}" />
    <meta property="og:profile:last_name" content="${esc(
      site.name.split(" ").slice(1).join(" ")
    )}" />${
      ogImage
        ? `
    <meta property="og:image" content="${esc(site.url)}/${esc(ogImage)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${esc(site.name)}" />`
        : ""
    }
    <meta name="twitter:card" content="${ogImage ? "summary_large_image" : "summary"}" />
    <meta name="twitter:title" content="${esc(pageTitle)}" />
    <meta name="twitter:description" content="${esc(site.description)}" />${
      ogImage
        ? `
    <meta name="twitter:image" content="${esc(site.url)}/${esc(ogImage)}" />`
        : ""
    }${
      site.twitter ? `\n    <meta name="twitter:creator" content="${esc(site.twitter)}" />` : ""
    }
    <link rel="icon" href="favicon.ico" sizes="any" />
    <link rel="icon" type="image/svg+xml" href="media/icons/favicon.svg" />
    <link rel="apple-touch-icon" href="media/icons/icon-180.png" />
    <link rel="manifest" href="site.webmanifest" />
    <meta name="theme-color" content="#f5f4ef" />${
      site.verification?.google
        ? `\n    <meta name="google-site-verification" content="${esc(site.verification.google)}" />`
        : ""
    }${
      site.verification?.bing
        ? `\n    <meta name="msvalidate.01" content="${esc(site.verification.bing)}" />`
        : ""
    }
    <link rel="stylesheet" href="styles.css?v=${cssHash}" />
    <script type="application/ld+json">${JSON.stringify(jsonld)}</script>${
      site.analytics?.ga4
        ? `
    <script async src="https://www.googletagmanager.com/gtag/js?id=${esc(
      site.analytics.ga4
    )}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag() { dataLayer.push(arguments); }
      gtag("js", new Date());
      gtag("config", "${esc(site.analytics.ga4)}");
    </script>`
        : ""
    }
    <script>
      // Applied before first paint so a stored choice never flashes the other theme.
      try {
        var t = localStorage.getItem("theme");
        if (t) document.documentElement.dataset.theme = t;
      } catch (e) {}
    </script>
  </head>
  <body>
    <a class="skip" href="#content">Skip to content</a>${spriteSheet}
    <div class="shell">
      <header class="masthead">
        <h1 class="serif">${esc(site.name)}</h1>
        <nav>
          <a href="#papers">Papers</a>
          <a href="#news">News</a>
          <a href="#code">Code</a>
          <button id="theme" type="button" aria-label="Switch to dark theme">
            <svg class="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 13.2A8.4 8.4 0 1 1 10.8 3.5a6.6 6.6 0 0 0 9.7 9.7z" /></svg>
            <svg class="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.1" /><path d="M12 2.6v2.1M12 19.3v2.1M4.6 4.6l1.5 1.5M17.9 17.9l1.5 1.5M2.6 12h2.1M19.3 12h2.1M4.6 19.4l1.5-1.5M17.9 6.1l1.5-1.5" /></svg>
          </button>
        </nav>
      </header>

      <main id="content">
      ${portrait ? `<div class="intro-row">${portrait}` : ""}
      <section class="intro plate">
        <div class="intro-body">
          ${site.bio.map((p) => `<p>${linkify(p, site.affiliations)}</p>`).join("\n          ")}
        </div>
        <p class="profile-links">${
          site.email ? `<span class="email">${esc(site.email)}</span>` : ""
        }${live(site.links)
          .map((l) => `<a href="${esc(l.url)}" rel="me">${esc(l.label)}</a>`)
          .join("")}</p>
      </section>
      ${portrait ? "</div>" : ""}

      <section id="papers">
        <h2 class="serif">Papers</h2>
        <ol class="index">${body.research}
        </ol>
      </section>

${
  news.length
    ? `
      <section id="news">
        <h2 class="serif">News</h2>
        <ul class="news-list">${body.news}
        </ul>
      </section>`
    : ""
}
      <section id="code">
        <h2 class="serif">Code</h2>
        <ul class="plain-list">${body.opensource}
        </ul>
      </section>
      </main>
    </div>
    <script>
      // Videos carry preload="none" so nothing is fetched until one scrolls into
      // view; autoplay would have overridden that and pulled ~1.5 MB on load.
      (function () {
        var vids = document.querySelectorAll("video");
        if (!vids.length) return;

        if (!("IntersectionObserver" in window)) {
          for (var i = 0; i < vids.length; i++) vids[i].play().catch(function () {});
          return;
        }

        var io = new IntersectionObserver(
          function (entries) {
            entries.forEach(function (e) {
              if (e.isIntersecting) e.target.play().catch(function () {});
              else e.target.pause();
            });
          },
          { rootMargin: "200px" }
        );
        vids.forEach(function (v) {
          io.observe(v);
        });
      })();

      (function () {
        var root = document.documentElement;
        var btn = document.getElementById("theme");
        function current() {
          return root.dataset.theme === "dark" ? "dark" : "light";
        }
        function label() {
          var next = current() === "dark" ? "light" : "dark";
          btn.setAttribute("aria-label", "Switch to " + next + " theme");
        }

        btn.addEventListener("click", function () {
          root.dataset.theme = current() === "dark" ? "light" : "dark";
          try {
            localStorage.setItem("theme", root.dataset.theme);
          } catch (e) {}
          label();
        });

        label();
      })();
    </script>
  </body>
</html>
`;

writeFileSync(join(root, "index.html"), html);
copyFileSync(join(root, "src", "styles.css"), join(root, "styles.css"));
writeFileSync(join(root, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${site.url}/sitemap.xml\n`);

writeFileSync(
  join(root, "site.webmanifest"),
  JSON.stringify(
    {
      name: site.name,
      short_name: site.name,
      description: site.description,
      start_url: "/",
      display: "browser",
      background_color: "#f5f4ef",
      theme_color: "#f5f4ef",
      icons: [
        { src: "media/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "media/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "media/icons/favicon.svg", sizes: "any", type: "image/svg+xml" },
      ],
    },
    null,
    2
  ) + "\n"
);

// GitHub Pages runs Jekyll by default, which silently drops any path beginning
// with an underscore — media/_unused would vanish. This disables it.
writeFileSync(join(root, ".nojekyll"), "");

writeFileSync(
  join(root, "404.html"),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Not found &middot; ${esc(site.name)}</title>
    <meta name="robots" content="noindex" />
    <link rel="icon" href="favicon.ico" sizes="any" />
    <link rel="stylesheet" href="styles.css?v=${cssHash}" />
  </head>
  <body>
    <a class="skip" href="#content">Skip to content</a>${spriteSheet}
    <div class="shell">
      <header class="masthead"><h1 class="serif">${esc(site.name)}</h1></header>
      <p style="margin-bottom:1.5rem">That page does not exist.</p>
      <p class="meta-links"><a href="/">Back to the index</a></p>
    </div>
  </body>
</html>
`
);
writeFileSync(
  join(root, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${site.url}/</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod></url>
</urlset>
`
);

console.log(
  `built index.html — ${research.length} papers, ${opensource.length} projects, ${news.length} news${
    ogImage ? "" : "  (no media/og.png — social card missing)"
  }`
);
if (missing.length) {
  console.log(`\nmissing figures (entry rendered without one):`);
  for (const m of missing) console.log(`  ${m}`);
}
