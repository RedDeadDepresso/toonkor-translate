import { Group, Burger, TextInput, ActionIcon, Drawer, rem, Title, Switch, Tooltip } from '@mantine/core';
import { useDisclosure, useInputState } from '@mantine/hooks';
import { IconSearch, IconAlphabetKorean, IconSettings, IconAppWindow } from '@tabler/icons-react';
import classes from './NavBar.module.css';
import { useNavigate } from 'react-router-dom';
import SettingsDrawer from '../SettingsDrawer/SettingsDrawer';
import { useContext, useEffect } from 'react';
import { SettingsContext } from '@/contexts/SettingsContext';


interface searchBarProps {
  showSearchBar: boolean;
  searchPlaceHolder?: string
  onSearchChange?: (value: string) => void;
  delaySearchChange?: number
}

const links = [
  { link: '/', label: 'Library' },
  { link: '/browse', label: 'Browse' },
];

export function NavBar({ showSearchBar, searchPlaceHolder = '', onSearchChange = () => {}, delaySearchChange = 0 }: searchBarProps) {
  const navigate = useNavigate();
  const [opened, { toggle }] = useDisclosure(false);
  const [settingsOpened, { open: openSettings, close: closeSettings }] = useDisclosure(false);
  const [searchValue, setSearchValue] = useInputState<string>('');
  const {comicLoading, setComicLoading} = useContext(SettingsContext);

  const openComicTranslate = async() => {
    setComicLoading(true);
    await fetch('/api/open_comic');
    setComicLoading(false);
  }

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
    <header className={classes.header}>
      <div className={classes.inner}>
        <Group>
          <Burger opened={opened} onClick={toggle} size="sm" hiddenFrom="md" />
          <Group gap={5} className={classes.links} visibleFrom="md">
            <ActionIcon
              variant="gradient"
              size={35}
              aria-label="Gradient action icon"
              gradient={{ from: 'blue', to: 'cyan', deg: 90 }}
            >
              <IconAlphabetKorean />
            </ActionIcon>
            {items}
          </Group>
        </Group>
        {showSearchBar && (
          <TextInput
            leftSection={<IconSearch style={{ width: rem(16), height: rem(16) }} stroke={1.5} />}
            radius="xl"
            placeholder={searchPlaceHolder}
            value={searchValue}
            onChange={setSearchValue}
            className={classes.search}
          />
        )}
        <Group>
          <SettingsDrawer settingsOpened={settingsOpened} closeSettings={closeSettings}/>
          <Tooltip label="Open Comic Translate">
          <ActionIcon className={classes.actionIcon} loading={comicLoading} variant="default" size="xl" radius="xl" onClick={openComicTranslate}>
            <IconAppWindow />
          </ActionIcon>
          </Tooltip>
          <ActionIcon className={classes.actionIcon} variant="default" size="xl" radius="xl" onClick={openSettings}>
            <IconSettings />
          </ActionIcon>
        </Group>
      </div>
    </header>
  );
}
