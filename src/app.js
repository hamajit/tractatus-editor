import {
  appendChildDigit,
  buildSupplementNumber,
  buildChildrenByParent,
  buildParentIdMap,
  collectSubtreeIds,
  getDepth,
  renumberHierarchy,
  sortPropositions,
  validateNumber
} from "./numbering.js";
import { buildExportFilename, downloadMarkdown, parseMarkdownDocument } from "./markdown.js";
import { SAMPLE_PROPOSITIONS, SAMPLE_TITLE } from "./sample-data.js";
import { clearDocument, loadDocument, saveDocument } from "./store.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeLegacyNumber(number) {
  const normalized = String(number ?? "").trim();

  if (validateNumber(normalized)) {
    return normalized;
  }

  if (/^[1-9]\d*(?:\.\d+0+)$/.test(normalized)) {
    return `${normalized}1`;
  }

  return normalized;
}

export class TractatusEditorApp {
  constructor(root) {
    this.root = root;
    this.state = this.createInitialState();
    this.renderShell();
    this.bindEvents();
    this.renderRows(this.state.activeId);
  }

  createId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }

    return `prop-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  createEmptyProposition(id = this.createId()) {
    return {
      id,
      number: "0",
      text: "",
      note: ""
    };
  }

  createInitialState() {
    const loaded = loadDocument();
    const base = loaded ?? {
      title: SAMPLE_TITLE,
      propositions: SAMPLE_PROPOSITIONS,
      collapsedIds: [],
      noteOpenIds: []
    };

    const propositions =
      Array.isArray(base.propositions) && base.propositions.length > 0
        ? base.propositions.map((proposition) => ({
            id: typeof proposition.id === "string" ? proposition.id : this.createId(),
            number: normalizeLegacyNumber(proposition.number),
            text: String(proposition.text ?? ""),
            note: String(proposition.note ?? "")
          }))
        : SAMPLE_PROPOSITIONS.map((proposition) => ({
            ...proposition,
            id: this.createId(),
            note: proposition.note ?? ""
          }));

    const validIds = new Set(propositions.map((proposition) => proposition.id));

    return {
      title: typeof base.title === "string" ? base.title : SAMPLE_TITLE,
      propositions: sortPropositions(propositions),
      collapsedIds: new Set((base.collapsedIds ?? []).filter((id) => validIds.has(id))),
      noteOpenIds: new Set((base.noteOpenIds ?? []).filter((id) => validIds.has(id))),
      activeId: propositions[0]?.id ?? null,
      message: ""
    };
  }

  renderShell() {
    this.root.innerHTML = `
      <main class="shell">
        <section class="paper">
          <header class="topbar">
            <input id="document-title" class="title-input" type="text" aria-label="論考タイトル" placeholder="論考タイトル" />
            <div class="topbar-actions">
              <button class="button" type="button" data-action="export">エクスポート</button>
              <label class="import-label" for="import-input">インポート</label>
              <input id="import-input" class="import-input" type="file" accept=".md,text/markdown" />
              <button class="danger-button" type="button" data-action="new-document">新規</button>
            </div>
          </header>
          <section class="toolbar">
            <div class="toolbar-actions">
              <button class="ghost-button" type="button" data-action="expand-all">全展開</button>
              <button class="ghost-button" type="button" data-action="collapse-all">全折りたたみ</button>
              <button class="ghost-button" type="button" data-action="renumber">再採番</button>
            </div>
            <div id="status-line" class="status-line" aria-live="polite"></div>
          </section>
          <section class="workspace">
            <div id="proposition-list" class="list"></div>
          </section>
          <section class="helpbar">
            Tab で移動、Ctrl+Enter で子命題、Ctrl+Shift+Enter で兄弟命題、空行で Delete/Backspace すると削除できます。
          </section>
          <footer class="footerbar">
            <button class="add-main-button" type="button" data-action="add-main-global">+ 主命題を追加</button>
            <span id="filename-line" class="status-line">保存先: ブラウザの localStorage / 出力: ${escapeHtml(buildExportFilename(this.state.title || "tractatus"))}</span>
          </footer>
        </section>
      </main>
    `;

    this.titleInput = this.root.querySelector("#document-title");
    this.listElement = this.root.querySelector("#proposition-list");
    this.statusElement = this.root.querySelector("#status-line");
    this.filenameElement = this.root.querySelector("#filename-line");
    this.importInput = this.root.querySelector("#import-input");
  }

  bindEvents() {
    this.root.addEventListener("click", (event) => {
      const actionTarget = event.target.closest("[data-action]");
      if (!actionTarget) {
        return;
      }

      const { action, id } = actionTarget.dataset;

      switch (action) {
        case "export":
          downloadMarkdown(this.state.title, this.state.propositions);
          this.setMessage("Markdown をダウンロードしました。");
          break;
        case "new-document":
          this.resetDocument();
          break;
        case "expand-all":
          this.state.collapsedIds.clear();
          this.persistAndRender();
          break;
        case "collapse-all":
          this.collapseAll();
          break;
        case "renumber":
          this.renumberAll();
          break;
        case "toggle-collapse":
          this.toggleCollapse(id);
          break;
        case "toggle-note":
          this.toggleNote(id);
          break;
        case "add-child":
          this.addChild(id);
          break;
        case "add-sibling":
          this.addSibling(id);
          break;
        case "add-main":
          this.addMain(id);
          break;
        case "add-main-global":
          this.addMain(this.state.activeId);
          break;
        case "add-supplement":
          this.addSupplement(id);
          break;
        case "move-up":
          this.moveProposition(id, -1);
          break;
        case "move-down":
          this.moveProposition(id, 1);
          break;
        case "delete":
          this.deleteProposition(id);
          break;
        default:
          break;
      }
    });

    this.root.addEventListener("input", (event) => {
      const target = event.target;

      if (target === this.titleInput) {
        this.state.title = target.value;
        this.filenameElement.textContent = `保存先: ブラウザの localStorage / 出力: ${buildExportFilename(this.state.title || "tractatus")}`;
        this.persistState();
        return;
      }

      if (target.matches(".text-input")) {
        this.updatePropositionField(target.dataset.id, "text", target.value);
        this.autoResizeTextarea(target);
      }

      if (target.matches(".note-input")) {
        this.updatePropositionField(target.dataset.id, "note", target.value);
        this.autoResizeTextarea(target);
      }
    });

    this.root.addEventListener("change", (event) => {
      const target = event.target;

      if (target === this.importInput) {
        this.importFromFile(target.files?.[0] ?? null);
        target.value = "";
        return;
      }

      if (target.matches(".number-input")) {
        this.applyManualNumber(target.dataset.id, target.value);
      }
    });

    this.root.addEventListener("focusin", (event) => {
      const row = event.target.closest(".row");
      if (!row) {
        return;
      }

      this.state.activeId = row.dataset.id;
      this.persistState();
    });

    this.root.addEventListener("keydown", (event) => {
      const row = event.target.closest(".row");
      if (!row) {
        return;
      }

      const propositionId = row.dataset.id;

      if (event.ctrlKey && event.shiftKey && event.key === "Enter") {
        event.preventDefault();
        this.addSibling(propositionId);
        return;
      }

      if (event.ctrlKey && event.key === "Enter") {
        event.preventDefault();
        this.addChild(propositionId);
        return;
      }

      if ((event.key === "Backspace" || event.key === "Delete") && event.target.matches(".text-input") && event.target.value.trim() === "") {
        event.preventDefault();
        this.deleteProposition(propositionId);
      }
    });
  }

  getSortedPropositions() {
    return sortPropositions(this.state.propositions);
  }

  getHierarchy() {
    const propositions = this.getSortedPropositions();
    const parentIds = buildParentIdMap(propositions);
    const childrenByParent = buildChildrenByParent(propositions, parentIds);

    return { propositions, parentIds, childrenByParent };
  }

  cloneChildrenByParent(childrenByParent) {
    return new Map([...childrenByParent.entries()].map(([key, value]) => [key, [...value]]));
  }

  pruneStateSets() {
    const validIds = new Set(this.state.propositions.map((proposition) => proposition.id));
    this.state.collapsedIds = new Set([...this.state.collapsedIds].filter((id) => validIds.has(id)));
    this.state.noteOpenIds = new Set([...this.state.noteOpenIds].filter((id) => validIds.has(id)));

    if (!validIds.has(this.state.activeId)) {
      this.state.activeId = this.state.propositions[0]?.id ?? null;
    }
  }

  persistState() {
    saveDocument({
      title: this.state.title,
      propositions: this.state.propositions,
      collapsedIds: [...this.state.collapsedIds],
      noteOpenIds: [...this.state.noteOpenIds]
    });
  }

  persistAndRender(focusId = null) {
    this.pruneStateSets();
    this.persistState();
    this.renderRows(focusId);
  }

  setMessage(message) {
    this.state.message = message;
    this.statusElement.textContent = message;
  }

  clearMessage() {
    this.setMessage("");
  }

  isVisible(id, parentIds) {
    let currentId = parentIds.get(id) ?? null;

    while (currentId !== null) {
      if (this.state.collapsedIds.has(currentId)) {
        return false;
      }

      currentId = parentIds.get(currentId) ?? null;
    }

    return true;
  }

  autoResizeTextarea(textarea) {
    textarea.style.height = "0px";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  autoResizeTextareas() {
    this.root.querySelectorAll("textarea").forEach((textarea) => this.autoResizeTextarea(textarea));
  }

  focusTextInput(id) {
    if (!id) {
      return;
    }

    const target = this.root.querySelector(`.text-input[data-id="${id}"]`);
    if (target) {
      target.focus();
      target.selectionStart = target.value.length;
      target.selectionEnd = target.value.length;
    }
  }

  renderRows(focusId = null) {
    if (this.titleInput && this.titleInput.value !== this.state.title) {
      this.titleInput.value = this.state.title;
    }

    if (this.filenameElement) {
      this.filenameElement.textContent = `保存先: ブラウザの localStorage / 出力: ${buildExportFilename(this.state.title || "tractatus")}`;
    }

    this.setMessage(this.state.message);

    const { propositions, parentIds, childrenByParent } = this.getHierarchy();
    const visiblePropositions = propositions.filter((proposition) => this.isVisible(proposition.id, parentIds));

    if (visiblePropositions.length === 0) {
      this.listElement.innerHTML = `
        <div class="empty-state">
          命題はまだありません。下のボタンか Ctrl+Enter で書き始められます。
        </div>
      `;
    } else {
      this.listElement.innerHTML = visiblePropositions
        .map((proposition) => {
          const depth = getDepth(proposition.number);
          const hasChildren = (childrenByParent.get(proposition.id) ?? []).length > 0;
          const isCollapsed = this.state.collapsedIds.has(proposition.id);
          const isNoteOpen = this.state.noteOpenIds.has(proposition.id);

          return `
            <article class="row" data-id="${proposition.id}" style="--depth: ${depth}">
              <div class="row-main">
                <button
                  type="button"
                  class="collapse-toggle ${hasChildren ? "has-children" : ""}"
                  data-action="${hasChildren ? "toggle-collapse" : ""}"
                  data-id="${proposition.id}"
                  aria-label="${hasChildren ? (isCollapsed ? "展開" : "折りたたみ") : "子命題なし"}"
                  ${hasChildren ? "" : "disabled"}
                >${hasChildren ? (isCollapsed ? "▶" : "▼") : "·"}</button>

                <label>
                  <span class="sr-only">命題番号</span>
                  <input
                    class="number-input"
                    type="text"
                    value="${escapeHtml(proposition.number)}"
                    data-id="${proposition.id}"
                    aria-label="命題番号"
                  />
                </label>

                <label>
                  <span class="sr-only">命題本文</span>
                  <textarea
                    class="text-input"
                    rows="1"
                    data-id="${proposition.id}"
                    aria-label="命題本文"
                    placeholder="命題を書く"
                  >${escapeHtml(proposition.text)}</textarea>
                </label>

                <div class="row-actions">
                  <button class="row-action" type="button" data-action="add-child" data-id="${proposition.id}" title="子命題を追加">+子</button>
                  <button class="row-action" type="button" data-action="add-sibling" data-id="${proposition.id}" title="兄弟命題を追加">+兄弟</button>
                  <button class="row-action" type="button" data-action="add-main" data-id="${proposition.id}" title="主命題を追加">+主</button>
                  <button class="row-action" type="button" data-action="add-supplement" data-id="${proposition.id}" title="先行補足命題を追加">+補足</button>
                  <button class="row-action" type="button" data-action="move-up" data-id="${proposition.id}" title="上へ移動">↑</button>
                  <button class="row-action" type="button" data-action="move-down" data-id="${proposition.id}" title="下へ移動">↓</button>
                  <button class="row-action" type="button" data-action="toggle-note" data-id="${proposition.id}" title="脚注を開閉">脚注</button>
                  <button class="row-action delete" type="button" data-action="delete" data-id="${proposition.id}" title="削除">×</button>
                </div>
              </div>

              ${
                isNoteOpen
                  ? `
                    <div class="note-wrap" style="--depth: ${depth}">
                      <div class="note-card">
                        <label class="note-label" for="note-${proposition.id}">脚注</label>
                        <textarea
                          id="note-${proposition.id}"
                          class="note-input"
                          rows="1"
                          data-id="${proposition.id}"
                          aria-label="脚注"
                          placeholder="脚注を書く"
                        >${escapeHtml(proposition.note || "")}</textarea>
                      </div>
                    </div>
                  `
                  : ""
              }
            </article>
          `;
        })
        .join("");
    }

    requestAnimationFrame(() => {
      this.autoResizeTextareas();
      this.focusTextInput(focusId);
    });
  }

  updatePropositionField(id, field, value) {
    const proposition = this.state.propositions.find((item) => item.id === id);
    if (!proposition) {
      return;
    }

    proposition[field] = value;
    this.persistState();
  }

  applyManualNumber(id, rawNumber) {
    const number = rawNumber.trim();
    const proposition = this.state.propositions.find((item) => item.id === id);

    if (!proposition) {
      return;
    }

    if (number === proposition.number) {
      return;
    }

    if (!validateNumber(number)) {
      this.setMessage("番号は `1`、`2.01`、`4.001` のように入力してください。末尾を 0 で終えることはできません。");
      this.renderRows(id);
      return;
    }

    if (this.state.propositions.some((item) => item.id !== id && item.number === number)) {
      this.setMessage("同じ番号の命題がすでに存在します。");
      this.renderRows(id);
      return;
    }

    proposition.number = number;
    this.state.propositions = sortPropositions(this.state.propositions);
    this.clearMessage();
    this.persistAndRender(id);
  }

  applyHierarchyMutation(mutate) {
    try {
      const propositions = this.getSortedPropositions().map((proposition) => ({ ...proposition }));
      const parentIds = buildParentIdMap(propositions);
      const childrenByParent = this.cloneChildrenByParent(buildChildrenByParent(propositions, parentIds));
      const result = mutate({ propositions, parentIds, childrenByParent });

      if (result === false) {
        return;
      }

      const rootIds = childrenByParent.get(null) ?? [];
      const nextPropositions = rootIds.length === 0 ? [] : renumberHierarchy(propositions, parentIds, childrenByParent);

      this.state.propositions = nextPropositions;
      this.state.activeId = result?.focusId ?? this.state.activeId;
      this.clearMessage();
      this.persistAndRender(result?.focusId ?? null);
    } catch (error) {
      this.setMessage(error.message || "操作に失敗しました。");
    }
  }

  findRootAncestorId(id, parentIds) {
    if (!id) {
      return null;
    }

    let currentId = id;
    let parentId = parentIds.get(currentId) ?? null;

    while (parentId !== null) {
      currentId = parentId;
      parentId = parentIds.get(currentId) ?? null;
    }

    return currentId;
  }

  addChild(id) {
    if (!id) {
      this.addMain(null);
      return;
    }

    this.applyHierarchyMutation(({ propositions, parentIds, childrenByParent }) => {
      const proposition = propositions.find((item) => item.id === id);
      if (!proposition) {
        return false;
      }

      const newId = this.createId();
      propositions.push(this.createEmptyProposition(newId));
      parentIds.set(newId, id);
      childrenByParent.set(newId, []);
      (childrenByParent.get(id) ?? []).push(newId);
      return { focusId: newId };
    });
  }

  addSibling(id) {
    if (!id) {
      this.addMain(null);
      return;
    }

    this.applyHierarchyMutation(({ propositions, parentIds, childrenByParent }) => {
      const parentId = parentIds.get(id) ?? null;
      const siblings = childrenByParent.get(parentId) ?? [];
      const currentIndex = siblings.indexOf(id);

      if (currentIndex === -1) {
        return false;
      }

      const newId = this.createId();
      propositions.push(this.createEmptyProposition(newId));
      parentIds.set(newId, parentId);
      childrenByParent.set(newId, []);
      siblings.splice(currentIndex + 1, 0, newId);
      return { focusId: newId };
    });
  }

  addMain(id) {
    if (this.state.propositions.length === 0) {
      const firstProposition = {
        id: this.createId(),
        number: "1",
        text: "",
        note: ""
      };
      this.state.propositions = [firstProposition];
      this.state.activeId = firstProposition.id;
      this.clearMessage();
      this.persistAndRender(firstProposition.id);
      return;
    }

    this.applyHierarchyMutation(({ propositions, parentIds, childrenByParent }) => {
      const roots = childrenByParent.get(null) ?? [];
      const anchorRootId = this.findRootAncestorId(id, parentIds);
      const insertIndex = anchorRootId ? roots.indexOf(anchorRootId) + 1 : roots.length;
      const newId = this.createId();
      propositions.push(this.createEmptyProposition(newId));
      parentIds.set(newId, null);
      childrenByParent.set(newId, []);
      roots.splice(insertIndex, 0, newId);
      return { focusId: newId };
    });
  }

  addSupplement(id) {
    const proposition = this.state.propositions.find((item) => item.id === id);

    if (!proposition) {
      return;
    }

    const number = buildSupplementNumber(
      proposition.number,
      this.state.propositions.map((item) => item.number)
    );

    if (this.state.propositions.some((item) => item.number === number)) {
      this.setMessage("その補足番号はすでに使われています。");
      return;
    }

    const nextProposition = {
      id: this.createId(),
      number,
      text: "",
      note: ""
    };

    this.state.propositions = sortPropositions([...this.state.propositions, nextProposition]);
    this.state.activeId = nextProposition.id;
    this.clearMessage();
    this.persistAndRender(nextProposition.id);
  }

  moveProposition(id, direction) {
    this.applyHierarchyMutation(({ childrenByParent, parentIds }) => {
      const parentId = parentIds.get(id) ?? null;
      const siblings = childrenByParent.get(parentId) ?? [];
      const currentIndex = siblings.indexOf(id);
      const nextIndex = currentIndex + direction;

      if (currentIndex === -1 || nextIndex < 0 || nextIndex >= siblings.length) {
        return false;
      }

      [siblings[currentIndex], siblings[nextIndex]] = [siblings[nextIndex], siblings[currentIndex]];
      return { focusId: id };
    });
  }

  deleteProposition(id) {
    const { propositions, childrenByParent } = this.getHierarchy();
    const target = propositions.find((item) => item.id === id);

    if (!target) {
      return;
    }

    const confirmed = window.confirm(`命題 ${target.number} とその子孫を削除しますか？`);
    if (!confirmed) {
      return;
    }

    const removedIds = new Set(collectSubtreeIds(id, childrenByParent));
    const nextBase = propositions.filter((proposition) => !removedIds.has(proposition.id));

    if (nextBase.length === 0) {
      this.state.propositions = [];
      this.state.activeId = null;
      this.clearMessage();
      this.persistAndRender();
      return;
    }

    try {
      const parentIds = buildParentIdMap(nextBase);
      const nextChildrenByParent = buildChildrenByParent(nextBase, parentIds);
      this.state.propositions = renumberHierarchy(nextBase, parentIds, nextChildrenByParent);
      this.state.activeId = this.state.propositions[0]?.id ?? null;
      this.clearMessage();
      this.persistAndRender();
    } catch (error) {
      this.setMessage(error.message || "削除後の再採番に失敗しました。");
    }
  }

  toggleCollapse(id) {
    if (this.state.collapsedIds.has(id)) {
      this.state.collapsedIds.delete(id);
    } else {
      this.state.collapsedIds.add(id);
    }

    this.persistAndRender();
  }

  collapseAll() {
    const { childrenByParent } = this.getHierarchy();
    this.state.collapsedIds = new Set(
      [...childrenByParent.entries()]
        .filter(([id, children]) => id !== null && children.length > 0)
        .map(([id]) => id)
    );
    this.persistAndRender();
  }

  toggleNote(id) {
    if (this.state.noteOpenIds.has(id)) {
      this.state.noteOpenIds.delete(id);
    } else {
      this.state.noteOpenIds.add(id);
    }

    this.persistAndRender(id);
  }

  renumberAll() {
    try {
      const propositions = this.getSortedPropositions();
      const parentIds = buildParentIdMap(propositions);
      const childrenByParent = buildChildrenByParent(propositions, parentIds);
      this.state.propositions = renumberHierarchy(propositions, parentIds, childrenByParent);
      this.clearMessage();
      this.persistAndRender(this.state.activeId);
    } catch (error) {
      this.setMessage(error.message || "再採番に失敗しました。");
    }
  }

  resetDocument() {
    const confirmed = window.confirm("現在のローカル保存内容を破棄して、サンプル文書に戻しますか？");
    if (!confirmed) {
      return;
    }

    clearDocument();
    this.state = this.createInitialState();
    this.renderRows(this.state.activeId);
  }

  async importFromFile(file) {
    if (!file) {
      return;
    }

    try {
      const markdown = await file.text();
      const imported = parseMarkdownDocument(markdown);

      if (imported.propositions.length === 0) {
        this.setMessage("命題行を読み取れませんでした。");
        return;
      }

      this.state.title = imported.title;
      this.state.propositions = sortPropositions(imported.propositions);
      this.state.collapsedIds.clear();
      this.state.noteOpenIds.clear();
      this.state.activeId = this.state.propositions[0]?.id ?? null;
      this.clearMessage();
      this.persistAndRender(this.state.activeId);
    } catch (error) {
      this.setMessage(error.message || "Markdown の読み込みに失敗しました。");
    }
  }
}
