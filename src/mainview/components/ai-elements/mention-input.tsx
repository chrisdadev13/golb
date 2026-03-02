"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { cn } from "@/lib/utils";
import type { ContextItem, ContextItemType } from "@/lib/context-types";

// ============================================================================
// Text extraction from contenteditable DOM
// ============================================================================

function extractText(root: HTMLElement): string {
  let text = "";
  for (const node of root.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? "";
    } else if (node instanceof HTMLElement) {
      if (node.dataset.contextId) {
        text += `@${node.dataset.contextLabel ?? ""}`;
      } else if (node.tagName === "BR") {
        text += "\n";
      } else if (node.tagName === "DIV" || node.tagName === "P") {
        if (text.length > 0 && !text.endsWith("\n")) {
          text += "\n";
        }
        text += extractText(node);
      } else {
        text += extractText(node);
      }
    }
  }
  return text;
}

function extractContextItems(root: HTMLElement): ContextItem[] {
  const items: ContextItem[] = [];
  const badges = root.querySelectorAll<HTMLElement>("[data-context-id]");
  for (const badge of badges) {
    const id = badge.dataset.contextId!;
    const type = (badge.dataset.contextType ?? "file") as ContextItemType;
    const label = badge.dataset.contextLabel ?? "";
    const value = badge.dataset.contextValue ?? "";
    items.push({ id, type, label, value });
  }
  return items;
}

// ============================================================================
// SVG icon map for badge DOM insertion
// ============================================================================

const BADGE_ICON_SVG: Record<ContextItemType, string> = {
  file: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>`,
  folder: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>`,
  "git-branch": `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>`,
  "git-diff": `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><path d="M11 18H8a2 2 0 0 1-2-2V9"/></svg>`,
  "web-search": `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>`,
  image: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`,
};

// ============================================================================
// MentionInput
// ============================================================================

export interface MentionInputHandle {
  insertBadge: (item: ContextItem) => void;
  focus: () => void;
  getText: () => string;
  getContextItems: () => ContextItem[];
  clear: () => void;
}

export interface MentionInputProps {
  className?: string;
  placeholder?: string;
  onAtTrigger?: (rect: DOMRect, query: string) => void;
  onAtDismiss?: () => void;
  /** Called when a key is pressed while @ popover is active. Return true to prevent default handling. */
  onAtKeyDown?: (key: string) => boolean;
  onSubmit?: (text: string, contextItems: ContextItem[]) => void;
  onPasteFiles?: (files: File[]) => void;
  disabled?: boolean;
  handleRef?: RefObject<MentionInputHandle | null>;
}

export function MentionInput({
  className,
  placeholder = "Use '@' to add context",
  onAtTrigger,
  onAtDismiss,
  onAtKeyDown,
  onSubmit,
  onPasteFiles,
  disabled,
  handleRef,
}: MentionInputProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [, setIsEmpty] = useState(true);
  const [isComposing, setIsComposing] = useState(false);
  const atActiveRef = useRef(false);
  const atStartOffsetRef = useRef<number>(0);
  const atStartNodeRef = useRef<Node | null>(null);

  const checkEmpty = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const text = extractText(el).trim();
    const hasBadges = el.querySelector("[data-context-id]") !== null;
    setIsEmpty(text.length === 0 && !hasBadges);
  }, []);

  // ---- Badge insertion ----
  const insertBadge = useCallback(
    (item: ContextItem) => {
      const el = editorRef.current;
      if (!el) return;

      // If @ is active, remove the @query text first (including the @ character)
      if (atActiveRef.current && atStartNodeRef.current) {
        const sel = window.getSelection();
        const selInsideEditor =
          sel &&
          sel.rangeCount > 0 &&
          el.contains(sel.getRangeAt(0).endContainer);
        try {
          const range = document.createRange();
          const startOffset = Math.max(0, atStartOffsetRef.current - 1);
          range.setStart(atStartNodeRef.current, startOffset);
          if (selInsideEditor) {
            // Selection is inside the editor — delete from @ to cursor
            range.setEnd(
              sel.getRangeAt(0).endContainer,
              sel.getRangeAt(0).endOffset,
            );
          } else {
            // Selection moved outside (e.g. popover search input) —
            // delete just the @query text using the known text node
            const textLen = atStartNodeRef.current.textContent?.length ?? 0;
            range.setEnd(atStartNodeRef.current, textLen);
          }
          range.deleteContents();
        } catch {
          // If range manipulation fails, just proceed with insertion at caret
        }
        atActiveRef.current = false;
        atStartNodeRef.current = null;
        onAtDismiss?.();
      }

      const badge = document.createElement("span");
      badge.contentEditable = "false";
      badge.dataset.contextId = item.id;
      badge.dataset.contextType = item.type;
      badge.dataset.contextLabel = item.label;
      badge.dataset.contextValue = item.value;
      badge.className =
        "mention-badge inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs align-baseline select-none mx-0.5";

      const iconSvg = BADGE_ICON_SVG[item.type] || "";
      badge.innerHTML = `<span class="inline-flex items-center gap-1 pointer-events-none"><span class="size-3 inline-flex items-center justify-center">${iconSvg}</span>${escapeHtml(item.label)}</span>`;

      // Add remove button
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className =
        "inline-flex items-center justify-center size-3 rounded-full hover:bg-foreground/10 cursor-pointer pointer-events-auto ml-0.5";
      removeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
      removeBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        badge.remove();
        checkEmpty();
        el.focus();
      });
      badge.appendChild(removeBtn);

      // Insert at current selection or at end
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(badge);
        range.setStartAfter(badge);
        range.setEndAfter(badge);
        const space = document.createTextNode("\u00A0");
        range.insertNode(space);
        range.setStartAfter(space);
        range.setEndAfter(space);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        el.appendChild(badge);
        const space = document.createTextNode("\u00A0");
        el.appendChild(space);
        const range = document.createRange();
        range.setStartAfter(space);
        range.collapse(true);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }

      checkEmpty();
      el.focus();
    },
    [checkEmpty, onAtDismiss],
  );

  // ---- Imperative handle ----
  useImperativeHandle(
    handleRef,
    () => ({
      insertBadge,
      focus: () => editorRef.current?.focus(),
      getText: () => extractText(editorRef.current!),
      getContextItems: () => extractContextItems(editorRef.current!),
      clear: () => {
        if (editorRef.current) {
          editorRef.current.innerHTML = "";
          setIsEmpty(true);
          atActiveRef.current = false;
          atStartNodeRef.current = null;
        }
      },
    }),
    [insertBadge],
  );

  // ---- @ detection via native input listener ----
  const onAtTriggerRef = useRef(onAtTrigger);
  const onAtDismissRef = useRef(onAtDismiss);
  const isComposingRef = useRef(isComposing);
  useEffect(() => { onAtTriggerRef.current = onAtTrigger; }, [onAtTrigger]);
  useEffect(() => { onAtDismissRef.current = onAtDismiss; }, [onAtDismiss]);
  useEffect(() => { isComposingRef.current = isComposing; }, [isComposing]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;

    const handleInput = () => {
      checkEmpty();
      if (isComposingRef.current) return;

      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const { anchorNode, anchorOffset } = sel;
      if (!anchorNode || anchorNode.nodeType !== Node.TEXT_NODE) {
        if (atActiveRef.current) {
          atActiveRef.current = false;
          atStartNodeRef.current = null;
          onAtDismissRef.current?.();
        }
        return;
      }

      const text = anchorNode.textContent ?? "";

      if (atActiveRef.current) {
        if (anchorNode === atStartNodeRef.current) {
          const query = text.slice(atStartOffsetRef.current, anchorOffset);
          if (query.includes("\n")) {
            atActiveRef.current = false;
            atStartNodeRef.current = null;
            onAtDismissRef.current?.();
            return;
          }
          const range = document.createRange();
          range.setStart(anchorNode, atStartOffsetRef.current - 1);
          range.setEnd(anchorNode, anchorOffset);
          const rect = range.getBoundingClientRect();
          onAtTriggerRef.current?.(rect, query);
        } else {
          atActiveRef.current = false;
          atStartNodeRef.current = null;
          onAtDismissRef.current?.();
        }
        return;
      }

      // Detect fresh @ character
      if (anchorOffset > 0 && text[anchorOffset - 1] === "@") {
        if (anchorOffset === 1 || /\s/.test(text[anchorOffset - 2])) {
          atActiveRef.current = true;
          atStartOffsetRef.current = anchorOffset;
          atStartNodeRef.current = anchorNode;

          const range = document.createRange();
          range.setStart(anchorNode, anchorOffset - 1);
          range.setEnd(anchorNode, anchorOffset);
          const rect = range.getBoundingClientRect();
          onAtTriggerRef.current?.(rect, "");
        }
      }
    };

    el.addEventListener("input", handleInput);
    return () => el.removeEventListener("input", handleInput);
  }, [checkEmpty]);

  // ---- Keyboard handling ----
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      // When @ is active, let parent handle navigation keys
      if (atActiveRef.current && onAtKeyDown) {
        if (
          e.key === "ArrowUp" ||
          e.key === "ArrowDown" ||
          e.key === "Enter" ||
          e.key === "ArrowRight" ||
          e.key === "Tab"
        ) {
          const handled = onAtKeyDown(e.key);
          if (handled) {
            e.preventDefault();
            return;
          }
        }
      }

      if (e.key === "Enter") {
        if (isComposing || e.nativeEvent.isComposing) return;
        if (e.shiftKey) return;
        e.preventDefault();

        if (atActiveRef.current) {
          atActiveRef.current = false;
          atStartNodeRef.current = null;
          onAtDismiss?.();
        }

        const el = editorRef.current;
        if (!el) return;
        const text = extractText(el);
        const items = extractContextItems(el);
        onSubmit?.(text, items);
        return;
      }

      if (e.key === "Escape" && atActiveRef.current) {
        e.preventDefault();
        atActiveRef.current = false;
        atStartNodeRef.current = null;
        onAtDismiss?.();
        return;
      }

      // Badge removal with Backspace
      if (e.key === "Backspace") {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const { anchorNode, anchorOffset } = sel;
        if (!anchorNode) return;

        if (anchorNode.nodeType === Node.TEXT_NODE && anchorOffset === 0) {
          const prev = anchorNode.previousSibling;
          if (prev instanceof HTMLElement && prev.dataset.contextId) {
            e.preventDefault();
            prev.remove();
            checkEmpty();
            return;
          }
        }

        if (anchorNode === editorRef.current) {
          const child = editorRef.current.childNodes[anchorOffset - 1];
          if (child instanceof HTMLElement && child.dataset.contextId) {
            e.preventDefault();
            child.remove();
            checkEmpty();
            return;
          }
        }
      }
    },
    [isComposing, onSubmit, onAtDismiss, onAtKeyDown, checkEmpty],
  );

  // ---- Paste handling ----
  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLDivElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const files: globalThis.File[] = [];
      for (const item of items) {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }

      if (files.length > 0) {
        e.preventDefault();
        onPasteFiles?.(files);
        return;
      }

      e.preventDefault();
      const text = e.clipboardData.getData("text/plain");
      if (!text) return;

      const el = editorRef.current;
      const sel = window.getSelection();
      if (!el || !sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) {
        el?.focus();
        return;
      }

      const range = sel.getRangeAt(0);
      range.deleteContents();
      const textNode = document.createTextNode(text);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);

      // Trigger native input observers to keep mention state in sync.
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    [onPasteFiles],
  );

  // ---- Click away handling ----
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        atActiveRef.current &&
        editorRef.current &&
        !editorRef.current.contains(e.target as Node)
      ) {
        const popover = (e.target as Element)?.closest?.(
          "[data-slot=popover-popup]",
        );
        if (!popover) {
          atActiveRef.current = false;
          atStartNodeRef.current = null;
          onAtDismiss?.();
        }
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onAtDismiss]);

  return (
    <div className="relative w-full">
      <div
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-placeholder={placeholder}
        data-slot="mention-input"
        className={cn(
          "min-h-5.25 max-h-48 w-full overflow-y-auto whitespace-pre-wrap break-words bg-transparent text-sm text-foreground outline-none [&:empty]:before:content-[attr(aria-placeholder)] [&:empty]:before:text-muted-foreground [&:empty]:before:pointer-events-none py-0",
          className,
        )}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onCompositionStart={() => setIsComposing(true)}
        onCompositionEnd={() => setIsComposing(false)}
      />
    </div>
  );
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
