import React, { createContext, useEffect, useState } from 'react';
import { useLocalStorage } from '@mantine/hooks';
import SettingsData from '@/types/settingsData';
import { useMantineColorScheme } from '@mantine/core';
import readData from '@/types/readData';

interface childrenProps {
    children: React.ReactNode
}

export const SettingsContext = createContext<SettingsData>({} as SettingsData);

export const SettingsProvider = ({ children }: childrenProps) => {
    const [displayEnglish, setDisplayEnglish] = useLocalStorage({
        key: 'display_english',
        defaultValue: true,
    });
    const { colorScheme, setColorScheme } = useMantineColorScheme();
    const [autoFetchToonkorUrl, setAutoFetchToonkorUrl] = useLocalStorage({
        key: 'auto_fetch_toonkor_url',
        defaultValue: false,
    });
    const [toonkorUrl, setToonkorUrl] = useLocalStorage({ key: 'toonkor_url', defaultValue: 'https://toonkor434.com' });
    const [read, setRead] = useLocalStorage<readData>({key: 'read', defaultValue: {}})
    const [comicLoading, setComicLoading] = useState<boolean>(false);

    const requestUrl = async (apiUrl: string) => {
      try {
          const response = await fetch(apiUrl);
          if (!response.ok) {
              throw new Error(`Response status: ${response.status}`);
          }
          const json = await response.json();
          if (!json.error) {
            setToonkorUrl(json.url);
          }
      } catch (error: any) {
          console.error(error.message);
      }
    };

    useEffect(() => {
        if (!toonkorUrl) requestUrl("/api/get_toonkor_url")
    }, [toonkorUrl])

    useEffect(() => {
        if (autoFetchToonkorUrl) requestUrl("/api/fetch_toonkor_url")
    }, [autoFetchToonkorUrl])

    return (
        <SettingsContext.Provider value={{
            displayEnglish,
            setDisplayEnglish,
            colorScheme,
            setColorScheme,
            autoFetchToonkorUrl,
            setAutoFetchToonkorUrl,
            toonkorUrl,
            setToonkorUrl,
            read, 
            setRead,
            comicLoading,
            setComicLoading
        }}>
            {children}
        </SettingsContext.Provider>
    );
};
