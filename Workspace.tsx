/// <reference types="react-dom/next" />
/// <reference types="react/next" />
import * as Lib from "@bqnpad/lib";
import * as Autocomplete from "@codemirror/autocomplete";
import * as History from "@codemirror/history";
import * as State from "@codemirror/state";
import * as View from "@codemirror/view";
import * as React from "react";

import * as Editor from "./Editor";
import * as EditorBQN from "./EditorBQN";
import { GlyphsPalette } from "./GlyphPalette";
import * as REPL from "./REPL";
import { REPLWebWorkerClient } from "./REPLWebWorkerClient";
import * as UI from "./UI";
import * as Workspace0 from "./Workspace0";
import type { WorkspaceManager } from "./WorkspaceManager";

// TODO: need to infer this from CSS
// line-height (1.4) * fontSize (20)
const LINE_HEIGHT = 28;

export type WorkspaceProps = {
  manager: WorkspaceManager;
};

export function Workspace({ manager }: WorkspaceProps) {
  let workspace0 = manager.load().getOrSuspend();
  let doc0 = React.useMemo(
    () => State.Text.of(workspace0.doc.split("\n")),
    [workspace0],
  );
  let editor = React.useRef<null | View.EditorView>(null);

  let [showGlyphbar, setShowGlyphbar] = Lib.ReactUtil.usePersistentState(
    "bqnpad-pref-showGlyphbar",
    () => true,
  );

  let [enableLivePreview, setEnableLivePreview] =
    Lib.ReactUtil.usePersistentState(
      "bqnpad-pref-enableLivePreview",
      () => true,
    );

  let config = Editor.useStateField<WorkspaceConfig>(
    editor,
    { enableLivePreview },
    [enableLivePreview],
  );
  let [{ status }, workspace] = useWorkspace(workspace0, config);

  React.useEffect(() => {
    workspace.commands.focusCurrentCell(editor.current!);
  }, [editor, workspace]);

  let [onDoc, _onDocFlush, onDocCancel] = Lib.ReactUtil.useDebouncedCallback(
    1000,
    (_doc, state: State.EditorState) => {
      manager.store((_) => workspace.toWorkspace0(state));
    },
    [manager, workspace],
  );

  let extensions = React.useMemo(
    () => [EditorBQN.bqn(), workspace.extension],
    [workspace],
  );

  let keybindings: View.KeyBinding[] = React.useMemo<View.KeyBinding[]>(() => {
    return [
      { key: "Mod-a", run: workspace.commands.selectCell },
      { key: "Shift-Enter", run: workspace.commands.addCell },
      { key: "Enter", run: workspace.commands.reuseCell },
      { key: "Tab", run: Autocomplete.startCompletion },
    ];
  }, [workspace]);

  let onGlyph = React.useCallback(
    (glyph: EditorBQN.Glyph) => {
      let view = editor.current!;
      if (!view.hasFocus) view.focus();
      let currentCell = workspace.query.currentCell(view.state);
      let { from, to } = view.state.selection.main;
      if (from < currentCell.from) {
        view.dispatch({
          changes: {
            from: currentCell.to,
            to: currentCell.to,
            insert: glyph.glyph,
          },
          selection: State.EditorSelection.cursor(currentCell.to + 1),
        });
      } else {
        view.dispatch({
          changes: { from, to, insert: glyph.glyph },
          selection: State.EditorSelection.cursor(to + 1, 1),
        });
      }
    },
    [editor, workspace],
  );

  let onSave = React.useCallback(() => {
    let data = editor.current!.state.doc.sliceString(0);
    let blob = new Blob([data], { type: "text/csv" });
    download(blob, "bqnpad-workspace.bqn");
  }, [editor]);

  let onNew = React.useCallback(() => {
    let state = editor.current!.state;
    let { doc, currentSession, prevSessions, currentCell } =
      workspace.toWorkspace0(state);
    doc = doc.slice(0, currentCell.from);
    currentCell = {
      from: doc.length,
      to: doc.length,
      result: null,
    };
    if (currentSession.cells.length === 0) return;
    if (!doc.endsWith("\n")) doc += "\n";
    let newW: Workspace0.Workspace0 = {
      doc,
      prevSessions: prevSessions.concat(currentSession),
      currentSession: {
        createdAt: Date.now(),
        cells: [],
      },
      currentCell: {
        from: doc.length,
        to: doc.length + 1,
        result: null,
      },
    };
    onDocCancel();
    manager.store((_) => newW);
    manager.restart();
  }, [editor]);

  return (
    <div className="Workspace">
      <div className="WorkspaceHeader">
        <div className="Toolbar">
          <div className="title">
            <a
              target="_blank"
              href="https://mlochbaum.github.io/BQN/index.html"
            >
              BQN
            </a>
            PAD
          </div>
        </div>
        <div className="Toolbar">
          <div className="Toolbar__section">
            <div className="label">SESSION: </div>
            <UI.Button
              title="Create new session"
              onClick={() => {
                onNew();
              }}
            >
              NEW
            </UI.Button>
            <UI.Button
              title="Restart current session"
              onClick={() => manager.restart()}
            >
              RESTART
            </UI.Button>
            <UI.Button
              title="Download workspace as .bqn source file"
              onClick={onSave}
            >
              DOWNLOAD
            </UI.Button>
          </div>
          {status != null && (
            <div className="Toolbar__section">
              <div className="label">VM: </div>
              <div
                className="Toolbar__element"
                style={{
                  color:
                    status === "idle"
                      ? "green"
                      : status === "running"
                      ? "orange"
                      : undefined,
                }}
              >
                {status.toUpperCase().padEnd(7, "\u00A0")}
              </div>
            </div>
          )}
          <div className="Toolbar__section">
            <div className="label">PREFERENCES: </div>
            <UI.Checkbox
              value={enableLivePreview}
              onValue={setEnableLivePreview}
            >
              LIVE PREVIEW
            </UI.Checkbox>
            <UI.Checkbox value={showGlyphbar} onValue={setShowGlyphbar}>
              SHOW GLYPHBAR
            </UI.Checkbox>
          </div>
        </div>
        {showGlyphbar && <GlyphsPalette onClick={onGlyph} />}
      </div>
      <Editor.Editor
        className="Editor"
        api={editor}
        doc={doc0}
        onDoc={onDoc}
        extensions={extensions}
        keybindings={keybindings}
      />
    </div>
  );
}

function useWorkspace(
  workspace0: Workspace0.Workspace0 = Workspace0.empty,
  config: WorkspaceConfig | State.StateField<WorkspaceConfig>,
): readonly [WorkspaceState, Workspace] {
  let repl = React.useMemo(() => {
    if (Lib.WorkerUtil.supportsWorkerModule()) {
      return new REPLWebWorkerClient();
    } else {
      // Those browsers (looking at you, Firefox) which don't support WebWorker
      // type=module will get in process REPL.
      //
      // - Firefox: https://bugzilla.mozilla.org/show_bug.cgi?id=1247687
      return new REPL.REPL();
    }
  }, []);
  let w = React.useMemo(
    () => workspace(repl, workspace0, config),
    [repl, workspace0],
  );
  let status = REPL.useREPLStatus(repl);
  return [{ status }, w] as const;
}

type WorkspaceConfig = {
  enableLivePreview: boolean;
};

type Workspace = {
  query: {
    currentCell: (state: State.EditorState) => WorkspaceCell;
    prevCells: (state: State.EditorState) => Iterable<WorkspaceCell>;
    cells: (state: State.EditorState) => Iterable<WorkspaceCell>;
    allCells: (state: State.EditorState) => Iterable<WorkspaceCell>;
  };

  commands: {
    addCell: View.Command;
    selectCell: View.Command;
    reuseCell: View.Command;
    focusCurrentCell: View.Command;
  };

  extension: State.Extension[];
  toWorkspace0: (state: State.EditorState) => Workspace0.Workspace0;
};

export type WorkspaceCell = {
  idx: number;
  from: number;
  to: number;
  result: null | Lib.PromiseUtil.Deferred<REPL.REPLResult>;
  resultPreview: null | REPL.REPLResult;
};

type WorkspaceState = {
  readonly status: REPL.REPLStatus | null;
};

function workspace(
  repl: REPL.IREPL,
  workspace0: Workspace0.Workspace0 = Workspace0.empty,
  config0: WorkspaceConfig | State.StateField<WorkspaceConfig>,
): Workspace {
  let config =
    config0 instanceof State.StateField
      ? config0
      : State.StateField.define({
          create() {
            return config0;
          },
          update(config) {
            return config;
          },
        });

  let prevCellsField = State.StateField.define<WorkspaceCell[]>({
    create() {
      return workspace0.prevSessions.flatMap((session) =>
        session.cells.map(
          (cell, idx): WorkspaceCell => ({
            idx,
            from: cell.from,
            to: cell.to,
            result: null,
            resultPreview: cell.result,
          }),
        ),
      );
    },
    update(state) {
      return state;
    },
  });

  let addCellEffect = State.StateEffect.define<WorkspaceCell>();
  let cellsField = State.StateField.define<WorkspaceCell[]>({
    create() {
      return workspace0.currentSession.cells.map(
        (cell, idx): WorkspaceCell => ({
          idx,
          from: cell.from,
          to: cell.to,
          result: null,
          resultPreview: cell.result,
        }),
      );
    },
    update(state, tr) {
      let nextState = state;
      for (let e of tr.effects)
        if (e.is(addCellEffect)) {
          if (nextState === state) nextState = nextState.slice(0);
          let cell = e.value;
          nextState.push(cell);
        }
      return nextState;
    },
  });

  let currentCellField = State.Facet.define<WorkspaceCell>();

  let computeCurrentCellField = currentCellField.compute(
    ["doc", cellsField],
    (state): WorkspaceCell => {
      let cells: { from: number; to: number }[] = state.field(cellsField);
      if (cells.length === 0) {
        let session =
          workspace0.prevSessions[workspace0.prevSessions.length - 1];
        cells = session?.cells ?? [];
      }
      let from = cells[cells.length - 1]?.to ?? 0;
      let to = state.doc.length;
      return {
        idx: cells.length,
        from,
        to,
        result: Lib.PromiseUtil.deferred(),
        resultPreview: null,
      };
    },
  );

  let prevOutputWidgets = View.EditorView.decorations.compute(
    [prevCellsField],
    (state) => {
      let cells = state.field(prevCellsField);
      if (cells.length === 0) return View.Decoration.none;
      else
        return View.Decoration.set(
          cells.map((cell) => {
            let widget = new CellOutputWidget(cell);
            let deco = View.Decoration.widget({
              widget,
              block: true,
              side: 1,
            });
            return deco.range(cell.to - 1);
          }),
        );
    },
  );

  let outputWidgets = View.EditorView.decorations.compute(
    [cellsField],
    (state) => {
      let cells = state.field(cellsField);
      if (cells.length === 0) return View.Decoration.none;
      else
        return View.Decoration.set(
          cells.map((cell) => {
            let widget = new CellOutputWidget(cell);
            let deco = View.Decoration.widget({
              widget,
              block: true,
              side: 1,
            });
            return deco.range(cell.to - 1);
          }),
        );
    },
  );

  let sessionBanner = View.EditorView.decorations.compute([], (_state) => {
    let ranges: View.Range<View.Decoration>[] = [];

    let add = (
      session: Workspace0.Session0,
      pos: number | undefined = undefined,
    ) => {
      let firstCell = session.cells[0];
      let from =
        firstCell == null || firstCell.from === firstCell.to
          ? pos
          : firstCell.from;
      if (from == null) return;
      let deco = View.Decoration.widget({
        widget: new SessionBanner(session.createdAt),
        block: true,
        side: -1,
      });
      ranges.push(deco.range(from));
    };

    for (let session of workspace0.prevSessions) add(session);
    add(workspace0.currentSession, workspace0.currentCell.from);

    return View.Decoration.set(ranges);
  });

  let preview = View.EditorView.decorations.compute(
    ["doc", currentCellField, config],
    (state) => {
      let { enableLivePreview } = state.field(config);
      if (!enableLivePreview) {
        return View.Decoration.none;
      }
      let cell = state.facet(currentCellField)[0]!;
      let code = state.doc.sliceString(cell.from, cell.to);
      let deco = View.Decoration.widget({
        widget: new PreviewOutputWidget(cell, code, repl),
        block: true,
        side: 1,
      });
      return View.Decoration.set([deco.range(cell.to)]);
    },
  );

  let placeholderWidget = View.Decoration.widget({
    widget: new PlaceholderWidget("..."),
    side: 1,
  });

  let placeholder = View.EditorView.decorations.compute(
    ["doc", cellsField],
    (state) => {
      let { from, to } = currentCell(state);
      if (from - to === 0)
        return View.Decoration.set([placeholderWidget.range(from)]);
      else return View.Decoration.none;
    },
  );

  let ignoreCellEdits = State.EditorState.transactionFilter.of(
    (tr: State.Transaction) => {
      if (tr.docChanged) {
        let currentCell = query.currentCell(tr.startState);
        let cut = currentCell.from;
        let block = false;
        tr.changes.iterChangedRanges((from, to) => {
          if (from < cut || to < cut) block = true;
        });
        if (block) return [] as State.TransactionSpec[];
      }
      return tr as State.TransactionSpec;
    },
  );

  let onInit = View.ViewPlugin.fromClass(
    class {
      constructor(view: View.EditorView) {
        let state = view.state;
        // Start evaluating cells
        let cells = query.cells(state);
        for (let cell of cells) {
          if (cell.result == null) {
            let code = state.doc.sliceString(cell.from, cell.to);
            cell.result = Lib.PromiseUtil.deferred();
            repl.eval(code).then(cell.result.resolve, cell.result.reject);
          }
        }
      }
    },
  );

  let onSelection = View.ViewPlugin.fromClass(
    class {
      constructor() {}
      update(up: View.ViewUpdate) {
        let view = up.view;
        if (!up.selectionSet) return;
        let sel = up.state.selection.main;
        view.requestMeasure<{ cursor: View.Rect | null; scroller: DOMRect }>({
          read() {
            return {
              scroller: view.scrollDOM.getBoundingClientRect(),
              cursor: view.coordsAtPos(sel.anchor),
            };
          },
          write({ cursor, scroller }) {
            if (cursor == null) return;
            let diff = scroller.bottom - cursor.bottom;
            if (diff < 150) view.scrollDOM.scrollTop += 150 - diff;
          },
        });
      }
    },
  );

  // Query

  let cells = (state: State.EditorState) => state.field(cellsField);
  let prevCells = (state: State.EditorState) => state.field(prevCellsField);
  let currentCell = (state: State.EditorState) =>
    state.facet(currentCellField)[0]!;
  function* allCells(state: State.EditorState) {
    for (let cell of state.field(cellsField)) yield cell;
    for (let cell of state.field(prevCellsField)) yield cell;
  }

  let query = {
    cells,
    prevCells,
    allCells,
    currentCell,
  };

  // Commands

  let addCell = (view: View.EditorView) => {
    let currentCell = query.currentCell(view.state);
    if (currentCell.to - currentCell.from === 0) return true;
    let cell: WorkspaceCell = {
      idx: currentCell.idx,
      from: currentCell.from,
      to: currentCell.to + 1,
      result: Lib.PromiseUtil.deferred(),
      resultPreview: currentCell.result?.isResolved
        ? currentCell.result.value
        : null,
    };
    let code = view.state.doc.sliceString(currentCell.from, currentCell.to);
    repl.eval(code).then(cell.result!.resolve, cell.result!.reject);
    view.dispatch({
      changes: { from: currentCell.to, to: currentCell.to, insert: "\n" },
      effects: [addCellEffect.of(cell)],
      selection: State.EditorSelection.cursor(currentCell.to + 1),
      scrollIntoView: true,
    });
    // TODO: Below we reset history state to initial as we cannot back in time
    // after we've eval'ed some code.
    let history = view.state.field(History.historyField) as any;
    history.done = [];
    history.undone = [];
    history.prevTime = 0;
    history.prevUserEvent = undefined;
    return true;
  };

  let reuseCell = (view: View.EditorView) => {
    let currentCell = query.currentCell(view.state);
    if (view.state.selection.ranges.length !== 1) return false;
    let sel = view.state.selection.main;
    if (sel.from >= currentCell.from) return false;
    for (let cell of query.allCells(view.state)) {
      if (sel.from >= cell.from && sel.to < cell.to) {
        addCell(view);
        let code = view.state.doc.sliceString(cell.from, cell.to - 1);
        let to = view.state.doc.length;
        view.dispatch({
          changes: { from: to, to, insert: code },
          selection: State.EditorSelection.cursor(to),
          scrollIntoView: true,
        });
        return true;
      }
    }
    return false;
  };

  let selectCell = (view: View.EditorView) => {
    let currentCell = query.currentCell(view.state);
    let sel = view.state.selection.main;
    if (sel.from >= currentCell.from) {
      view.dispatch({
        selection: State.EditorSelection.range(
          currentCell.from,
          currentCell.to,
        ),
        userEvent: "select",
      });
      return true;
    }
    for (let cell of query.allCells(view.state)) {
      if (sel.from >= cell.from && sel.to < cell.to) {
        view.dispatch({
          selection: State.EditorSelection.range(cell.from, cell.to - 1),
          userEvent: "select",
        });
        return true;
      }
    }
    return false;
  };

  let focusCurrentCell: View.Command = (view: View.EditorView) => {
    let currentCell = query.currentCell(view.state);
    if (!view.hasFocus) view.focus();
    view.dispatch({
      selection: State.EditorSelection.cursor(currentCell.to),
      scrollIntoView: true,
    });
    return true;
  };

  let commands = { addCell, reuseCell, selectCell, focusCurrentCell };

  let toWorkspace0 = (state: State.EditorState): Workspace0.Workspace0 => {
    let toWorkspaceCell0 = (
      cell: WorkspaceCell,
    ): Workspace0.WorkspaceCell0 => ({
      from: cell.from,
      to: cell.to,
      result: cell.result?.isResolved ? cell.result.value : null,
    });
    return {
      doc: state.doc.sliceString(0),
      prevSessions: workspace0.prevSessions,
      currentSession: {
        createdAt: workspace0.currentSession.createdAt,
        cells: cells(state).map(toWorkspaceCell0),
      },
      currentCell: toWorkspaceCell0(currentCell(state)),
    };
  };

  let extension = [
    onInit.extension,
    onSelection.extension,
    computeCurrentCellField,
    prevCellsField,
    cellsField,
    prevOutputWidgets,
    outputWidgets,
    preview,
    placeholder,
    sessionBanner,
    ignoreCellEdits,
  ];
  if (config instanceof State.StateField) extension.push(config);

  let workspace = {
    query,
    commands,
    toWorkspace0,
    extension,
  };

  return workspace;
}

class PlaceholderWidget extends View.WidgetType {
  constructor(readonly content: string | HTMLElement) {
    super();
  }

  override get estimatedHeight() {
    return LINE_HEIGHT;
  }

  toDOM() {
    let wrap = document.createElement("span");
    wrap.className = "cm-placeholder";
    wrap.style.pointerEvents = "none";
    wrap.appendChild(
      typeof this.content == "string"
        ? document.createTextNode(this.content)
        : this.content,
    );
    if (typeof this.content == "string")
      wrap.setAttribute("aria-label", "placeholder " + this.content);
    else wrap.setAttribute("aria-hidden", "true");
    return wrap;
  }

  override ignoreEvent() {
    return false;
  }
}

function renderResult(
  root: HTMLDivElement,
  result: REPL.REPLResult,
  preview: boolean = false,
  foldCutoffLines: number | null = null,
) {
  root.classList.remove(...root.classList.values());
  root.classList.add("Output__output");
  if (preview) root.classList.add("Output__output--preview");
  if (result.type === "error") {
    root.classList.add("Output__output--error");
  } else if (result.type === "notice") {
    root.classList.add("Output__output--notice");
  }

  let content = resultContent(result);
  if (foldCutoffLines != null) {
    // TODO: Inefficient!
    content = content
      .split("\n")
      .slice(0, foldCutoffLines - 1)
      .join("\n");
    content += "\n&nbsp;";
  }
  root.innerHTML = content;
}

function resultContent(result: REPL.REPLResult): string {
  if (result.type === "ok") {
    return result.ok ?? "&nbsp;";
  } else if (result.type === "error") {
    return result.error;
  } else if (result.type === "notice") {
    return result.notice;
  } else {
    return "&nbsp;";
  }
}

class CellOutputWidget extends View.WidgetType {
  private mounted: boolean = true;
  private _folded: boolean | null = null;
  private _numberOfLines: number | null = null;
  private foldCutoffLines = 10;
  private root: HTMLDivElement = document.createElement("div");
  private result: REPL.REPLResult;

  constructor(private readonly cell: WorkspaceCell) {
    super();
    this.result = this.cell.result?.isCompleted
      ? this.cell.result.value
      : this.cell.resultPreview != null
      ? this.cell.resultPreview
      : { type: "notice", notice: "..." };
  }

  get numberOfLines(): number {
    // TODO: consider storing this inside workspace?
    if (this._numberOfLines == null) {
      let content =
        this.result != null ? resultContent(this.result).trim() : "";
      this._numberOfLines = content.split("\n").length;
    }
    return this._numberOfLines;
  }

  get needFold(): boolean {
    return this.numberOfLines > this.foldCutoffLines;
  }

  get folded(): boolean {
    if (this._folded != null) return this._folded;
    return this.needFold;
  }

  override get estimatedHeight() {
    if (this.folded) {
      return this.foldCutoffLines * LINE_HEIGHT;
    } else {
      return this.numberOfLines * LINE_HEIGHT;
    }
  }

  render() {
    while (this.root.lastChild) this.root.removeChild(this.root.lastChild);

    this.root.classList.add("Output");
    let output = document.createElement("div");
    renderResult(
      output,
      this.result,
      false,
      this.folded ? this.foldCutoffLines : null,
    );

    let button = document.createElement("button");
    button.classList.add("Button");
    button.classList.add("Output__gutter");
    if (!this.needFold) {
      button.classList.add("Output__gutter--disabled");
    }
    button.title = "Output is too long (fold/unfold)";
    let innerHTML = "&nbsp;&nbsp;&nbsp;⇅&nbsp;";
    if (this.needFold) innerHTML += "\n&nbsp;";
    button.innerHTML = innerHTML;

    button.onclick = () => {
      this._folded = this._folded == null ? false : !this._folded;
      this.render();
    };
    this.root.appendChild(button);
    this.root.appendChild(output);
  }

  toDOM() {
    this.result = this.cell.result?.isCompleted
      ? this.cell.result.value
      : this.cell.resultPreview != null
      ? this.cell.resultPreview
      : { type: "notice", notice: "..." };
    this.render();
    if (this.cell.result && !this.cell.result.isCompleted) {
      this.cell.result.then((result) => {
        if (this.mounted) {
          this.result = result;
          this.render();
        }
      });
    }
    return this.root;
  }

  override destroy(_dom: HTMLElement) {
    this.mounted = false;
  }

  override eq(other: CellOutputWidget) {
    return other.cell === this.cell;
  }
}

class PreviewOutputWidget extends View.WidgetType {
  private mounted: boolean = true;
  private timer: NodeJS.Timer | null = null;
  private root: HTMLDivElement | null = null;
  private result: REPL.REPLResult;
  private _numberOfLines: number | null = null;

  constructor(
    public cell: WorkspaceCell,
    public code: string,
    readonly repl: REPL.IREPL,
  ) {
    super();
    this.result = this.cell.result?.isCompleted
      ? this.cell.result.value
      : this.cell.resultPreview
      ? this.cell.resultPreview
      : { type: "notice", notice: "&nbsp;" };
  }

  get numberOfLines(): number {
    // TODO: consider storing this inside workspace?
    if (this._numberOfLines == null) {
      let content =
        this.result != null ? resultContent(this.result).trim() : "";
      this._numberOfLines = content.split("\n").length;
    }
    return this._numberOfLines;
  }

  override get estimatedHeight() {
    return this.numberOfLines * LINE_HEIGHT;
  }

  render() {
    let root = this.root!;
    while (root.lastChild) root.removeChild(root.lastChild);
    renderResult(root, this.result, true);
  }

  schedule() {
    if (this.cell.result?.isCompleted) return;
    if (this.code.trim() === "") {
      this.result = { type: "notice", notice: "&nbsp;" };
      this.render();
      return;
    }

    this.result = { type: "notice", notice: "..." };
    this.render();

    if (this.timer != null) clearTimeout(this.timer);
    let timer = setTimeout(() => {
      if (this.timer !== timer) return;
      this.repl
        .preview(this.code)
        .then(this.cell.result!.resolve, this.cell.result!.reject);
      this.cell.result!.then((result) => {
        if (this.mounted && this.timer === timer) {
          this.result = result;
          this.render();
        }
      });
    }, 400);
    this.timer = timer;
  }

  toDOM() {
    this.root = document.createElement("div");
    this.render();
    this.schedule();
    return this.root;
  }

  override eq(other: PreviewOutputWidget) {
    return other.code === this.code;
  }

  override destroy(_dom: HTMLElement) {
    this.mounted = false;
    if (this.timer != null) clearTimeout(this.timer);
  }
}

class SessionBanner extends View.WidgetType {
  constructor(private readonly startTime: number) {
    super();
  }

  override get estimatedHeight() {
    return LINE_HEIGHT;
  }

  toDOM() {
    let root = document.createElement("div");
    root.classList.add("SessionBanner");
    let date = new Intl.DateTimeFormat(undefined, {
      dateStyle: "short",
      timeStyle: "short",
    }).format(this.startTime);
    root.innerText = `STARTED ${date}`;
    return root;
  }
}

function download(blob: Blob, filename: string) {
  let a = window.document.createElement("a");
  a.href = window.URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
