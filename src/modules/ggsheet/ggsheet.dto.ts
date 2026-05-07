export class UpdateGgSheetDto {
  ggSheetPath?: string;
  titleColumn?: string;
  shortContentColumn?: string;
  fullContentColumn?: string;
}

export class PushGgSheetDto {
  title?: string;
  shortContent?: string;
  fullContent?: string;
}
