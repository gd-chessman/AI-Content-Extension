import { CHATGPT_BOTTOM_BAR_TOOLS } from './chatgpt/bottom-bar.tools';
import { CHATGPT_STEP_PANEL_TOOLS } from './chatgpt/step-panel.tools';
import type { ToolDefinition } from './tool-definition.types';

/**
 * Danh sách tool đăng ký trong mã nguồn.
 * Thêm file mới trong `shared/tools/<platform>/` rồi gộp vào đây.
 */
export const TOOL_REGISTRY: ToolDefinition[] = [
  ...CHATGPT_STEP_PANEL_TOOLS,
  ...CHATGPT_BOTTOM_BAR_TOOLS,
];
