import ChapterData from "./chapterData"

interface ManhwaData {
    title: string 
    description: string
  
    en_title: string
    en_description: string

    thumbnail: string
    chapters: Array<ChapterData>
    in_library: boolean

    mangadex_id: string
    toonkor_id: string
}

export default ManhwaData