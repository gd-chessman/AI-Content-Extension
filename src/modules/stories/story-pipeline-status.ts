/** Trạng thái pipeline story — dùng lọc GET /stories/my. */
export const STORY_PIPELINE_STATUSES = [
  'complete',
  'in_progress',
  'missing_chatgpt',
  'missing_videos',
  'ggsheet_pending',
  'ggsheet_pushed',
] as const;

export type StoryPipelineStatus = (typeof STORY_PIPELINE_STATUSES)[number];

const LEGACY_CHATGPT_STATUSES = new Set(['missing_images', 'missing_prompts', 'missing_content']);

export type StoryPipelineListItem = {
  imageUrls?: string[];
  videoPrompts?: string[];
  videoStorageAddresses?: string[];
  longContent?: string;
  ggsheetPush?: { pushed?: boolean };
};

export function parseStoryPipelineStatus(raw: string | undefined): StoryPipelineStatus | '' {
  const key = (raw || '').trim().toLowerCase();
  if (!key || key === 'all') return '';
  if (LEGACY_CHATGPT_STATUSES.has(key)) return 'missing_chatgpt';
  if ((STORY_PIPELINE_STATUSES as readonly string[]).includes(key)) {
    return key as StoryPipelineStatus;
  }
  return '';
}

export function isChatgptPipelineIncomplete(item: StoryPipelineListItem): boolean {
  return (
    !hasNonEmptyStrings(item.imageUrls) ||
    !hasNonEmptyStrings(item.videoPrompts) ||
    !Boolean((item.longContent || '').trim())
  );
}

export function hasNonEmptyStrings(values?: string[]): boolean {
  return (values || []).some((value) => (value || '').trim().length > 0);
}

export function isStoryPipelineComplete(item: StoryPipelineListItem): boolean {
  return (
    hasNonEmptyStrings(item.imageUrls) &&
    hasNonEmptyStrings(item.videoPrompts) &&
    hasNonEmptyStrings(item.videoStorageAddresses) &&
    Boolean((item.longContent || '').trim()) &&
    Boolean(item.ggsheetPush?.pushed)
  );
}

export function matchesStoryPipelineStatus(
  item: StoryPipelineListItem,
  status: StoryPipelineStatus,
): boolean {
  const hasVideos = hasNonEmptyStrings(item.videoStorageAddresses);
  const ggsheetPushed = Boolean(item.ggsheetPush?.pushed);
  const complete = isStoryPipelineComplete(item);

  switch (status) {
    case 'complete':
      return complete;
    case 'in_progress':
      return !complete;
    case 'missing_chatgpt':
      return isChatgptPipelineIncomplete(item);
    case 'missing_videos':
      return !hasVideos;
    case 'ggsheet_pending':
      return !ggsheetPushed;
    case 'ggsheet_pushed':
      return ggsheetPushed;
    default:
      return true;
  }
}

/** Lọc MongoDB cho trạng thái không phụ thuộc GG Sheet. */
export function buildStoryPipelineMongoFilter(
  status: StoryPipelineStatus,
): Record<string, unknown> | null {
  const nonEmpty = (field: string) => ({ [field]: { $elemMatch: { $regex: /\S/ } } });
  const missing = (field: string) => ({ $nor: [nonEmpty(field)] });
  const missingText = (field: string) => ({ $nor: [{ [field]: { $regex: /\S/ } }] });

  switch (status) {
    case 'missing_chatgpt':
      return {
        $or: [
          missing('imageUrls'),
          missing('videoPrompts'),
          missingText('longContent'),
        ],
      };
    case 'missing_videos':
      return missing('videoStorageAddresses');
    default:
      return null;
  }
}

export function isPostFilterPipelineStatus(status: StoryPipelineStatus | ''): status is StoryPipelineStatus {
  if (!status) return false;
  return ['complete', 'in_progress', 'ggsheet_pending', 'ggsheet_pushed'].includes(status);
}
