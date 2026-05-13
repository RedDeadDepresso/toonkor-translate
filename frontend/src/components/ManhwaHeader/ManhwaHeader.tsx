import {
  Image,
  Title,
  Button,
  Group,
  Tooltip,
  Stack,
  ActionIcon,
  AspectRatio,
  rem,
} from "@mantine/core";
import { useContext, useState } from "react";
import Markdown from "react-markdown";
import { IconHeart } from "@tabler/icons-react";
import classes from "./ManhwaHeader.module.css";
import { SettingsContext } from "@/contexts/SettingsContext";
import { AddManhwa, BrowserOpenURL, RemoveManhwa } from "../../../bindings/toonkor-translate/backend/backend";
import { Manhwa } from "../../../bindings/toonkor-translate/backend/models";

// Define props interface
interface ManhwaHeaderProps {
  manhwaData: Manhwa;
}

enum LibraryButtonState {
  ADDED,
  LOADING,
  NOT_ADDED,
}

// Helper function to render buttons with tooltip
const renderLinkButton = (href: string, src: string, label: string) => (
  <Tooltip label={label}>
    <ActionIcon
      variant="default"
      size={70}
      aria-label={label}
      className={classes.linkButton}
      onClick={() => BrowserOpenURL(href)}
    >
      <AspectRatio ratio={192 / 192}>
        <img src={src} alt={label} />
      </AspectRatio>
    </ActionIcon>
  </Tooltip>
);

const renderComixButton = (title: string) => {
  const comixLink = `https://comix.to/browse?q=${title}`;
  return renderLinkButton(
    comixLink,
    "/images/comix-logo.png",
    "Open Comix URL",
  );
};

const renderMangadexButton = (manhwaData: Manhwa) => {
  const mangadexLink = manhwaData.mangaDexId
    ? `https://mangadex.org/title/${manhwaData.mangaDexId}`
    : `https://mangadex.org/search?q=${manhwaData.title}`;

  return renderLinkButton(
    mangadexLink,
    "/images/mangadex-logo.png",
    "Open Mangadex URL",
  );
};

// Main component function
export function ManhwaHeader({ manhwaData }: ManhwaHeaderProps) {
  const { displayEnglish } = useContext(SettingsContext);
  const initialState = manhwaData.inLibrary
    ? LibraryButtonState.ADDED
    : LibraryButtonState.NOT_ADDED;
  const [libraryButtonState, setLibraryButtonState] =
    useState<LibraryButtonState>(initialState);
  const { toonkorUrl } = useContext(SettingsContext);

  // Determine displayed title and description based on context setting
  const title =
    displayEnglish && manhwaData.enTitle
      ? manhwaData.enTitle
      : manhwaData.title;
  const description =
    displayEnglish && manhwaData.enDescription
      ? manhwaData.enDescription
      : manhwaData.description;

  const addToLibrary = async () => {
    try {
      setLibraryButtonState(LibraryButtonState.LOADING);
      const added = await AddManhwa(manhwaData.toonkorId)
      if (added) {
        setLibraryButtonState(LibraryButtonState.ADDED);
      } else {
        // Handle the case where addition failed
        setLibraryButtonState(LibraryButtonState.NOT_ADDED);
      }
    } catch (error) {
      console.error("Failed to add to library", error);
      // Handle error state
      setLibraryButtonState(LibraryButtonState.NOT_ADDED);
    }
  };

  const removeFromLibrary = async () => {
    try {
      setLibraryButtonState(LibraryButtonState.LOADING);
      const removed = await RemoveManhwa(manhwaData.toonkorId)
      if (removed) {
        setLibraryButtonState(LibraryButtonState.NOT_ADDED);
      } else {
        // Handle the case where removal failed
        setLibraryButtonState(LibraryButtonState.ADDED);
      }
    } catch (error) {
      console.error("Failed to remove from library", error);
      // Handle error state
      setLibraryButtonState(LibraryButtonState.ADDED);
    }
  };

  const renderLibraryButton = (state: LibraryButtonState) => {
    if (state === LibraryButtonState.ADDED) {
      return (
        <Button
          h={55}
          leftSection={<IconHeart size={25} />}
          onClick={removeFromLibrary}
          w={rem("376px")}
        >
          In Library
        </Button>
      );
    }
    if (state === LibraryButtonState.NOT_ADDED) {
      return (
        <Button
          h={55}
          leftSection={<IconHeart size={25} />}
          variant="default"
          onClick={addToLibrary}
          w={rem("376px")}
        >
          Add to Library
        </Button>
      );
    }
    return (
      <Button
        h={55}
        loading
        loaderProps={{ type: "dots" }}
        variant="default"
        w={rem("376px")}
      >
        Loading
      </Button>
    );
  };

  return (
    <div className={classes.inner}>
      <Stack justify="center" align="center" gap="xl">
        {/* Title Section */}
        <Title className={classes.title}>{title}</Title>

        {/* Thumbnail Image */}
        <Image
          src={manhwaData.thumbnail}
          className={classes.image}
          radius="md"
        />

        {/* Links Group */}
        {renderLibraryButton(libraryButtonState)}
        <Group gap="sm" justify="center">
          {renderComixButton(title)}
          {renderMangadexButton(manhwaData)}
          {renderLinkButton(
            `${toonkorUrl}/${manhwaData.toonkorId}`,
            "/images/toonkor-logo.png",
            "Open Toonkor URL",
          )}
        </Group>

        {/* Description Section */}
        <div>
          <Markdown>{description}</Markdown>
        </div>
      </Stack>
    </div>
  );
}
