# Markdown to HTML – Static Site Generator

A beginner-friendly Markdown-to-HTML static site generator. The browser-based editor keeps its live preview, and a small Node.js backend can generate HTML files from Markdown files in `input/`.

## Frontend completed so far

- A dark navy and charcoal theme with teal accents, soft borders, and rounded panels.
- A responsive navigation bar with the project name, Home, Docs, About, and a decorative theme icon.
- A hero section introducing the project, its features, and a CSS-only Markdown-to-webpage illustration.
- An editable Markdown editor with line and character counts, file upload, new/clear document actions, and a Convert to HTML button.
- An HTML preview panel that renders headings, paragraphs, bold/italic text, lists, safe HTTP(S) links, and fenced code blocks.
- A Copy action for copying the generated HTML source to the clipboard.
- A MySQL-backed conversion history for saving, searching, sorting, opening, and deleting conversions.
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
- **`database/schema.sql`** creates the MySQL database and conversion history table; **`database/connection.js`** provides the reusable MySQL connection pool.
- **`.env.example`** documents the required local database settings. Copy it to `.env` and keep real credentials out of Git.
- **`package.json`** lists the runtime dependencies and the start/test commands.
- **`input/example.md`** is a sample source file to try.
- **`output/`** is created automatically when the generation endpoint runs; generated HTML files and a linked `index.html` homepage are saved here.

## DSA features and complexity

- `linearSearchPages()` in `script.js` visits pages one by one and checks the lowercase filename and title for the lowercase search text. It returns all matches. Its time complexity is **O(n)** for `n` pages and its result array uses **O(k)** extra space for `k` matches.
- `bubbleSortPages()` in `script.js` makes a copy, compares neighboring titles or filenames, and swaps them when they are out of alphabetical order. It does not change the original page list. Its worst-case time complexity is **O(n²)** and its copied array uses **O(n)** extra space. If the list is already sorted, the early-stop check lets it finish in **O(n)** time.
- The browser stores page records in an array; each page is an object with `filename` and `title`. The server uses a `Set` of filenames to avoid collisions, reserving `index.html` for the generated homepage.

The browser editor preview and local `.md` upload continue to work as before. The Generate Website button asks the local Node.js server to process every `.md` file in `input/`; it does not send the editor contents or uploaded file to the server. The editor status area shows generated filenames, skipped files, and any file errors. Saved conversion records are separate from generated files: deleting a database record never deletes an HTML file. The desktop/mobile preview icons remain visual only.

## Requirements

Requires Node.js 18 or newer and a running MySQL server. The project uses `mysql2` and `dotenv`.

## Set up MySQL

1. In MySQL Workbench, open `database/schema.sql`, connect to your server, and execute the script. It creates `markdown_converter` and the `conversions` table if they do not exist.
2. Alternatively, from the project folder use the MySQL CLI:

   ```powershell
   Get-Content .\database\schema.sql | mysql -u your_mysql_username -p
   ```

3. Copy the example environment file and edit the copy with your local MySQL account:

   ```powershell
   Copy-Item .env.example .env
   ```

   Set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` in `.env`. The default database name is `markdown_converter`. `.env` is ignored by Git; never commit real credentials.

More details and troubleshooting steps are in [`database/README.md`](./database/README.md).

## Install and run

From a terminal in the project folder:

```powershell
npm install
npm start
```

The server uses port `3000` by default. If you set `PORT`, open `http://localhost:<PORT>` instead. Open the app at [http://localhost:3000](http://localhost:3000) when using the default port. Load the site through the server (not by opening `index.html` directly) to use the APIs, conversion history, and file generation.

## Use the app and APIs

- Edit Markdown, upload a `.md` file, or use **Convert to HTML** to update the browser preview.
- Give a conversion a name and click **Save Conversion**. It appears in Conversion History only after MySQL confirms the insert.
- Search and sort history by name, select **Load** to restore its Markdown and saved HTML, or select **Delete** to remove only that database record.
- Put `.md` files in `input/` and click **Generate Website**. Generated `.html` files and a navigable `output/index.html` appear in `output/`.
- Search generated pages by title or filename and use the existing **Sort** controls.
- The file generator endpoint remains `POST /api/generate`; `GET /api/pages` returns the generated page catalog.
- Conversion endpoints are `POST /api/conversions`, `GET /api/conversions`, `GET /api/conversions/:id`, and `DELETE /api/conversions/:id`.
- `GET /api/health/db` checks the MySQL connection and confirms the conversions table is available.

Run the automated checks with:

```powershell
npm test
```
