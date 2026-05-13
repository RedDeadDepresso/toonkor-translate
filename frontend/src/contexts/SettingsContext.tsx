import React, { createContext, useEffect, useState } from "react";
import { useLocalStorage } from "@mantine/hooks";
import { useMantineColorScheme } from "@mantine/core";
import SettingsData from "@/types/settingsData";
import readData from "@/types/readData";
import { GetSettings } from "../../bindings/toonkor-translate/backend/backend";

interface childrenProps {
  children: React.ReactNode;
}

export const SettingsContext = createContext<SettingsData>({} as SettingsData);

export const SettingsProvider = ({ children }: childrenProps) => {
  const [displayEnglish, setDisplayEnglish] = useLocalStorage({
    key: "display_english",
    defaultValue: true,
  });
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const [toonkorUrl, setToonkorUrl] = useLocalStorage({
    key: "toonkor_url",
    defaultValue: "https://tkor116.com",
  });
  const [curlCommand, setCurlCommand] = useLocalStorage({
    key: "curl_command",
    defaultValue: "",
  });
  const [koharuPath, setKoharuPath] = useLocalStorage({
    key: "koharu_path",
    defaultValue: "",
  });
  const [translationPageLimit, setTranslationPageLimit] = useLocalStorage({
    key: "translation_page_limit",
    defaultValue: 0,
  });
  const [llmKind, setLlmKind] = useLocalStorage({
    key: "llm_kind",
    defaultValue: "provider",
  });
  const [llmProviderID, setLlmProviderID] = useLocalStorage({
    key: "llm_provider_id",
    defaultValue: "openai",
  });
  const [llmModelID, setLlmModelID] = useLocalStorage({
    key: "llm_model_id",
    defaultValue: "gpt-4o-mini",
  });
  const [llmApiKey, setLlmApiKey] = useLocalStorage({
    key: "llm_api_key",
    defaultValue: "",
  });
  const [read, setRead] = useLocalStorage<readData>({
    key: "read",
    defaultValue: {},
  });
  const [comicLoading, setComicLoading] = useState<boolean>(false);

  const fetchSettings = async () => {
    try {
      const settings = await GetSettings();
      setCurlCommand(settings.curlCommand);
      setToonkorUrl(settings.toonkorUrl);
      setTranslationPageLimit(settings.translationPageLimit);
      setKoharuPath(settings.koharuPath);
      setLlmKind(settings.llmKind || "provider");
      setLlmProviderID(settings.llmProviderId || "openai");
      setLlmModelID(settings.llmModelId || "gpt-4o-mini");
      setLlmApiKey(settings.llmApiKey || "");
    } catch (error: any) {
      console.error(error.message);
    }
  };

  useEffect(() => {
    if (!curlCommand || !toonkorUrl || !translationPageLimit || !koharuPath)
      fetchSettings();
  }, [curlCommand, toonkorUrl, translationPageLimit, koharuPath]);

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
        koharuPath,
        setKoharuPath,
        translationPageLimit,
        setTranslationPageLimit,
        llmKind,
        setLlmKind,
        llmProviderID,
        setLlmProviderID,
        llmModelID,
        setLlmModelID,
        llmApiKey,
        setLlmApiKey,
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