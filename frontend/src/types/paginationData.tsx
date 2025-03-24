import ChapterData from "./chapterData";

interface PaginationData {
    manhwa_id: string
    manhwa_title: string;
    manhwa_en_title: string;
    
    prev_chapter: ChapterData;
    current_chapter: ChapterData;
    next_chapter: ChapterData;

    pages: string[]
}

export default PaginationData;