import {
  Image,
  Title,
  Button,
  Group,
  Tooltip,
  Stack,
  ScrollArea,
  ActionIcon,
  AspectRatio,
  rem,
} from '@mantine/core';
import classes from './ManhwaHeader.module.css';
import { SettingsContext } from '@/contexts/SettingsContext';
import { useContext, useState } from 'react';
import ManhwaData from '@/types/manhwaData';
import Markdown from 'react-markdown';
import { IconHeart } from '@tabler/icons-react';

// Define props interface
interface ManhwaHeaderProps {
  manhwaData: ManhwaData;
}

enum LibraryButtonState {
  ADDED,
  LOADING,
  NOT_ADDED
}

// Helper function to render buttons with tooltip
const renderLinkButton = (href: string, src: string, label: string) => (
  <Tooltip label={label}>
    <ActionIcon
      variant="default"
      component="a"
      href={href}
      target="_blank"
      size={70}
      aria-label={label}
      className={classes.linkButton}
    >
      <AspectRatio ratio={192 / 192}>
        <img
          src={src}
          alt={label}
        />
      </AspectRatio>
    </ActionIcon>
  </Tooltip>
);

const renderBatotoButton = (title: string) => {
  const batotoLink = `https://batocomic.com/v3x-search?word=${title}`;
  return renderLinkButton(batotoLink, '/images/batoto-logo.png', 'Open Batoto URL');
}

const renderMangadexButton = (manhwaData: ManhwaData) => {
  const mangadexLink = manhwaData.mangadex_id ? `https://mangadex.org/title/${manhwaData.mangadex_id}` :
  `https://mangadex.org/search?q=${manhwaData.title}`;
  console.log(mangadexLink);

  return renderLinkButton(mangadexLink, '/images/mangadex-logo.png', 'Open Mangadex URL')
}

// Main component function
export function ManhwaHeader({ manhwaData }: ManhwaHeaderProps) {
  const { displayEnglish } = useContext(SettingsContext);
  const initialState = manhwaData.in_library ? LibraryButtonState.ADDED : LibraryButtonState.NOT_ADDED;
  const [libraryButtonState, setLibraryButtonState] = useState<LibraryButtonState>(initialState);
  const {toonkorUrl} = useContext(SettingsContext);

  // Determine displayed title and description based on context setting
  const title = displayEnglish && manhwaData.en_title ? manhwaData.en_title : manhwaData.title;
  const description = displayEnglish && manhwaData.en_description
    ? manhwaData.en_description
    : manhwaData.description;

  const addToLibrary = async () => {
    try {
      setLibraryButtonState(LibraryButtonState.LOADING);
      const response = await fetch(`/api/add_library?toonkor_id=${manhwaData.toonkor_id}`);
      const added = await response.json();
      if (added) {
        console.log("Added");
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
  }

  const removeFromLibrary = async () => {
    try {
      setLibraryButtonState(LibraryButtonState.LOADING);
      const response = await fetch(`/api/remove_library?toonkor_id=${manhwaData.toonkor_id}`);
      const removed = await response.json();
      if (removed) {
        console.log("Removed");
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
  }
  
  const renderLibraryButton = (state: LibraryButtonState) => {
    if (state === LibraryButtonState.ADDED) 
      return (
        <Button h={55} leftSection={<IconHeart size={25} />} onClick={removeFromLibrary}>
          In Library
        </Button>
      );
    if (state === LibraryButtonState.NOT_ADDED) 
      return (
        <Button h={55} leftSection={<IconHeart size={25} />} variant="default" onClick={addToLibrary}>
          Add to Library
        </Button>
      );
    return (
      <Button h={55} loading loaderProps={{ type: 'dots' }} variant="default">
        Loading
      </Button>
    );
  }

  return (
    <ScrollArea h={rem(750)}>
      <Stack>
        {/* Title Section */}
        <Title className={classes.title} m="auto">
          {title}
        </Title>

        {/* Thumbnail Image */}
        <Image src={manhwaData.thumbnail} className={classes.image} radius="md" m="auto" />

        {/* Links Group */}
        <Group my="md" gap="sm" justify="center">
          {renderLibraryButton(libraryButtonState)}
          {renderBatotoButton(title)}
          {renderMangadexButton(manhwaData)}
          {renderLinkButton(`${toonkorUrl}${manhwaData.toonkor_id}`, '/images/toonkor-logo.png', 'Open Toonkor URL')}
        </Group>

        {/* Description Section */}
        <div className={classes.content}>
          <Markdown>{description}</Markdown>
        </div>
      </Stack>
    </ScrollArea>
  );
}
