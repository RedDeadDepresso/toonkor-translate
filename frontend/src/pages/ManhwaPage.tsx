import { useParams } from "react-router-dom";
import { useContext, useEffect, useState } from "react";
import { Center, Loader, SimpleGrid, Text } from "@mantine/core";
import { ManhwaHeader } from "@/components/ManhwaHeader/ManhwaHeader";
import { NavBar } from "@/components/NavBar/NavBar";
import ChaptersTable from "@/components/ChaptersTable/ChaptersTable";
import { SettingsContext } from "@/contexts/SettingsContext";
import { GetManhwa } from "../../bindings/toonkor-translate/backend/backend";
import { Manhwa } from "../../bindings/toonkor-translate/backend/models/models";

const ManhwaPage = () => {
  const { toonkorId } = useParams<string>();
  const [manhwaData, setManhwaData] = useState<Manhwa>();
  const { displayEnglish } = useContext(SettingsContext);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchManhwa = async () => {
    if (!toonkorId) return;
    setLoading(true);
    try {
      const manhwa = await GetManhwa(toonkorId);
      if (manhwa) {
        setManhwaData(manhwa);
        setLoading(false);
      }
    } catch (e) {
      setError(error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchManhwa();
  }, []);

  useEffect(() => {
    if (manhwaData) {
      document.title =
        displayEnglish && manhwaData.enTitle
          ? manhwaData.enTitle
          : manhwaData.title;
    }
  }, [manhwaData, displayEnglish]);

  return (
    <>
      <NavBar showSearchBar={false} />
      {loading && (
        <Center>
          <Loader color="blue" />
        </Center>
      )}
      {error && <Text c="red">{error.message}</Text>}
      <SimpleGrid cols={{ base: 1, md: 2 }} px="2rem">
        {manhwaData && <ManhwaHeader manhwaData={manhwaData} />}
        {manhwaData && (
          <ChaptersTable toonkorId={toonkorId} initialChapters={manhwaData.chapters} />
        )}
      </SimpleGrid>
    </>
  );
};

export default ManhwaPage;
