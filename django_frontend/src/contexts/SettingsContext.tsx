import React, { createContext, useEffect, useState } from 'react';
import { useLocalStorage } from '@mantine/hooks';
import { useMantineColorScheme } from '@mantine/core';
import SettingsData from '@/types/settingsData';
import readData from '@/types/readData';

interface childrenProps {
  children: React.ReactNode;
}

export const SettingsContext = createContext<SettingsData>({} as SettingsData);

export const SettingsProvider = ({ children }: childrenProps) => {
  const [displayEnglish, setDisplayEnglish] = useLocalStorage({
    key: 'display_english',
    defaultValue: true,
  });
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const [toonkorUrl, setToonkorUrl] = useLocalStorage({
    key: 'toonkor_url',
    defaultValue: 'https://tkor08.com',
  });
  const [curlCommand, setCurlCommand] = useLocalStorage({
    key: 'curl_command',
    defaultValue: ""
  })
  const [translationPageLimit, setTranslationPageLimit] = useLocalStorage({
    key: 'translation_page_limit',
    defaultValue: 0,
  });
  const [read, setRead] = useLocalStorage<readData>({ key: 'read', defaultValue: {} });
  const [comicLoading, setComicLoading] = useState<boolean>(false);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/settings');
      if (!response.ok) {
        throw new Error(`Response status: ${response.status}`);
      }
      const json = await response.json();
      if (!json.error) {
        setCurlCommand(json.curl_command);
        setToonkorUrl(json.toonkor_url);
        setTranslationPageLimit(json.translation_page_limit);
      }
    } catch (error: any) {
      console.error(error.message);
    }
  };

  useEffect(() => {
    if (!curlCommand || !toonkorUrl || !translationPageLimit) fetchSettings();
  }, [curlCommand, toonkorUrl, translationPageLimit]);

  return (
    <SettingsContext.Provider
      value={{
        displayEnglish,
        setDisplayEnglish,
        colorScheme,
        setColorScheme,
        curlCommand,
        setCurlCommand,
        toonkorUrl,
        setToonkorUrl,
        translationPageLimit,
        setTranslationPageLimit,
        read,
        setRead,
        comicLoading,
        setComicLoading,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};
