export class ListScrapedReelsQueryDto {
  fanpageUrl: string;
  minViews?: number;
  maxViews?: number;
  limit?: number;
  excludeUrls?: string;
}
