export class ListScrapedReelsQueryDto {
  fanpageUrl: string;
  minViews?: number;
  maxViews?: number;
  limit?: number;
  excludeUrls?: string;
}

export class UpsertScrapedReelItemDto {
  reelUrl: string;
  title?: string;
  description?: string;
  viewsLabel?: string;
  viewCount?: number;
  imageUrl?: string;
  externalVideoId?: string;
}

export class UpsertScrapedReelsDto {
  fanpageUrl: string;
  items: UpsertScrapedReelItemDto[];
}
