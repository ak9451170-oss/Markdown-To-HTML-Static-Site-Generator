(function exposeMarkdownConverter(root, createConverter) {
  const converter = createConverter();

  if (typeof module === "object" && module.exports) {
    module.exports = converter;
  } else {
    root.MarkdownConverter = converter;
  }
}(globalThis, function createConverter() {
  function escapeHtml(text) {
    return text.replace(/[&<>"']/g, (character) => {
      const replacements = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      };
      return replacements[character];
    });
  }

  function makeSafeLink(url) {
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") {
        return escapeHtml(parsedUrl.href);
      }
    } catch {
      return "";
    }

    return "";
  }

  function convertInlineMarkdown(text) {
    text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, url) => {
      const safeUrl = makeSafeLink(url.replace(/&amp;/g, "&"));
      return safeUrl ? `<a href="${safeUrl}">${label}</a>` : label;
    });

    text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
    return text;
  }

  function convertMarkdown(markdown) {
    const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
    const htmlParts = [];
    let index = 0;

    while (index < lines.length) {
      const line = lines[index];

      if (line.trim().startsWith("```")) {
        const codeLines = [];
        index += 1;
        while (index < lines.length && !lines[index].trim().startsWith("```")) {
          codeLines.push(lines[index]);
          index += 1;
        }
        htmlParts.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        index += 1;
        continue;
      }

      const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
      if (headingMatch) {
        const headingLevel = headingMatch[1].length;
        const headingText = convertInlineMarkdown(escapeHtml(headingMatch[2]));
        htmlParts.push(`<h${headingLevel}>${headingText}</h${headingLevel}>`);
        index += 1;
        continue;
      }

      if (/^- /.test(line)) {
        const items = [];
        while (index < lines.length && /^- /.test(lines[index])) {
          const itemText = convertInlineMarkdown(escapeHtml(lines[index].slice(2)));
          items.push(`<li>${itemText}</li>`);
          index += 1;
        }
        htmlParts.push(`<ul>${items.join("")}</ul>`);
        continue;
      }

      if (line.trim() === "") {
        index += 1;
        continue;
      }

      const paragraphLines = [];
      while (index < lines.length && lines[index].trim() !== "" &&
        !/^#{1,3}\s+/.test(lines[index]) &&
        !/^- /.test(lines[index]) &&
        !lines[index].trim().startsWith("```")) {
        paragraphLines.push(convertInlineMarkdown(escapeHtml(lines[index])));
        index += 1;
      }
      htmlParts.push(`<p>${paragraphLines.join(" ")}</p>`);
    }

    return htmlParts.join("\n");
  }

  return { convertMarkdown, escapeHtml };
}));
