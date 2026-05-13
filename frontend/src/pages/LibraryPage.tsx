import { useState, useEffect, useContext } from "react";
import { Center, Loader, Text } from "@mantine/core";
import { ManhwaCardsGrid } from "@/components/ManhwaCardsGrid/ManhwaCardsGrid";
import { NavBar } from "@/components/NavBar/NavBar";
import { SettingsContext } from "@/contexts/SettingsContext";
import { Manhwa } from "../../bindings/toonkor-translate/backend/models";
import { Library } from "../../bindings/toonkor-translate/backend/backend";

const LibraryPage = () => {
  const [loading, setLoading] = useState(true);
  const [allManhwa, setAllManhwa] = useState<Manhwa[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [filteredList, setFilteredList] = useState<Manhwa[]>([]);
  const { displayEnglish } = useContext(SettingsContext);

  const fetchData = async () => {
    try {
      const data = await Library();
      if (data) {
        setAllManhwa(data);
        setFilteredList(data);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      console.error("Failed to fetch library:", err);
    } finally {
      setLoading(false);
    }
  };

  // 1. Fetch data on mount
  useEffect(() => {
    document.title = "Library";

    fetchData();
  }, []);

  // 2. Handling search input changes
  const onSearchChange = (value: string) => {
    if (!value) {
      setFilteredList(allManhwa);
      return;
    }

    const filtered = allManhwa.filter((manhwa) => {
      const title = displayEnglish ? manhwa.enTitle : manhwa.title;
      return title.toLowerCase().includes(value.toLowerCase());
    });

    setFilteredList(filtered);
  };

  return (
    <>
      <NavBar
        showSearchBar
        searchPlaceHolder="Filter by title"
        onSearchChange={onSearchChange}
      />

      {loading && (
        <Center>
          <Loader color="blue" />
        </Center>
      )}
      {error && <Text color="red">{error.message}</Text>}
      {filteredList && <ManhwaCardsGrid data={filteredList} />}
    </>
  );
};

export default LibraryPage;
