export type ContextItemType =
  | "file"
  | "folder"
  | "git-branch"
  | "git-diff"
  | "web-search"
  | "image";

export interface ContextItem {
  id: string;
  type: ContextItemType;
  label: string;
  value: string;
}
