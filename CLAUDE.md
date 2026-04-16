# Mag Internal Link Editor

SEO internal link management tool for Ridestore, Dope, and Montec magazine WordPress sites. Built for the SEO team to speed-run internal link audit reports — apply, preview, QA, and save link changes without logging into wp-admin.

## Tech Stack

- **React 18** + **TypeScript** + **Vite 8**
- **Tailwind CSS v4** (via `@tailwindcss/vite` plugin, CSS-based config with `@import "tailwindcss"`)
- **TanStack Query** (React Query v5) for server state
- **Tiptap** rich text editor (installed but visual editor is read-only — see "Important" below)
- **OpenRouter API** (Claude Sonnet) for AI-assisted editing fallback

## Important: Gutenberg Block Content

WordPress uses the **Gutenberg block editor** with **ACF Pro custom blocks**. Post content is stored as block-structured HTML:

```html
<!-- wp:paragraph -->
<p>Text with <a href="/link">internal links</a>.</p>
<!-- /wp:paragraph -->

<!-- wp:acf/product-review {"name":"acf/product-review","data":{...}} /-->
```

**CRITICAL:** All edits MUST preserve `<!-- wp:... -->` block comment delimiters. The visual/WYSIWYG editor (Tiptap) strips these comments, so it is **read-only preview only**. All content editing goes through:
- AI chat (local engine or OpenRouter)
- Find & Replace (operates on raw block markup)
- Raw HTML editor
- Smart-apply engine (for report recommendations)

## Project Structure

```
src/
  config.ts              # Multi-site WordPress config (staging, ridestore, dope, montec)
  api/
    wp-client.ts         # fetch-based REST API client (dynamic site switching)
    posts.ts             # Post CRUD
    content.ts           # Get/update raw content, revisions, revert
    yoast.ts             # Yoast SEO meta read/write
    acf.ts               # ACF field read/write
    categories.ts        # Category listing
    languages.ts         # Polylang languages with real post counts
    ai-chat.ts           # OpenRouter AI + local edit engine
  lib/
    smart-apply.ts       # Recommendation auto-apply engine (sentence matching, link add/remove)
    report-parser.ts     # HTML audit report parser
    find-replace.ts      # Text/link find-replace engine
    block-parser.ts      # Gutenberg block parser (ACF block support)
    url-mapping.ts       # Netlify/live/WP URL mapping for all brands + languages
    diff.ts              # Line-based diff computation
  pages/
    PostEditorPage.tsx   # Main editor (AI chat, blocks, find-replace, raw HTML)
    ReportModePage.tsx   # Content audit report workflow
  components/
    layout/
      PostSidebar.tsx    # Language pills + searchable post list
    editor/
      AiChatEditor.tsx   # AI chat with local edit engine + OpenRouter fallback
      BlockManager.tsx   # ACF block list, edit fields, add/remove blocks
      MediaPicker.tsx    # Image preview + media library picker
      FindReplacePanel.tsx  # Add Link / Edit Links / Text Replace modes
      RawContentEditor.tsx  # Monospace raw HTML textarea
      ContentPreviewModal.tsx  # Article preview popup with Netlify/Live/WP links
      ReviewPreview.tsx  # Visual preview of changes (non-technical)
      DiffPreview.tsx    # Raw HTML diff view
      SaveBar.tsx        # Save/Review/Revert bar
      RichTextEditor.tsx # Tiptap (READ-ONLY preview, do not use for saving)
    report/
      ReportUpload.tsx   # Drag-and-drop HTML report upload
      ReportSummary.tsx  # Stats cards
      ReportArticleList.tsx  # Filterable article list with status tracking
      ArticleRecommendations.tsx  # ADD/KEEP/REMOVE recommendation cards
      RecommendationCard.tsx  # Individual recommendation with Apply/Undo/Preview
    seo/
      YoastPanel.tsx     # Yoast SEO field editor
      AcfLeadPanel.tsx   # ACF Lead field editor
    blocks/              # (exists but block management is in BlockManager.tsx)
```

## WordPress Sites

| Site | Cloudways URL | Username |
|------|---------------|----------|
| Staging | wordpress-1269845-4600687.cloudwaysapps.com | paul@ridestore.com |
| Ridestore Mag | wordpress-1269845-4582241.cloudwaysapps.com | content |
| Dope Mag | wordpress-1269845-4582242.cloudwaysapps.com | content |
| Montec Mag | wordpress-1269845-4582243.cloudwaysapps.com | content |

All sites require these mu-plugins in `wp-content/mu-plugins/`:
- `expose-yoast-meta-rest.php` — Registers Yoast SEO meta keys with `show_in_rest`
- `cors-seo-editor.php` — CORS headers for the editor app

## Smart-Apply Engine (`src/lib/smart-apply.ts`)

The recommendation auto-apply engine handles ADD and REMOVE actions instantly without AI:

**ADD recommendations:**
1. Extracts significant words from the suggested sentence
2. **Pass 1:** Scores individual sentences in `<p>` tags (accent-normalized, splits on `.!?:`)
3. **Pass 2:** If no match, scores sliding windows of 2-3 adjacent sentences (handles multi-sentence rewrites)
4. If match found → replaces the matched sentence text via `string.replace()`
5. If no match → falls back to context-based insertion near a heading/section
6. If anchor text exists unlinked → wraps it in `<a>` tag

**REMOVE recommendations:**
- Default: removes the `<a>` tag AND anchor text AND surrounding separators (`&nbsp;/&nbsp;`, ` / `, ` | `)
- Optional "keep text" mode: strips `<a>` tag only
- Cleans up empty `<li>`, `<!-- wp:list-item -->`, and `<!-- wp:list -->` blocks after removal

**Sentence matching details:**
- Accent normalization (`à` → `a`, `è` → `e`)
- Colon splitting: "Ridestore recommends: For après..." splits at `:` so the prefix is preserved
- 35% word overlap threshold
- Significant words: 4+ chars, excluding common stop words

## AI Chat (`src/api/ai-chat.ts`)

**Local edit engine** handles most instructions instantly (no API call):
- `Make "X" a link to URL` → wraps text in `<a>` tag
- `Remove the link from "X"` → strips `<a>` tag(s)
- `Change the link /old to /new` → replaces href
- `Below "Heading" replace the paragraph with "..."` → finds heading, replaces first `<p>` below it
- `Above/Before/After "Heading" add "..."` → inserts new paragraph block
- `Replace "old text" with "new text"` → direct string replacement
- Markdown links in instructions `[text](url)` auto-converted to HTML

**AI fallback** (OpenRouter):
- Only used for complex instructions the local engine can't pattern-match
- Always tries snippet mode first (sends only the relevant section, not full content)
- Articles >15k chars never sent in full — returns helpful error message instead

## Report Mode

Parses HTML content audit reports generated by an external tool. Structure:
- `.article-card` with id=slug, title, URL, funnel stage, context, role, cluster, reasoning
- `.link-item.link-add` — ADD recommendations with anchor, target URL, reason, suggested sentence
- `.link-item.link-keep` — KEEP recommendations
- `.link-item.link-remove` — REMOVE recommendations

**Batch workflow:** Apply multiple recommendations → each builds on previous edits → undo individually → save once to WordPress.

Progress tracked in localStorage (`mag-editor-report-statuses`, `mag-editor-rec-statuses`).

## URL Mapping (`src/lib/url-mapping.ts`)

Maps WordPress site ID + Polylang language code → frontend URLs:
- **Netlify** preview URL (e.g. `ridestore-mag-en.netlify.app/mag/slug/`)
- **Live** proxied URL (e.g. `www.ridestore.com/mag/slug/`)
- **WordPress** admin URL

Covers all brands (Ridestore, Dope, Montec), sustainability hubs, and staging sites.

## Commands

```bash
npm run dev      # Start Vite dev server
npm run build    # TypeScript check + Vite build
npm run preview  # Preview production build
```

## TypeScript Notes

- `tsconfig.app.json` has `"verbatimModuleSyntax": true` — use `import type` for type-only imports
- `"noUnusedLocals": true` and `"noUnusedParameters": true` are enabled

## Deployment (TODO)

- Target: **Cloudflare Pages** with **Cloudflare Access** (email OTP)
- GitHub repo: `https://github.com/predfern-rs/mag-editor`
- Build: `npm run build`, output: `dist/`
- Env vars set in Cloudflare Pages dashboard (all `VITE_*` vars)
