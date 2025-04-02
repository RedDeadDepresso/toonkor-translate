import { MantineColorScheme } from '@mantine/core';
import readData from './readData';

interface SettingsData {
  colorScheme: MantineColorScheme;
  displayEnglish: boolean;
  curlCommand: string;
  toonkorUrl: string;
  read: readData;
  comicLoading: boolean;
  setCurlCommand: (value: string) => void;
  setToonkorUrl: (value: string) => void;
  setColorScheme: (value: MantineColorScheme) => void;
  setDisplayEnglish: (value: boolean) => void;
  setRead: (value: readData) => void;
  setComicLoading: (value: boolean) => void;
}

export default SettingsData;
