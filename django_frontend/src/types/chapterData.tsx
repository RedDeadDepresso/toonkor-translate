export enum StatusChoices {
  NOT_READY = "NOT_READY",
  LOADING = "LOADING",
  READY = "READY",
  REMOVING = "REMOVING"
}

interface ChapterData {
  index: string;
  date_upload: string;
  toonkor_id: string;

  download_status: StatusChoices;
  translation_status: StatusChoices;
}

export default ChapterData;
