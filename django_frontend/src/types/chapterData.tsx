interface ChapterData {
    index: string
    date_upload: string
    toonkor_id: string

    download_status: "NOT_READY" | "LOADING" | "READY" | "REMOVING"
    translation_status: "NOT_READY" | "LOADING" | "READY" | "REMOVING"
}

export default ChapterData;