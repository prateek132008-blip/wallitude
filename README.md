# Wallitude — Landing Page

A single-page, production-ready recreation of the **Wallitude Commercial Portfolio (2026)** PDF, built as a fast, responsive website.

Live structure mirrors the PDF page-for-page, in the same order:

1. Hero (cover)
2. About Wallitude
3. Why Businesses Choose Wallitude
4. Design Categories (index)
5–10. Minimal / Vintage / Abstract / Coffee-themed / Travel / Typography
11. Frame Options
12. Available Sizes
13. Project Pricing
14. How It Works
15. Contact + Footer

---

## A note on the gallery imagery

The source PDF's category pages (Minimal, Vintage, Abstract, Coffee-themed,
Travel, Typography) use mockup photography that includes reproductions of
named, copyrighted artwork (e.g. Picasso line drawings, Matisse cut-outs,
Monet paintings, Munch's *The Scream*). To keep this codebase safe for you to
publish and own outright, those photos were **not** copied into the site.

Instead, each category section uses a lightweight, original CSS/SVG "frame
wall" mockup in a palette and mood matching that category, with the same
heading, order, and one-line description style as the PDF.

**Before launch**, swap in your own product photography:
- Replace the `.frame-card .art` blocks in `index.html` with `<img>` tags
  pointing to photos you own the rights to (your own gallery-wall shots, or
  artwork you have a commercial license for).
- Keep images in `assets/images/`, sized ~1200px wide, compressed as WebP or
  JPEG, and add `loading="lazy"` (already used elsewhere in the file) plus
  descriptive `alt` text.

Everything else — type, color, spacing, layout, copy, and structure — is a
direct, faithful recreation of your PDF.

---

## Fonts

- **Bricolage Grotesque** (brand sans) is loaded from Google Fonts — free
  and ready to use as-is.
- **Canela** (brand display serif) is a commercial font and is **not**
  bundled here. The site currently falls back to **Fraunces**, a free
  Google Font with a similar elegant, high-contrast serif character.

If you own a Canela license:
1. Drop the font files into `assets/fonts/`.
2. Add an `@font-face` block at the top of `css/style.css`, e.g.:
   ```css
   @font-face {
     font-family: 'Canela';
     src: url('../assets/fonts/Canela-Medium.woff2') format('woff2');
     font-weight: 500;
     font-display: swap;
   }
   ```
3. The rest of the site already references `var(--font-display)`, which
   lists `'Canela'` first — it will pick it up automatically.

---

## The single call-to-action

Per the brief, there is exactly **one** CTA on the entire site: a fixed,
always-visible button in the bottom-right corner reading **"Book a Free
Space Consultation."** Tapping it opens WhatsApp (web or app) with the
number `+91 6287656368` and a pre-filled message. The QR code in the
Contact section points to the same WhatsApp link, generated at build time
(`assets/images/qr-whatsapp.png`) — no third-party QR service is called at
runtime.

To change the phone number or pre-filled message, search `index.html` for
`wa.me/916287656368` (it appears in the CTA button and the contact link)
and update both, then regenerate the QR code if you change the number.

---

## Tech stack

- Plain **HTML5**
- **Tailwind CSS** via the Play CDN for utility helpers (the actual design
  system — colors, type scale, components — lives in `css/style.css`)
- **Vanilla JavaScript** (`js/main.js`) — only handles scroll-reveal fade-ins
  and the footer year. No trackers, no analytics, no frameworks.

### Optional: compiling Tailwind for production

The CDN build is fine for GitHub Pages and works immediately with zero
setup. If you later want a smaller, cached CSS bundle instead of loading
Tailwind from the CDN on every visit, you can introduce a build step with
the Tailwind CLI — but it isn't required to ship this site.

---

## Folder structure

```
/
├── index.html
├── assets/
│   ├── images/        (QR code, OG share image)
│   ├── fonts/          (empty — add Canela here if licensed)
│   └── icons/          (favicon.svg)
├── css/
│   └── style.css
├── js/
│   └── main.js
└── README.md
```

---

## Running locally

No build step required. From the project folder:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

(Any static file server works — `npx serve`, VS Code's "Live Server", etc.)

---

## Deploying to GitHub Pages

1. Create a new GitHub repository and push this folder's contents to the
   `main` branch:
   ```bash
   git init
   git add .
   git commit -m "Wallitude landing page"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```
2. In the repository, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a
   branch**, branch `main`, folder `/ (root)`.
4. Save. GitHub will publish the site at:
   `https://<your-username>.github.io/<repo-name>/`

No server, backend, or database is required — this is a fully static site.

---

## SEO included

- `<title>` and meta description
- Open Graph + Twitter card tags (using `assets/images/og-image.png`)
- Favicon (`assets/icons/favicon.svg`)
- Semantic HTML (`<header>`, `<main>`, `<section>`, `<footer>`)

No blog, no CMS, no unnecessary scripts.

---

## Performance notes

- No layout-shifting web fonts beyond two Google Font families, loaded with
  `preconnect` for speed.
- All visuals are CSS/SVG — no large images to download except the small QR
  code and OG share image, both already compressed.
- Scroll animations use `IntersectionObserver` with a timed fallback (and a
  `<noscript>` fallback) so content is never stuck invisible for users or
  search engines.
- `prefers-reduced-motion` is respected sitewide.

When you do add real product photography, remember to:
- Export as compressed WebP/JPEG
- Add explicit `width`/`height` attributes
- Use `loading="lazy"` on anything below the fold
