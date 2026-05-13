import { MantineColorScheme } from '@mantine/core';
import readData from './readData';

interface SettingsData {
  colorScheme: MantineColorScheme;
  displayEnglish: boolean;
  curlCommand: string;
  toonkorUrl: string;
  koharuPath: string;
  translationPageLimit: number;
  llmKind: string;
  llmProviderID: string;
  llmModelID: string;
  ocrEngine: string;
  read: readData;
  koharuLoading: boolean;
  setCurlCommand: (value: string) => void;
  setToonkorUrl: (value: string) => void;
  setKoharuPath: (value: string) => void;
  setTranslationPageLimit: (value: number) => void;
  setLlmKind: (value: string) => void;
  setLlmProviderID: (value: string) => void;
  setLlmModelID: (value: string) => void;
  setOcrEngine: (value: string) => void;
  setColorScheme: (value: MantineColorScheme) => void;
  setDisplayEnglish: (value: boolean) => void;
  setRead: (value: readData) => void;
  setKoharuLoading: (value: boolean) => void;
}

export default SettingsData;