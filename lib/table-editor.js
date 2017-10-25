import { Point } from "./point.js";
import { Range } from "./range.js";
import { readTable } from "./parser.js";
import { completeTable, formatTable, alterAlignment } from "./formatter.js";
import { shortestEditScript, applyEditScript } from "./edit-script.js";

/**
 * Checks if a line is a table row.
 *
 * @private
 * @param {string} line - A string.
 * @returns {boolean} `true` if the given line starts with a pipe `|`.
 */
export function _isTableRow(line) {
  return line.trimLeft()[0] === "|";
}


/**
 * The `TableEditor` class is at the center of the markdown-table-editor.
 * When a command is executed, it reads a table from the text editor, does some operation on the
 * table, and then apply the result to the text editor.
 *
 * To use this class, the text editor (or an interface to it) must implement {@link ITextEditor}.
 */
export class TableEditor {
  /**
   * Creates a new table editor instance.
   *
   * @param {ITextEditor} textEditor - A text editor interface.
   */
  constructor(textEditor) {
    /** @private */
    this._textEditor = textEditor;

    // smart cursor
    /** @private */
    this._scActive = false;
    /** @private */
    this._scTablePos = null;
    /** @private */
    this._scStartFocus = null;
    /** @private */
    this._scLastFocus = null;
  }

  /**
   * Resets the smart cursor.
   * Call this method when the table editor is inactivated.
   *
   * @returns {undefined}
   */
  resetSmartCursor() {
    this._scActive = false;
  }

  /**
   * Checks if the cursor is in a table row.
   * This is useful to check whether the table editor should be activated or not.
   *
   * @returns {boolean} `true` if the cursor is in a table row.
   */
  cursorIsInTable() {
    const pos = this._textEditor.getCursorPosition();
    const line = this._textEditor.getLine(pos.row);
    return _isTableRow(line);
  }

  /**
   * Finds a table under the current cursor position.
   *
   * @private
   * @returns {Object|undefined} An object that contains information about the table;
   * `undefined` if there is no table.
   * The return object contains the properties listed in the table.
   *
   * | property name   | type                                | description                                                              |
   * | --------------- | ----------------------------------- | ------------------------------------------------------------------------ |
   * | `range`         | {@link Range}                       | The range of the table.                                                  |
   * | `lines`         | {@link Array}&lt;{@link string}&gt; | An array of the lines in the range.                                      |
   * | `table`         | {@link Table}                       | A table object read from the text editor.                                |
   * | `focus`         | {@link Focus}                       | A focus object that represents the current cursor position in the table. |
   */
  _findTable() {
    const pos = this._textEditor.getCursorPosition();
    const lastRow = this._textEditor.getLastRow();
    const lines = [];
    let startRow = pos.row;
    let endRow = pos.row;
    // current line
    {
      const line = this._textEditor.getLine(pos.row);
      if (!_isTableRow(line)) {
        return undefined;
      }
      lines.push(line);
    }
    // previous lines
    for (let row = pos.row - 1; row >= 0; row--) {
      const line = this._textEditor.getLine(row);
      if (!_isTableRow(line)) {
        break;
      }
      lines.unshift(line);
      startRow = row;
    }
    // next lines
    for (let row = pos.row + 1; row <= lastRow; row++) {
      const line = this._textEditor.getLine(row);
      if (!_isTableRow(line)) {
        break;
      }
      lines.push(line);
      endRow = row;
    }
    const range = new Range(
      new Point(startRow, 0),
      new Point(endRow, lines[lines.length - 1].length)
    );
    const table = readTable(lines);
    const focus = table.focusOfPosition(pos, startRow);
    return { range, lines, table, focus };
  }

  /**
   * Updates lines in a given range in the text editor.
   *
   * @private
   * @param {number} startRow - Start row index, starts from `0`.
   * @param {number} endRow - End row index.
   * Lines from `startRow` to `endRow - 1` are replaced.
   * @param {Array<string>} newLines - New lines.
   * @param {Array<string>} [oldLines=undefined] - Old lines to be replaced.
   * @returns {undefined}
   */
  _updateLines(startRow, endRow, newLines, oldLines = undefined) {
    if (oldLines !== undefined) {
      // apply the shortest edit script
      // if a table is edited in a normal manner, the edit distance never exceeds 3
      const ses = shortestEditScript(oldLines, newLines, 3);
      if (ses !== undefined) {
        applyEditScript(this._textEditor, ses, startRow);
        return;
      }
    }
    this._textEditor.replaceLines(startRow, endRow, newLines);
  }

  /**
   * Moves the cursor position to the focused cell,
   *
   * @private
   * @param {number} startRow - Row index where the table starts in the text editor.
   * @param {Table} table - A table.
   * @param {Focus} focus - A focus to which the cursor will be moved.
   * @returns {undefined}
   */
  _moveToFocus(startRow, table, focus) {
    const pos = table.positionOfFocus(focus, startRow);
    if (pos !== undefined) {
      this._textEditor.setCursorPosition(pos);
    }
  }

  /**
   * Selects the focused cell.
   * If the cell has no content to be selected, then just moves the cursor position.
   *
   * @private
   * @param {number} startRow - Row index where the table starts in the text editor.
   * @param {Table} table - A table.
   * @param {Focus} focus - A focus to be selected.
   * @returns {undefined}
   */
  _selectFocus(startRow, table, focus) {
    const range = table.selectionRangeOfFocus(focus, startRow);
    if (range !== undefined) {
      this._textEditor.setSelectionRange(range);
    }
    else {
      this._moveToFocus(startRow, table, focus);
    }
  }

  /**
   * Formats the table under the cursor.
   *
   * @param {Object} options - See {@link options}.
   * @returns {undefined}
   */
  format(options) {
    const info = this._findTable();
    if (!info) {
      return;
    }
    const { range, lines, table, focus } = info;
    let newFocus = focus;
    // complete
    const completed = completeTable(table, options);
    if (completed.delimiterInserted && newFocus.row > 0) {
      newFocus = newFocus.setRow(newFocus.row + 1);
    }
    // format
    const formatted = formatTable(completed.table, options);
    // compute new offset
    const completedFocusedCell = completed.table.getFocusedCell(newFocus);
    const formattedFocusedCell = formatted.table.getFocusedCell(newFocus);
    if (completedFocusedCell !== undefined && formattedFocusedCell !== undefined) {
      const contentOffset = Math.min(
        completedFocusedCell.computeContentOffset(newFocus.offset),
        formattedFocusedCell.content.length
      );
      newFocus = newFocus.setOffset(formattedFocusedCell.computeRawOffset(contentOffset));
    }
    else {
      newFocus = newFocus.setOffset(newFocus.column < 0 ? formatted.marginLeft.length : 0);
    }
    // apply
    this._textEditor.transact(() => {
      this._updateLines(range.start.row, range.end.row + 1, formatted.table.toLines(), lines);
      this._moveToFocus(range.start.row, formatted.table, newFocus);
    });
  }

  /**
   * Formats and escapes from the table.
   *
   * @param {Object} options - See {@link options}.
   * @returns {undefined}
   */
  escape(options) {
    const info = this._findTable();
    if (!info) {
      return;
    }
    const { range, lines, table } = info;
    // complete
    const completed = completeTable(table, options);
    // format
    const formatted = formatTable(completed.table, options);
    // apply
    const newPos = new Point(range.end.row + (completed.delimiterInserted ? 2 : 1), 0);
    this._textEditor.transact(() => {
      this._updateLines(range.start.row, range.end.row + 1, formatted.table.toLines(), lines);
      if (newPos.row > this._textEditor.getLastRow()) {
        this._textEditor.insertLine(newPos.row, "");
      }
      this._textEditor.setCursorPosition(newPos);
    });
    this.resetSmartCursor();
  }

  /**
   * Alters the alignment of the focused column.
   *
   * @param {Alignment} alignment - New alignment.
   * @param {Object} options - See {@link options}.
   * @returns {undefined}
   */
  align(alignment, options) {
    const info = this._findTable();
    if (!info) {
      return;
    }
    const { range, lines, table, focus } = info;
    let newFocus = focus;
    // complete
    const completed = completeTable(table, options);
    if (completed.delimiterInserted && newFocus.row > 0) {
      newFocus = newFocus.setRow(newFocus.row + 1);
    }
    // alter alignment
    const altered = alterAlignment(completed.table, focus.column, alignment, options);
    // format
    const formatted = formatTable(altered, options);
    // compute new offset
    const completedFocusedCell = completed.table.getFocusedCell(newFocus);
    const formattedFocusedCell = formatted.table.getFocusedCell(newFocus);
    if (completedFocusedCell !== undefined && formattedFocusedCell !== undefined) {
      const contentOffset = Math.min(
        completedFocusedCell.computeContentOffset(newFocus.offset),
        formattedFocusedCell.content.length
      );
      newFocus = newFocus.setOffset(formattedFocusedCell.computeRawOffset(contentOffset));
    }
    else {
      newFocus = newFocus.setOffset(newFocus.column < 0 ? formatted.marginLeft.length : 0);
    }
    // apply
    this._textEditor.transact(() => {
      this._updateLines(range.start.row, range.end.row + 1, formatted.table.toLines(), lines);
      this._moveToFocus(range.start.row, formatted.table, newFocus);
    });
  }

  /**
   * Selects the focused cell content.
   *
   * @param {Object} options - See {@link options}.
   * @returns {undefined}
   */
  selectCell(options) {
    const info = this._findTable();
    if (!info) {
      return;
    }
    const { range, lines, table, focus } = info;
    let newFocus = focus;
    // complete
    const completed = completeTable(table, options);
    if (completed.delimiterInserted && newFocus.row > 0) {
      newFocus = newFocus.setRow(newFocus.row + 1);
    }
    // format
    const formatted = formatTable(completed.table, options);
    // compute new offset
    const completedFocusedCell = completed.table.getFocusedCell(newFocus);
    const formattedFocusedCell = formatted.table.getFocusedCell(newFocus);
    if (completedFocusedCell !== undefined && formattedFocusedCell !== undefined) {
      const contentOffset = Math.min(
        completedFocusedCell.computeContentOffset(newFocus.offset),
        formattedFocusedCell.content.length
      );
      newFocus = newFocus.setOffset(formattedFocusedCell.computeRawOffset(contentOffset));
    }
    else {
      newFocus = newFocus.setOffset(newFocus.column < 0 ? formatted.marginLeft.length : 0);
    }
    // apply
    this._textEditor.transact(() => {
      this._updateLines(range.start.row, range.end.row + 1, formatted.table.toLines(), lines);
      this._selectFocus(range.start.row, formatted.table, newFocus);
    });
  }
}