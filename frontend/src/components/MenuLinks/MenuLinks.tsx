import useOpenURL from "@/hooks/useOpenURL"
import ChapterData from "@/types/chapterData"
import { FloatingPosition, Menu, rem } from "@mantine/core"
import { IconDownload, IconLanguage, IconWorld } from "@tabler/icons-react"
import { ReactNode } from "react"


interface MenuLinkProps {
    children: ReactNode
    chapter: ChapterData;
    position: FloatingPosition | undefined;
    newTab?: boolean;
}

const MenuLink = ({children, chapter, position}: MenuLinkProps) => {
  const {openToonkorURL, openLocalURL} = useOpenURL();

    return (
        <Menu trigger="click-hover" position={position}>
        <Menu.Target>
            {children}
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            onClick={(event) => {event.stopPropagation(); openToonkorURL(chapter.toonkor_id, true)}}
            leftSection={<IconWorld style={{ width: rem(14), height: rem(14) }} />}
          >
            Toonkor URL
          </Menu.Item>
          <Menu.Item
            disabled={chapter.download_status === 'NOT_READY'}
            onClick={(event) => {event.stopPropagation(); openLocalURL(chapter.toonkor_id, 'downloaded', false)}}
            leftSection={<IconDownload style={{ width: rem(14), height: rem(14) }} />}
          >
            Download URL
          </Menu.Item>
          <Menu.Item
            disabled={chapter.translation_status === 'NOT_READY'}
            onClick={(event) => {event.stopPropagation(); openLocalURL(chapter.toonkor_id, 'translated', false)}}
            leftSection={<IconLanguage style={{ width: rem(14), height: rem(14) }} />}
          >
            Translation URL
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    )
}


export default MenuLink;