# Markdown to HTML – Static Site Generator

A beginner-friendly Markdown-to-HTML static site generator. The browser-based editor keeps its live preview, and a small Node.js backend can generate HTML files from Markdown files in `input/`.

## Frontend completed so far

- A dark navy and charcoal theme with teal accents, soft borders, and rounded panels.
- A responsive navigation bar with the project name, Home, Docs, About, and a decorative theme icon.
- A hero section introducing the project, its features, and a CSS-only Markdown-to-webpage illustration.
- An editable Markdown editor with line and character counts, file upload, new/clear document actions, and a Convert to HTML button.
- An HTML preview panel that renders headings, paragraphs, bold/italic text, lists, safe HTTP(S) links, and fenced code blocks.
- A Copy action for copying the generated HTML source to the clipboard.
- A generated-pages catalog with case-insensitive linear search and manual Bubble Sort by filename or title.
- A generated `output/index.html` homepage that links to each successfully created page.
- A four-item feature strip describing Markdown conversion, static sites, Node.js generation, and open source.
- Responsive layouts that place the editor and preview side by side on wider screens and stack them on mobile screens.

## Project files

- **`index.html`** contains the semantic page structure for the hero, editor, preview, and feature sections.
- **`style.css`** contains the color variables, page styling, CSS illustration, panel layouts, and tablet/mobile responsive rules.
- **`script.js`** implements Markdown editing, preview rendering, file upload, menu actions, website generation, generated-page search/sorting, and clipboard copy.
- **`markdown.js`** contains the shared Markdown converter used by both the browser and the Node.js server.
- **`backend/server.js`** serves the frontend and generated pages, exposes `POST /api/generate`, and returns the generated page catalog from `GET /api/pages`.
- **`input/example.md`** is a sample source file to try.
- **`output/`** is created automatically when the generation endpoint runs; generated HTML files and a linked `index.html` homepage are saved here.

## DSA features and complexity

- `linearSearchPages()` in `script.js` visits pages one by one and checks the lowercase filename and title for the lowercase search text. It returns all matches. Its time complexity is **O(n)** for `n` pages and its result array uses **O(k)** extra space for `k` matches.
- `bubbleSortPages()` in `script.js` makes a copy, compares neighboring titles or filenames, and swaps them when they are out of alphabetical order. It does not change the original page list. Its worst-case time complexity is **O(n²)** and its copied array uses **O(n)** extra space. If the list is already sorted, the early-stop check lets it finish in **O(n)** time.
- The browser stores page records in an array; each page is an object with `filename` and `title`. The server uses a `Set` of filenames to avoid collisions, reserving `index.html` for the generated homepage.

The browser editor preview and local `.md` upload continue to work as before. The Generate Website button asks the local Node.js server to process every `.md` file in `input/`; it does not send the editor contents or uploaded file to the server. The editor status area shows generated filenames, skipped files, and any file errors. The desktop/mobile preview icons remain visual only.

## Run the project

Requires Node.js 18 or newer. No npm dependencies are needed.

1. Open a terminal in the project folder.
2. Run `node backend/server.js`.
3. Visit `http://localhost:3000`.

To generate pages, place one or more `.md` files in `input/` and click **Generate Website**. The generated `.html` files and a navigable `output/index.html` homepage appear in `output/`. Search by page title or filename, or choose a sort field and click **Sort**. You can also trigger generation directly with:

```text
POST http://localhost:3000/api/generate
```

For example, use `curl -X POST http://localhost:3000/api/generate`.

Opening `index.html` directly still allows the editor's browser preview, but backend generation requires the Node.js server.
