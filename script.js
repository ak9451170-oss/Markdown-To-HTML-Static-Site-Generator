"use strict";

const editor = document.querySelector("#markdown-editor");
const lineNumbers = document.querySelector("#line-numbers");
const lineCount = document.querySelector("#line-count");
const characterCount = document.querySelector("#character-count");
const editStatus = document.querySelector("#edit-status");
const fileName = document.querySelector("#file-name");
const fileInput = document.querySelector("#markdown-file");
const menuToggle = document.querySelector("#menu-toggle");
const editorMenu = document.querySelector("#editor-menu");
const renderedContent = document.querySelector("#rendered-content");
const htmlOutput = document.querySelector("#html-output");
const editorMessage = document.querySelector("#editor-message");
const copyStatus = document.querySelector("#copy-status");
const convertButton = document.querySelector(".convert-button");
const generateButton = document.querySelector(".generate-button");
const copyButton = document.querySelector(".copy-button");
const pageSearch = document.querySelector("#page-search");
const pageSort = document.querySelector("#page-sort");
const sortPagesButton = document.querySelector(".sort-pages-button");
const pageListMessage = document.querySelector("#page-list-message");
const generatedPageList = document.querySelector("#generated-page-list");
const conversionProjectName = document.querySelector("#conversion-project-name");
const saveConversionButton = document.querySelector(".save-conversion-button");
const historyMessage = document.querySelector("#history-message");
const conversionSearch = document.querySelector("#conversion-search");
const sortConversionsButton = document.querySelector(".sort-conversions-button");
const conversionHistoryList = document.querySelector("#conversion-history-list");
let generatedHtml = "";
let generatedPages = [];
let conversionHistory = [];

function updateEditorDetails() {
  const text = editor.value;
  const lines = text.length === 0 ? 0 : text.split("\n").length;
  lineNumbers.replaceChildren();

  for (let number = 1; number <= lines; number += 1) {
    const line = document.createElement("span");
    line.textContent = number;
    lineNumbers.append(line);
  }

  lineCount.textContent = `${lines} ${lines === 1 ? "line" : "lines"}`;
  characterCount.textContent = `${text.length} ${text.length === 1 ? "character" : "characters"}`;
}

function resetPreviewState(message, kind = "") {
  generatedHtml = "";
  renderedContent.textContent = message;
  htmlOutput.textContent = "";
  showEditorMessage(kind ? message : "", kind);
}

function showEditorMessage(message, kind = "") {
  editorMessage.textContent = message;
  editorMessage.dataset.kind = kind;
}

function isValidPageList(pages) {
  if (!Array.isArray(pages)) {
    return false;
  }

  for (const page of pages) {
    if (!page || typeof page !== "object" ||
      typeof page.title !== "string" ||
      typeof page.filename !== "string" ||
      !/^[a-zA-Z0-9_-]+\.html$/i.test(page.filename) ||
      page.filename.toLowerCase() === "index.html") {
      return false;
    }
  }

  return true;
}

function isValidConversionList(conversions) {
  return Array.isArray(conversions) && conversions.every((conversion) =>
    conversion && typeof conversion === "object" &&
    Number.isSafeInteger(conversion.id) && conversion.id > 0 &&
    typeof conversion.project_name === "string" &&
    typeof conversion.created_at === "string"
  );
}

// Checks each page in order and matches either its title or filename.
function linearSearchPages(pages, query) {
  const searchText = query.trim().toLowerCase();
  const matchingPages = [];

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    const filename = page.filename.toLowerCase();
    const title = page.title.toLowerCase();

    if (!searchText || filename.includes(searchText) || title.includes(searchText)) {
      matchingPages.push(page);
    }
  }

  return matchingPages;
}

// Bubble Sort compares neighboring pages; copying first keeps the source list unchanged.
function bubbleSortPages(pages, sortBy) {
  const sortedPages = pages.slice();
  let hasSwapped = true;

  for (let end = sortedPages.length - 1; end > 0 && hasSwapped; end -= 1) {
    hasSwapped = false;
    for (let index = 0; index < end; index += 1) {
      const leftValue = sortedPages[index][sortBy].toLowerCase();
      const rightValue = sortedPages[index + 1][sortBy].toLowerCase();

      if (leftValue > rightValue) {
        const temporaryPage = sortedPages[index];
        sortedPages[index] = sortedPages[index + 1];
        sortedPages[index + 1] = temporaryPage;
        hasSwapped = true;
      }
    }
  }

  return sortedPages;
}

function updateGeneratedPageList() {
  const query = pageSearch.value;
  const matchingPages = linearSearchPages(generatedPages, query);
  const visiblePages = bubbleSortPages(matchingPages, pageSort.value);
  generatedPageList.replaceChildren();

  if (generatedPages.length === 0) {
    pageListMessage.textContent = "No generated pages yet. Add .md files and generate your website.";
    return;
  }

  if (visiblePages.length === 0) {
    pageListMessage.textContent = `No pages match "${query.trim()}".`;
    return;
  }

  pageListMessage.textContent = `${visiblePages.length} ${visiblePages.length === 1 ? "page" : "pages"} shown.`;
  for (const page of visiblePages) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    const filename = document.createElement("small");

    link.href = `output/${encodeURIComponent(page.filename)}`;
    link.textContent = page.title;
    filename.textContent = page.filename;
    item.append(link, filename);
    generatedPageList.append(item);
  }
}

async function loadGeneratedPages() {
  try {
    const response = await fetch("/api/pages");
    const result = await response.json();
    if (!response.ok || !result.success || !isValidPageList(result.pages)) {
      throw new Error(result.error || "The generated page list could not be loaded.");
    }
    generatedPages = result.pages;
    updateGeneratedPageList();
  } catch {
    pageListMessage.textContent = "Could not load generated pages. Make sure the Node.js server is running.";
  }
}

function updateConversionHistory() {
  const matchingConversions = linearSearchPages(conversionHistory, conversionSearch.value);
  const visibleConversions = bubbleSortPages(matchingConversions, "title");
  conversionHistoryList.replaceChildren();

  if (conversionHistory.length === 0) {
    historyMessage.textContent = "No saved conversions yet.";
    return;
  }

  if (visibleConversions.length === 0) {
    historyMessage.textContent = `No conversions match "${conversionSearch.value.trim()}".`;
    return;
  }

  historyMessage.textContent = `${visibleConversions.length} saved ${visibleConversions.length === 1 ? "conversion" : "conversions"}.`;
  for (const conversion of visibleConversions) {
    const item = document.createElement("li");
    const details = document.createElement("div");
    const name = document.createElement("strong");
    const date = document.createElement("small");
    const actions = document.createElement("div");
    const loadButton = document.createElement("button");
    const deleteButton = document.createElement("button");

    details.className = "conversion-history-details";
    name.textContent = conversion.title;
    date.textContent = `Saved ${new Date(conversion.created_at).toLocaleString()}`;
    details.append(name, date);

    actions.className = "conversion-history-actions";
    loadButton.type = "button";
    loadButton.className = "history-action-button";
    loadButton.dataset.loadConversion = String(conversion.id);
    loadButton.textContent = "Load";
    deleteButton.type = "button";
    deleteButton.className = "history-action-button history-delete-button";
    deleteButton.dataset.deleteConversion = String(conversion.id);
    deleteButton.textContent = "Delete";
    actions.append(loadButton, deleteButton);

    item.append(details, actions);
    conversionHistoryList.append(item);
  }
}

async function loadConversionHistory() {
  historyMessage.textContent = "Loading saved conversions...";
  try {
    const response = await fetch("/api/conversions");
    const result = await response.json();
    if (!response.ok || !result.success || !isValidConversionList(result.conversions)) {
      throw new Error(result.error || "Conversion history could not be loaded.");
    }

    conversionHistory = result.conversions.map((conversion) => ({
      id: conversion.id,
      title: conversion.project_name,
      filename: String(conversion.id),
      created_at: conversion.created_at
    }));
    updateConversionHistory();
  } catch (error) {
    conversionHistory = [];
    conversionHistoryList.replaceChildren();
    historyMessage.textContent = error.message || "History unavailable. Check the database connection and project setup.";
  }
}

async function saveConversion() {
  const projectName = conversionProjectName.value.trim();
  if (!projectName || projectName.length > 255) {
    showEditorMessage("Enter a conversion name of 1 to 255 characters.", "error");
    conversionProjectName.focus();
    return;
  }
  if (!editor.value.trim()) {
    showEditorMessage("Enter some Markdown before saving a conversion.", "error");
    editor.focus();
    return;
  }

  saveConversionButton.disabled = true;
  showEditorMessage("Saving conversion to the database...", "");
  try {
    const response = await fetch("/api/conversions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectName,
        markdownContent: editor.value
      })
    });
    const result = await response.json();
    if (!response.ok || !result.success || !Number.isSafeInteger(result.id) || result.id < 1) {
      throw new Error(result.error || `Conversion could not be saved (HTTP ${response.status}).`);
    }

    showEditorMessage(`Conversion saved to history (ID: ${result.id}).`, "success");
    await loadConversionHistory();
  } catch (error) {
    showEditorMessage(error.message || "Conversion could not be saved.", "error");
  } finally {
    saveConversionButton.disabled = false;
  }
}

async function loadSavedConversion(id) {
  try {
    const response = await fetch(`/api/conversions/${encodeURIComponent(id)}`);
    const result = await response.json();
    const conversion = result && result.conversion;
    if (!response.ok || !result.success || !conversion ||
      typeof conversion.markdown_content !== "string" ||
      typeof conversion.generated_html !== "string" ||
      typeof conversion.project_name !== "string") {
      throw new Error(result.error || "The selected conversion could not be loaded.");
    }

    editor.value = conversion.markdown_content;
    conversionProjectName.value = conversion.project_name;
    fileName.textContent = `${conversion.project_name}.md`;
    editStatus.innerHTML = "<i></i> Saved conversion";
    updateEditorDetails();
    generatedHtml = conversion.generated_html;
    renderedContent.innerHTML = generatedHtml;
    htmlOutput.textContent = generatedHtml;
    showEditorMessage(`Loaded "${conversion.project_name}" from history.`, "success");
  } catch (error) {
    showEditorMessage(error.message || "The selected conversion could not be loaded.", "error");
  }
}

async function deleteSavedConversion(id, name) {
  if (!window.confirm(`Delete the saved conversion "${name}"? This will not delete generated HTML files.`)) {
    return;
  }

  try {
    const response = await fetch(`/api/conversions/${encodeURIComponent(id)}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.error || `Conversion could not be deleted (HTTP ${response.status}).`);
    }
    historyMessage.textContent = `Deleted "${name}" from conversion history.`;
    await loadConversionHistory();
  } catch (error) {
    historyMessage.textContent = error.message || "The conversion could not be deleted.";
  }
}

function convertAndRender() {
  const markdown = editor.value.trim();

  if (!markdown) {
    resetPreviewState("Your preview will appear here once you add some Markdown.");
    showEditorMessage("Enter some Markdown before converting.", "error");
    return;
  }

  generatedHtml = MarkdownConverter.convertMarkdown(markdown);
  renderedContent.innerHTML = generatedHtml;
  htmlOutput.textContent = generatedHtml;
  showEditorMessage("HTML preview updated.", "success");
}

function closeEditorMenu() {
  editorMenu.hidden = true;
  menuToggle.setAttribute("aria-expanded", "false");
}

function clearEditor() {
  editor.value = "";
  fileName.textContent = "untitled.md";
  editStatus.innerHTML = "<i></i> Ready";
  updateEditorDetails();
  resetPreviewState("Your preview will appear here once you add some Markdown.");
  showEditorMessage("Editor cleared.", "success");
  closeEditorMenu();
}

editor.addEventListener("input", () => {
  editStatus.innerHTML = "<i></i> Modified";
  updateEditorDetails();

  if (!editor.value.trim()) {
    resetPreviewState("Your preview will appear here once you add some Markdown.");
    showEditorMessage("Enter some Markdown before converting.", "error");
    return;
  }

  convertAndRender();
});

editor.addEventListener("scroll", () => {
  lineNumbers.scrollTop = editor.scrollTop;
});

menuToggle.addEventListener("click", () => {
  editorMenu.hidden = !editorMenu.hidden;
  menuToggle.setAttribute("aria-expanded", String(!editorMenu.hidden));
});

editorMenu.addEventListener("click", (event) => {
  const action = event.target.closest("[data-menu-action]")?.dataset.menuAction;
  closeEditorMenu();

  if (action === "upload") {
    fileInput.click();
  } else if (action === "new") {
    if (editor.value && !window.confirm("Start a new document and clear the current Markdown?")) {
      return;
    }
    clearEditor();
  } else if (action === "clear") {
    if (window.confirm("Clear all Markdown from the editor?")) {
      clearEditor();
    }
  }
});

document.addEventListener("click", (event) => {
  if (!editorMenu.hidden && !editorMenu.contains(event.target) && !menuToggle.contains(event.target)) {
    closeEditorMenu();
  }
});

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) {
    return;
  }

  if (!file.name.toLowerCase().endsWith(".md")) {
    showEditorMessage("Unsupported file type. Please choose a .md file.", "error");
    fileInput.value = "";
    return;
  }

  try {
    editor.value = await file.text();
    fileName.textContent = file.name;
    conversionProjectName.value = file.name.replace(/\.md$/i, "");
    editStatus.innerHTML = "<i></i> Modified";
    updateEditorDetails();
    convertAndRender();
    showEditorMessage(`${file.name} loaded successfully.`, "success");
  } catch {
    showEditorMessage("The file could not be read. Please try another .md file.", "error");
  }
  fileInput.value = "";
});

convertButton.addEventListener("click", convertAndRender);

generateButton.addEventListener("click", async () => {
  generateButton.disabled = true;
  showEditorMessage("Generating HTML files from the input folder...", "");

  try {
    let response;
    try {
      response = await fetch("/api/generate", { method: "POST" });
    } catch {
      throw new Error("Could not connect to the Node.js server. Make sure it is running at http://localhost:3000.");
    }

    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error(`The server returned an invalid response (HTTP ${response.status}).`);
    }

    if (!result || typeof result !== "object" || Array.isArray(result)) {
      throw new Error("The server returned an incomplete generation report.");
    }

    if (!response.ok || !result.success) {
      throw new Error(result.error || `The website could not be generated (HTTP ${response.status}).`);
    }

    const reportFields = ["generatedFiles", "skippedFiles", "errors", "pages"];
    const missingFields = reportFields.filter((field) => !Array.isArray(result[field]));
    if (missingFields.includes("pages")) {
      throw new Error("The running server returned no page metadata. Stop it with Ctrl+C and restart it using `node backend/server.js`, then reload this page.");
    }
    if (missingFields.length > 0) {
      throw new Error(`The server returned an incomplete generation report. Missing: ${missingFields.join(", ")}.`);
    }
    if (reportFields.slice(0, 3).some((field) =>
      result[field].some((item) => typeof item !== "string")
    ) || !isValidPageList(result.pages)) {
      throw new Error("The server returned an incomplete generation report.");
    }

    generatedPages = result.pages;
    updateGeneratedPageList();

    const details = [
      "Website generation completed.",
      `Generated files: ${result.generatedFiles.length
        ? result.generatedFiles.map((name) => `output/${name}`).join(", ")
        : "none"}`
    ];
    if (result.skippedFiles.length > 0) {
      details.push(`Skipped files: ${result.skippedFiles.join(", ")}`);
    }
    if (result.errors.length > 0) {
      details.push(`Errors: ${result.errors.join("; ")}`);
    }
    showEditorMessage(details.join("\n"), result.errors.length > 0 ? "error" : "success");
  } catch (error) {
    showEditorMessage(error.message || "The website could not be generated.", "error");
  } finally {
    generateButton.disabled = false;
  }
});

pageSearch.addEventListener("input", updateGeneratedPageList);
sortPagesButton.addEventListener("click", updateGeneratedPageList);
conversionSearch.addEventListener("input", updateConversionHistory);
sortConversionsButton.addEventListener("click", updateConversionHistory);
saveConversionButton.addEventListener("click", saveConversion);
conversionHistoryList.addEventListener("click", (event) => {
  const loadButton = event.target.closest("[data-load-conversion]");
  if (loadButton) {
    loadSavedConversion(loadButton.dataset.loadConversion);
    return;
  }

  const deleteButton = event.target.closest("[data-delete-conversion]");
  if (deleteButton) {
    const conversion = conversionHistory.find((item) =>
      item.id === Number(deleteButton.dataset.deleteConversion)
    );
    if (conversion) {
      deleteSavedConversion(conversion.id, conversion.title);
    }
  }
});

copyButton.addEventListener("click", async () => {
  if (!generatedHtml) {
    copyStatus.textContent = "Convert Markdown first";
    return;
  }

  try {
    await navigator.clipboard.writeText(generatedHtml);
    copyStatus.textContent = "Copied!";
  } catch {
    copyStatus.textContent = "Clipboard unavailable";
  }
  window.setTimeout(() => {
    copyStatus.textContent = "";
  }, 2500);
});

updateEditorDetails();
loadGeneratedPages();
loadConversionHistory();
