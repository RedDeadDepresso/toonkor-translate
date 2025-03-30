import { Group, TextInput, ActionIcon, rem, Tooltip, Text, Button, Stack } from '@mantine/core';
import { useDisclosure, useInputState, useMediaQuery } from '@mantine/hooks';
import { IconSearch, IconSettings, IconAppWindow, IconWorld, IconBooks } from '@tabler/icons-react';
import classes from './NavBar.module.css';
import { useNavigate } from 'react-router-dom';
import SettingsDrawer from '../SettingsDrawer/SettingsDrawer';
import { useContext, useEffect } from 'react';
import { SettingsContext } from '@/contexts/SettingsContext';
import icon from '@/favicon.svg';

interface searchBarProps {
  showSearchBar: boolean;
  searchPlaceHolder?: string;
  onSearchChange?: (value: string) => void;
  delaySearchChange?: number;
}

const links = [
  { link: '/', label: 'Library', icon: <IconBooks size={28} stroke={1.5} /> },
  { link: '/browse', label: 'Browse', icon: <IconWorld size={28} stroke={1.5} /> },
];

export function NavBar({
  showSearchBar,
  searchPlaceHolder = '',
  onSearchChange = () => {},
  delaySearchChange = 0,
}: searchBarProps) {
  const navigate = useNavigate();
  const [settingsOpened, { open: openSettings, close: closeSettings }] = useDisclosure(false);
  const [searchValue, setSearchValue] = useInputState<string>('');
  const { comicLoading, setComicLoading } = useContext(SettingsContext);
  const matches = useMediaQuery('(min-width: 1024px)');

  const openComicTranslate = async () => {
    setComicLoading(true);
    await fetch('/api/open_comic');
    setComicLoading(false);
  };

  useEffect(() => {
    const handler = setTimeout(() => {
      onSearchChange(searchValue);
    }, delaySearchChange);

    return () => {
      clearTimeout(handler);
    };
  }, [searchValue]);

  const items = links.map((link) => (
    <a
      key={link.label}
      href={link.link}
      className={classes.link}
      onClick={(event) => {
        event.preventDefault();
        navigate(link.link);
      }}
    >
      {link.label}
    </a>
  ));

  return (
    <>
      {(showSearchBar || matches) && (
        <Group className={classes.header} px="2rem">
          <Group gap={5} className={classes.links} visibleFrom="md">
            <img src={icon} alt="icon" width="32" height="32" />
            {items}
          </Group>
          {showSearchBar && (
            <Group className={classes.searchContainer} justify="center">
              <TextInput
                className={classes.searchInput}
                leftSection={
                  <IconSearch style={{ width: rem(16), height: rem(16) }} stroke={1.5} />
                }
                radius="xl"
                placeholder={searchPlaceHolder}
                value={searchValue}
                onChange={setSearchValue}
              />
            </Group>
          )}
          <Group visibleFrom="md">
            <SettingsDrawer settingsOpened={settingsOpened} closeSettings={closeSettings} />
            <Tooltip label="Open Comic Translate">
              <ActionIcon
                className={classes.actionIcon}
                loading={comicLoading}
                variant="default"
                size="xl"
                radius="xl"
                onClick={openComicTranslate}
              >
                <IconAppWindow />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Settings">
              <ActionIcon
                className={classes.actionIcon}
                variant="default"
                size="xl"
                radius="xl"
                onClick={openSettings}
              >
                <IconSettings />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      )}

      <div style={{ marginBottom: rem('30px') }}></div>

      <Group className={classes.mobileFooter} w={'100%'} gap={0} hiddenFrom="md">
        {links.map((link) => (
          <Button
            h={70}
            key={link.label}
            component="a"
            href={link.link}
            className={classes.mobileLink}
            variant="default"
            onClick={(event) => {
              event.preventDefault();
              navigate(link.link);
            }}
            flex={1}
            radius={0}
          >
            <Stack justify="center" align="center" gap={2}>
              {link.icon}
              {link.label}
            </Stack>
          </Button>
        ))}
        <Button
          h={70}
          variant="default"
          onClick={openComicTranslate}
          flex={1}
          radius={0}
          loading={comicLoading}
        >
          <Stack justify="center" align="center" gap={2}>
            <IconAppWindow size={28} stroke={1.5} />
            <Text>Open CT</Text>
          </Stack>
        </Button>
        <Button h={70} variant="default" onClick={openSettings} flex={1} radius={0}>
          <Stack justify="center" align="center" gap={2}>
            <IconSettings size={28} stroke={1.5} />
            Settings
          </Stack>
        </Button>
      </Group>
    </>
  );
}
