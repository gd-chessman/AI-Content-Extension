import type { ToolDefinition } from '../tool-definition.types';
import { CHATGPT_HANDLER_KEYS } from './chatgpt-handler.keys';

export const CHATGPT_BOTTOM_BAR_TOOLS: ToolDefinition[] = [
  {
    code: 'chatgpt_fill_grok_image_1',
    name: 'Grok ảnh 1',
    platform: 'chatgpt',
    handlerKey: CHATGPT_HANDLER_KEYS.fillGrok,
    placement: 'bottom_bar',
    sortOrder: 0,
    defaultConfig: { part: 1 },
    handlerScript:
      'const part = config.part === 2 || config.part === "2" ? 2 : 1; await host.fillGrokImage(part);',
    uiConfig: {
      icon: 'image',
      copiedToolId: 'grok-1',
      buttonClass: 'bg-sky-500/20 text-sky-100 hover:bg-sky-500/30',
      badgeClass: 'bg-sky-500',
    },
  },
  {
    code: 'chatgpt_fill_grok_image_2',
    name: 'Grok ảnh 2',
    platform: 'chatgpt',
    handlerKey: CHATGPT_HANDLER_KEYS.fillGrok,
    placement: 'bottom_bar',
    sortOrder: 10,
    defaultConfig: { part: 2 },
    handlerScript:
      'const part = config.part === 2 || config.part === "2" ? 2 : 1; await host.fillGrokImage(part);',
    uiConfig: {
      icon: 'image',
      copiedToolId: 'grok-2',
      buttonClass: 'bg-sky-500/20 text-sky-100 hover:bg-sky-500/30',
      badgeClass: 'bg-sky-500',
    },
  },
  {
    code: 'chatgpt_push_webblog',
    name: 'Đẩy WebBlog',
    platform: 'chatgpt',
    handlerKey: CHATGPT_HANDLER_KEYS.pushWebBlog,
    placement: 'bottom_bar',
    sortOrder: 20,
    defaultConfig: {},
    handlerScript: 'await host.pushWebBlog();',
    uiConfig: {
      icon: 'fileText',
      copiedToolId: 'webblog',
      buttonClass: 'bg-amber-500/20 text-amber-100 hover:bg-amber-500/30',
      badgeClass: 'bg-amber-500',
    },
  },
  {
    code: 'chatgpt_collect_ggsheet',
    name: 'Gom GG Sheet',
    platform: 'chatgpt',
    handlerKey: CHATGPT_HANDLER_KEYS.collectGgSheet,
    placement: 'bottom_bar',
    sortOrder: 30,
    defaultConfig: {},
    handlerScript: 'await host.collectGgSheet();',
    uiConfig: {
      icon: 'fileText',
      copiedToolId: 'ggsheet',
      buttonClass: 'bg-green-500/20 text-green-100 hover:bg-green-500/30',
      badgeClass: 'bg-green-500',
    },
  },
  {
    code: 'chatgpt_save_local',
    name: 'Lưu local',
    platform: 'chatgpt',
    handlerKey: CHATGPT_HANDLER_KEYS.saveLocal,
    placement: 'bottom_bar',
    sortOrder: 40,
    defaultConfig: {},
    handlerScript: 'await host.saveLocal();',
    uiConfig: {
      icon: 'fileText',
      copiedToolId: 'save-local',
      buttonClass: 'bg-teal-500/25 text-teal-100 hover:bg-teal-500/35',
      badgeClass: 'bg-teal-500',
    },
  },
];
