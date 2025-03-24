import { MantineColorScheme } from '@mantine/core';
import readData from './readData';

interface SettingsData {
  colorScheme: MantineColorScheme;
  displayEnglish: boolean;
  autoFetchToonkorUrl: boolean;
  toonkorUrl: string;
  read: readData;
  comicLoading: boolean,
  setToonkorUrl: (value: string) => void;
  setAutoFetchToonkorUrl: (value: boolean) => void;
  setColorScheme: (value: MantineColorScheme) => void;
  setDisplayEnglish: (value: boolean) => void;
  setRead: (value: readData) => void
  setComicLoading: (value: boolean) => void
}

export default SettingsData;
