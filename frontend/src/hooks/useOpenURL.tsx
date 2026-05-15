import { useContext } from "react";
import { useNavigate } from "react-router-dom";
import { SettingsContext } from "@/contexts/SettingsContext";
import { BrowserOpenURL } from "../../bindings/toonkor-translate/backend/backend";

const useOpenURL = () => {
  const { read, setRead, toonkorUrl } = useContext(SettingsContext);
  const navigate = useNavigate();

  const openToonkorURL = (chapterId: string, newTab: boolean) => {
    const chapterUrl = `${toonkorUrl}/${chapterId}`;
    setRead({ ...read, [chapterId]: true });
    if (newTab) {
      BrowserOpenURL(chapterUrl);
    } else {
      window.location.href = chapterUrl;
    }
  };

  const openLocalURL = (
    chapterId: string,
    choice: "downloaded" | "translated",
    newTab: boolean,
  ) => {
    const chapterUrl = `/chapter/${chapterId}/${choice}`;

    setRead({ ...read, [chapterId]: true });

    if (newTab) {
      window.open(chapterUrl, "_blank", "noreferrer");
    } else {
      setTimeout(() => navigate(chapterUrl), 0);
    }
  };

  return { openLocalURL, openToonkorURL };
};

export default useOpenURL;
