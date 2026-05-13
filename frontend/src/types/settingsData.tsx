import { MantineColorScheme } from '@mantine/core';
import readData from './readData';

interface SettingsData {
  colorScheme: MantineColorScheme;
  displayEnglish: boolean;
  curlCommand: string;
  toonkorUrl: string;
  koharuPath: string;
  translationPageLimit: number;
  read: readData;
  comicLoading: boolean;
  setCurlCommand: (value: string) => void;
  setToonkorUrl: (value: string) => void;
  setKoharuPath: (value: string) => void
  setTranslationPageLimit: (value: number) => void;
  setColorScheme: (value: MantineColorScheme) => void;
  setDisplayEnglish: (value: boolean) => void;
  setRead: (value: readData) => void;
  setComicLoading: (value: boolean) => void;
}

export default SettingsData;
