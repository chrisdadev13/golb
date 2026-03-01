"use client";

import {
  ArrowLeft,
  ChevronRight,
  GitBranch,
  GitCommit,
  Globe,
  ImageIcon,
  Search,
} from "lucide-react";
import { FileIcon, FolderIcon } from "@react-symbols/icons/utils";
import { nanoid } from "nanoid";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverPopup } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ContextItem } from "@/lib/context-types";
import {
  listFiles,
  searchFiles,
  getGitBranches,
  getGitStatus,
} from "@/lib/rpc";

// ============================================================================
// Types
// ============================================================================

type View = "main" | "files" | "git";

/** A renderable row in the popover list. */
interface PopoverOption {
  key: string;
  icon: React.ReactNode;
  label: string;
  suffix?: React.ReactNode;
  /** Action when selected (Enter / click) */
  onSelect: () => void;
  /** Action when expanded (Right arrow / click on chevron items) */
  onExpand?: () => void;
}

interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

interface GitBranchEntry {
  name: string;
  current: boolean;
}

interface GitChange {
  file: string;
  status: string;
}

// ============================================================================
// Imperative handle
// ============================================================================

export interface ContextPopoverHandle {
  moveHighlight: (direction: "up" | "down") => void;
  /** Select the currently highlighted item. Returns true if something was selected. */
  selectHighlighted: () => boolean;
  /** Expand the highlighted item (enter sub-view). Returns true if expanded. */
  expandHighlighted: () => boolean;
}

// ============================================================================
// ContextPopover
// ============================================================================

export interface ContextPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchor: Element | DOMRect | null;
  projectPath: string | null;
  query: string;
  onSelectItem: (item: ContextItem) => void;
  onUploadImage?: () => void;
  popoverRef?: RefObject<ContextPopoverHandle | null>;
}

export function ContextPopover({
  open,
  onOpenChange,
  anchor,
  projectPath,
  query,
  onSelectItem,
  onUploadImage,
  popoverRef,
}: ContextPopoverProps) {
  const [view, setView] = useState<View>("main");
  const [highlightIndex, setHighlightIndex] = useState(0);

  // Sub-view data
  const [currentPath, setCurrentPath] = useState<string | undefined>(undefined);
  const [dirFiles, setDirFiles] = useState<FileEntry[]>([]);
  const [searchResults, setSearchResults] = useState<FileEntry[]>([]);
  const [branches, setBranches] = useState<GitBranchEntry[]>([]);
  const [changes, setChanges] = useState<GitChange[]>([]);
  const [loading, setLoading] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const [subViewSearch, setSubViewSearch] = useState("");

  // Reset on open/close
  useEffect(() => {
    if (open) {
      setView("main");
      setHighlightIndex(0);
      setCurrentPath(undefined);
      setDirFiles([]);
      setSearchResults([]);
      setBranches([]);
      setChanges([]);
      setSubViewSearch("");
    }
  }, [open]);

  // Search files when query changes and we're in main view
  useEffect(() => {
    if (!open || !projectPath || view !== "main") return;
    if (!query) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const results = await searchFiles(projectPath, query);
        if (!cancelled) setSearchResults(results);
      } catch {
        if (!cancelled) setSearchResults([]);
      }
    }, 100); // small debounce
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, projectPath, query, view]);

  // Reset highlight when query/view changes
  useEffect(() => {
    setHighlightIndex(0);
  }, [query, view]);

  // ---- Data loaders for sub-views ----
  const loadFiles = useCallback(
    async (relativePath?: string) => {
      if (!projectPath) return;
      setLoading(true);
      try {
        const result = await listFiles(projectPath, relativePath);
        setDirFiles(result);
      } catch {
        setDirFiles([]);
      } finally {
        setLoading(false);
      }
    },
    [projectPath],
  );

  const loadGitData = useCallback(async () => {
    if (!projectPath) return;
    setLoading(true);
    try {
      const [b, c] = await Promise.all([
        getGitBranches(projectPath),
        getGitStatus(projectPath),
      ]);
      setBranches(b);
      setChanges(c);
    } catch {
      setBranches([]);
      setChanges([]);
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  const goToFiles = useCallback(() => {
    setView("files");
    setCurrentPath(undefined);
    setSubViewSearch("");
    setHighlightIndex(0);
    loadFiles();
  }, [loadFiles]);

  const goToGit = useCallback(() => {
    setView("git");
    setSubViewSearch("");
    setHighlightIndex(0);
    loadGitData();
  }, [loadGitData]);

  const navigateInto = useCallback(
    (entry: FileEntry) => {
      setCurrentPath(entry.path);
      setSubViewSearch("");
      setHighlightIndex(0);
      loadFiles(entry.path);
    },
    [loadFiles],
  );

  // ---- Selection handlers ----
  const selectFile = useCallback(
    (entry: FileEntry) => {
      onSelectItem({
        id: nanoid(),
        type: entry.isDirectory ? "folder" : "file",
        label: entry.name,
        value: entry.path,
      });
      onOpenChange(false);
    },
    [onSelectItem, onOpenChange],
  );

  const selectBranch = useCallback(
    (branch: GitBranchEntry) => {
      onSelectItem({
        id: nanoid(),
        type: "git-branch",
        label: branch.name,
        value: branch.name,
      });
      onOpenChange(false);
    },
    [onSelectItem, onOpenChange],
  );

  const selectDiff = useCallback(
    (change: GitChange) => {
      onSelectItem({
        id: nanoid(),
        type: "git-diff",
        label: `diff:${change.file}`,
        value: change.file,
      });
      onOpenChange(false);
    },
    [onSelectItem, onOpenChange],
  );

  const selectWebSearch = useCallback(() => {
    onSelectItem({
      id: nanoid(),
      type: "web-search",
      label: "Web Search",
      value: "web-search",
    });
    onOpenChange(false);
  }, [onSelectItem, onOpenChange]);

  const handleUploadImage = useCallback(() => {
    onUploadImage?.();
    onOpenChange(false);
  }, [onUploadImage, onOpenChange]);

  // ---- Build options list for current view ----
  const options: PopoverOption[] = useMemo(() => {
    // --- Main view ---
    if (view === "main") {
      if (query) {
        // Hybrid: flat search results + static items
        const opts: PopoverOption[] = [];
        for (const f of searchResults) {
          opts.push({
            key: `file:${f.path}`,
            icon: f.isDirectory ? (
              <FolderIcon folderName={f.name} className="size-4 shrink-0" />
            ) : (
              <FileIcon fileName={f.name} autoAssign className="size-4 shrink-0" />
            ),
            label: f.path,
            onSelect: () => selectFile(f),
          });
        }
        // Always show Web Search and Upload Image at bottom if they match
        const q = query.toLowerCase();
        if ("web search".includes(q)) {
          opts.push({
            key: "web-search",
            icon: <Globe className="size-3 text-muted-foreground" />,
            label: "Web Search",
            onSelect: selectWebSearch,
          });
        }
        if ("upload image".includes(q)) {
          opts.push({
            key: "upload-image",
            icon: <ImageIcon className="size-3 text-muted-foreground" />,
            label: "Upload Image",
            onSelect: handleUploadImage,
          });
        }
        return opts;
      }
      // No query: show main menu
      return [
        {
          key: "files",
          icon: <FolderIcon folderName="src" className="size-4 shrink-0" />,
          label: "Files and Folders",
          suffix: (
            <ChevronRight className="size-3 text-muted-foreground" />
          ),
          onSelect: goToFiles,
          onExpand: goToFiles,
        },
        {
          key: "git",
          icon: <GitBranch className="size-3 text-muted-foreground" />,
          label: "Git",
          suffix: (
            <ChevronRight className="size-3 text-muted-foreground" />
          ),
          onSelect: goToGit,
          onExpand: goToGit,
        },
        {
          key: "web-search",
          icon: <Globe className="size-3 text-muted-foreground" />,
          label: "Web Search",
          onSelect: selectWebSearch,
        },
        {
          key: "upload-image",
          icon: <ImageIcon className="size-3 text-muted-foreground" />,
          label: "Upload Image",
          onSelect: handleUploadImage,
        },
      ];
    }

    // --- Files sub-view ---
    if (view === "files") {
      const q = subViewSearch.toLowerCase();
      const filtered = q
        ? dirFiles.filter((f) => f.name.toLowerCase().includes(q))
        : dirFiles;
      return filtered.map((entry) => ({
        key: `dir:${entry.path}`,
        icon: entry.isDirectory ? (
          <FolderIcon folderName={entry.name} className="size-4 shrink-0" />
        ) : (
          <FileIcon fileName={entry.name} autoAssign className="size-4 shrink-0" />
        ),
        label: entry.name,
        suffix: entry.isDirectory ? (
          <ChevronRight className="size-3 text-muted-foreground" />
        ) : undefined,
        onSelect: () =>
          entry.isDirectory ? navigateInto(entry) : selectFile(entry),
        onExpand: entry.isDirectory ? () => navigateInto(entry) : undefined,
      }));
    }

    // --- Git sub-view ---
    if (view === "git") {
      const q = subViewSearch.toLowerCase();
      const opts: PopoverOption[] = [];
      const fb = q
        ? branches.filter((b) => b.name.toLowerCase().includes(q))
        : branches;
      for (const branch of fb) {
        opts.push({
          key: `branch:${branch.name}`,
          icon: <GitBranch className="size-3 text-muted-foreground" />,
          label: branch.name,
          suffix: branch.current ? (
            <span className="text-[10px] text-green-600 dark:text-green-400 font-medium">
              current
            </span>
          ) : undefined,
          onSelect: () => selectBranch(branch),
        });
      }
      const fc = q
        ? changes.filter((c) => c.file.toLowerCase().includes(q))
        : changes;
      for (const change of fc) {
        opts.push({
          key: `change:${change.file}`,
          icon: <GitCommit className="size-3 text-muted-foreground" />,
          label: change.file,
          suffix: (
            <span
              className={cn(
                "text-[10px] font-medium",
                statusColor(change.status),
              )}
            >
              {statusLabel(change.status)}
            </span>
          ),
          onSelect: () => selectDiff(change),
        });
      }
      return opts;
    }

    return [];
  }, [
    view,
    query,
    searchResults,
    dirFiles,
    branches,
    changes,
    subViewSearch,
    goToFiles,
    goToGit,
    selectFile,
    selectBranch,
    selectDiff,
    selectWebSearch,
    handleUploadImage,
    navigateInto,
  ]);

  // Clamp highlight when options change
  useEffect(() => {
    if (highlightIndex >= options.length) {
      setHighlightIndex(Math.max(0, options.length - 1));
    }
  }, [options.length, highlightIndex]);

  // Focus sub-view search input
  useEffect(() => {
    if ((view === "files" || view === "git") && open) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [view, open]);

  // ---- Imperative handle for keyboard ----
  useImperativeHandle(
    popoverRef,
    () => ({
      moveHighlight: (direction: "up" | "down") => {
        setHighlightIndex((prev) => {
          if (options.length === 0) return 0;
          if (direction === "up") {
            return prev <= 0 ? options.length - 1 : prev - 1;
          }
          return prev >= options.length - 1 ? 0 : prev + 1;
        });
      },
      selectHighlighted: () => {
        const opt = options[highlightIndex];
        if (!opt) return false;
        opt.onSelect();
        return true;
      },
      expandHighlighted: () => {
        const opt = options[highlightIndex];
        if (!opt?.onExpand) return false;
        opt.onExpand();
        return true;
      },
    }),
    [options, highlightIndex],
  );

  // Scroll highlighted item into view
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const highlighted = list.querySelector("[data-highlighted=true]");
    if (highlighted) {
      highlighted.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIndex]);

  // ---- Virtual element for DOMRect anchor ----
  const resolvedAnchor = useMemo(() => {
    if (!anchor) return undefined;
    if (anchor instanceof DOMRect) {
      return { getBoundingClientRect: () => anchor };
    }
    return anchor;
  }, [anchor]);

  // Breadcrumbs for files sub-view
  const breadcrumbs = useMemo(
    () => (currentPath ? currentPath.split("/") : []),
    [currentPath],
  );

  const isSubView = view === "files" || view === "git";

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverPopup
        anchor={resolvedAnchor}
        side="top"
        align="start"
        sideOffset={8}
        initialFocus={false}
        finalFocus={false}
        className="w-64 rounded-md shadow-md/5 **:data-[slot=popover-viewport]:py-1 **:data-[slot=popover-viewport]:[--viewport-inline-padding:--spacing(0)]"
      >
        <div className="flex flex-col max-h-72">
          {/* Sub-view header */}
          {isSubView && (
            <div className="flex items-center gap-1.5 px-1.5 pt-0.5 pb-1">
              <button
                type="button"
                onClick={() => {
                  setView("main");
                  setHighlightIndex(0);
                }}
                className="flex items-center justify-center size-5 rounded hover:bg-accent cursor-pointer"
              >
                <ArrowLeft className="size-3" />
              </button>
              <span className="text-xs font-medium">
                {view === "files" ? "Files and Folders" : "Git"}
              </span>
            </div>
          )}

          {/* Sub-view search input */}
          {isSubView && (
            <div className="px-1.5 pb-1">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  size="sm"
                  placeholder={
                    view === "files"
                      ? "Search files..."
                      : "Search branches & changes..."
                  }
                  value={subViewSearch}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    setSubViewSearch(e.target.value);
                    setHighlightIndex(0);
                  }}
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                      e.preventDefault();
                      setHighlightIndex((prev) => {
                        if (options.length === 0) return 0;
                        if (e.key === "ArrowUp") {
                          return prev <= 0 ? options.length - 1 : prev - 1;
                        }
                        return prev >= options.length - 1 ? 0 : prev + 1;
                      });
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      const opt = options[highlightIndex];
                      opt?.onSelect();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setView("main");
                      setHighlightIndex(0);
                    }
                  }}
                  className="pl-7 h-6 text-xs"
                />
              </div>
            </div>
          )}

          {/* Breadcrumbs (files sub-view) */}
          {view === "files" && currentPath && (
            <div className="flex items-center gap-0.5 px-2 pb-1 text-[11px] text-muted-foreground flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setCurrentPath(undefined);
                  setHighlightIndex(0);
                  loadFiles();
                }}
                className="hover:text-foreground cursor-pointer"
              >
                root
              </button>
              {breadcrumbs.map((segment, i) => (
                <span key={i} className="flex items-center gap-0.5">
                  <ChevronRight className="size-2.5" />
                  <button
                    type="button"
                    onClick={() => {
                      const path = breadcrumbs.slice(0, i + 1).join("/");
                      setCurrentPath(path);
                      setHighlightIndex(0);
                      loadFiles(path);
                    }}
                    className={cn(
                      "hover:text-foreground cursor-pointer",
                      i === breadcrumbs.length - 1 &&
                        "text-foreground font-medium",
                    )}
                  >
                    {segment}
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Options list */}
          <div ref={listRef} className="overflow-y-auto max-h-48">
            {loading ? (
              <div className="flex items-center justify-center py-4 text-[11px] text-muted-foreground">
                Loading...
              </div>
            ) : options.length === 0 ? (
              <div className="flex items-center justify-center py-4 text-[11px] text-muted-foreground">
                {query || subViewSearch ? "No matches" : "No items"}
              </div>
            ) : (
              options.map((opt, i) => (
                <button
                  key={opt.key}
                  type="button"
                  data-highlighted={i === highlightIndex}
                  onClick={opt.onSelect}
                  onMouseEnter={() => setHighlightIndex(i)}
                  className={cn(
                    "flex w-full items-center gap-2 px-2 py-1.5 text-xs rounded-sm cursor-pointer text-left mx-0",
                    i === highlightIndex
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent",
                  )}
                >
                  {opt.icon}
                  <span className="flex-1 truncate">{opt.label}</span>
                  {opt.suffix}
                </button>
              ))
            )}
          </div>
        </div>
      </PopoverPopup>
    </Popover>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function statusLabel(status: string) {
  switch (status) {
    case "M":
      return "modified";
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "??":
      return "untracked";
    default:
      return status;
  }
}

function statusColor(status: string) {
  switch (status) {
    case "M":
      return "text-yellow-600 dark:text-yellow-400";
    case "A":
    case "??":
      return "text-green-600 dark:text-green-400";
    case "D":
      return "text-red-600 dark:text-red-400";
    default:
      return "text-muted-foreground";
  }
}
