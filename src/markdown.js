import { sortPropositions, validateNumber } from "./numbering.js";

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `prop-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function buildExportFilename(title, date = new Date()) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const slug = (title || "tractatus")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "") || "tractatus";

  return `${slug}_${year}${month}${day}.md`;
}

export function exportMarkdown(title, propositions) {
  const lines = [];
  const footnotes = [];
  let footnoteIndex = 1;

  lines.push(`# ${title || "論考タイトル"}`);
  lines.push("");

  for (const proposition of sortPropositions(propositions)) {
    const hasNote = proposition.note && proposition.note.trim().length > 0;
    const marker = hasNote ? `[^${footnoteIndex}]` : "";
    lines.push(`**${proposition.number}** ${proposition.text || ""}${marker ? ` ${marker}` : ""}`);
    lines.push("");

    if (hasNote) {
      footnotes.push(`[^${footnoteIndex}]: ${proposition.note.trim()}`);
      footnoteIndex += 1;
    }
  }

  if (footnotes.length > 0) {
    lines.push(...footnotes);
    lines.push("");
  }

  return lines.join("\n");
}

export function downloadMarkdown(title, propositions) {
  const content = exportMarkdown(title, propositions);
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = buildExportFilename(title);
  anchor.click();
  URL.revokeObjectURL(url);
}

export function parseMarkdownDocument(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const titleLine = lines.find((line) => /^#\s+/.test(line));
  const title = titleLine ? titleLine.replace(/^#\s+/, "").trim() : "論考タイトル";
  const footnotes = new Map();

  for (const line of lines) {
    const match = line.match(/^\[\^(\d+)\]:\s*(.*)$/);
    if (match) {
      footnotes.set(match[1], match[2]);
    }
  }

  const propositions = [];

  for (const line of lines) {
    const match = line.match(/^\*\*(\d+(?:\.\d+)?)\*\*\s*(.*?)(?:\s+\[\^(\d+)\])?\s*$/);
    if (!match) {
      continue;
    }

    const [, number, text, footnoteId] = match;

    if (!validateNumber(number)) {
      continue;
    }

    propositions.push({
      id: createId(),
      number,
      text,
      note: footnoteId ? footnotes.get(footnoteId) ?? "" : ""
    });
  }

  return { title, propositions };
}
