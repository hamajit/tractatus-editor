const STORAGE_KEY = "tractatus-editor:document";

export function loadDocument() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return {
      title: typeof parsed.title === "string" ? parsed.title : "",
      propositions: Array.isArray(parsed.propositions) ? parsed.propositions : [],
      collapsedIds: Array.isArray(parsed.collapsedIds) ? parsed.collapsedIds : [],
      noteOpenIds: Array.isArray(parsed.noteOpenIds) ? parsed.noteOpenIds : []
    };
  } catch {
    return null;
  }
}

export function saveDocument(documentState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(documentState));
}

export function clearDocument() {
  window.localStorage.removeItem(STORAGE_KEY);
}
