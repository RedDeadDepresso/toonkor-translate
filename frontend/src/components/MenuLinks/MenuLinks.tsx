import { FloatingPosition, Menu, rem } from "@mantine/core";
import { IconDownload, IconLanguage, IconWorld } from "@tabler/icons-react";
import { ReactNode } from "react";
import useOpenURL from "@/hooks/useOpenURL";
import { Chapter, Status } from "../../../bindings/toonkor-translate/backend/models";

interface MenuLinkProps {
  children: ReactNode;
  chapter: Chapter;
  position: FloatingPosition | undefined;
  newTab?: boolean;
}

const MenuLink = ({ children, chapter, position }: MenuLinkProps) => {
  const { openToonkorURL, openLocalURL } = useOpenURL();

  return (
    <Menu trigger="click-hover" position={position}>
      <Menu.Target>{children}</Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          onClick={(event) => {
            event.stopPropagation();
            openToonkorURL(chapter.toonkorId, true);
          }}
          leftSection={
            <IconWorld style={{ width: rem(14), height: rem(14) }} />
          }
        >
          Toonkor URL
        </Menu.Item>
        <Menu.Item
          disabled={chapter.downloadStatus === Status.NotReady}
          onClick={(event) => {
            event.stopPropagation();
            openLocalURL(chapter.toonkorId, "downloaded", false);
          }}
          leftSection={
            <IconDownload style={{ width: rem(14), height: rem(14) }} />
          }
        >
          Download URL
        </Menu.Item>
        <Menu.Item
          disabled={chapter.translationStatus === Status.NotReady}
          onClick={(event) => {
            event.stopPropagation();
            openLocalURL(chapter.toonkorId, "translated", false);
          }}
          leftSection={
            <IconLanguage style={{ width: rem(14), height: rem(14) }} />
          }
        >
          Translation URL
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
};

export default MenuLink;
