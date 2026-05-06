import { useState, useCallback, useRef } from 'react';

/**
 * Hook quản lý Undo/Redo stack.
 * 
 * Snapshot = { scenes, deletedIds (Array), subtitles }
 * Chỉ lưu dữ liệu nhẹ, không lưu video file hay thumbnails.
 * 
 * @param {number} maxSteps - Số bước tối đa (default 30)
 */
export function useUndoHistory(maxSteps = 30) {
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateFlags = useCallback(() => {
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  }, []);

  /**
   * Chụp snapshot hiện tại vào undoStack TRƯỚC KHI thay đổi state.
   * Gọi hàm này trước mỗi mutation.
   */
  const pushState = useCallback((currentSnapshot) => {
    undoStackRef.current.push(JSON.parse(JSON.stringify(currentSnapshot)));
    // Giới hạn stack
    if (undoStackRef.current.length > maxSteps) {
      undoStackRef.current.shift();
    }
    // Clear redo khi có hành động mới
    redoStackRef.current = [];
    updateFlags();
  }, [maxSteps, updateFlags]);

  /**
   * Undo: trả về snapshot trước đó.
   * Caller phải truyền currentSnapshot (state hiện tại) để đẩy vào redoStack.
   * @returns {Object|null} snapshot cũ, hoặc null nếu không thể undo
   */
  const undo = useCallback((currentSnapshot) => {
    if (undoStackRef.current.length === 0) return null;

    const previous = undoStackRef.current.pop();
    redoStackRef.current.push(JSON.parse(JSON.stringify(currentSnapshot)));
    updateFlags();
    return previous;
  }, [updateFlags]);

  /**
   * Redo: trả về snapshot tiếp theo.
   * Caller phải truyền currentSnapshot (state hiện tại) để đẩy vào undoStack.
   * @returns {Object|null} snapshot tiếp, hoặc null nếu không thể redo
   */
  const redo = useCallback((currentSnapshot) => {
    if (redoStackRef.current.length === 0) return null;

    const next = redoStackRef.current.pop();
    undoStackRef.current.push(JSON.parse(JSON.stringify(currentSnapshot)));
    updateFlags();
    return next;
  }, [updateFlags]);

  /**
   * Reset toàn bộ undo/redo stack (khi chuyển video mới)
   */
  const resetHistory = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    updateFlags();
  }, [updateFlags]);

  return { pushState, undo, redo, canUndo, canRedo, resetHistory };
}
