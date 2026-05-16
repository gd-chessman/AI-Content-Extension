/** Metadata hiển thị nút trên extension (FE đọc từ `uiConfig` sau khi sync DB). */
export type ToolUiConfig = {
  icon: string;
  copiedToolId: string;
  colSpan?: 1 | 2;
  buttonClass: string;
  badgeClass: string;
  /** Hiển thị badge đã copy trên nút. */
  showCopyBadge?: boolean;
  /** Nhóm trên lưới công cụ workflow (không theo stepNo). */
  displayGroup?: 'image' | 'video' | 'content';
  /** Thứ tự trong nhóm displayGroup. */
  displayOrder?: number;
};

export type ToolPlatform =
  | 'chatgpt'
  | 'grok'
  | 'facebook'
  | 'webblog'
  | 'ggsheet'
  | 'multi';

export type ToolPlacementType = 'step_panel' | 'bottom_bar' | 'global';

/** Định nghĩa tool trong mã nguồn — đồng bộ lên MongoDB khi khởi động. */
export type ToolDefinition = {
  code: string;
  name: string;
  platform: ToolPlatform;
  /** Metadata / log — FE không switch theo khóa này. */
  handlerKey: string;
  placement: ToolPlacementType;
  sortOrder: number;
  defaultConfig?: Record<string, unknown>;
  uiConfig?: ToolUiConfig;
  /** JS chạy trên extension: `await host.someMethod(config)`. Sync DB, FE fetch khi bấm nút. */
  handlerScript: string;
  /** JS trả boolean — `true` = nút disabled. Có trong API workflow tools để render UI. */
  guardScript?: string;
  isActive?: boolean;
};
