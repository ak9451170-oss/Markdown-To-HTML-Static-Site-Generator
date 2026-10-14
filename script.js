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
let generatedHtml = "";

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
    const response = await fetch("/api/generate", { method: "POST" });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.error || "The website could not be generated.");
    }

    const generatedCount = result.generatedFiles.length;
    const details = [
      `${generatedCount} HTML ${generatedCount === 1 ? "file" : "files"} generated in output/.`
    ];
    if (result.skippedFiles.length > 0) {
      details.push(`${result.skippedFiles.length} unsupported entr${result.skippedFiles.length === 1 ? "y was" : "ies were"} skipped.`);
    }
    if (result.errors.length > 0) {
      details.push(`${result.errors.length} file error${result.errors.length === 1 ? "" : "s"} occurred.`);
    }
    showEditorMessage(details.join(" "), result.errors.length > 0 ? "error" : "success");
  } catch (error) {
    showEditorMessage(error.message || "Could not connect to the Node.js server.", "error");
  } finally {
    generateButton.disabled = false;
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
