import { useState, useEffect, useContext } from 'react';
import { ManhwaCardsGrid } from '@/components/ManhwaCardsGrid/ManhwaCardsGrid';
import ManhwaData from '@/types/manhwaData';
import { useFetch } from '@mantine/hooks';
import { Center, Loader, Text } from '@mantine/core';
import { NavBar } from '@/components/NavBar/NavBar';
import { SettingsContext } from '@/contexts/SettingsContext';


const Library = () => {
  // Fetching the data using useFetch
  const { data, loading, error } = useFetch<ManhwaData[]>(
    '/api/library'
  );
  const [manhwaList, setManhwaList] = useState<ManhwaData[]>([]);
  document.title = "Library";
  const {displayEnglish} = useContext(SettingsContext);

  // Update manhwaList when data is fetched
  useEffect(() => {
    if (data) {
      setManhwaList(data);
    }
  }, [data]);

  // Handling search input changes
  const onSearchChange = (value: string) => {
    if (data) {
      const title = displayEnglish ? 'en_title' : 'title';
      const filtered = data.filter((manhwa) =>
        manhwa[title].toLowerCase().includes(value.toLowerCase())
      );
      setManhwaList(filtered);
    }
  };

  return (
    <>
      <NavBar
        showSearchBar={true}
        searchPlaceHolder='Filter by title'
        onSearchChange={onSearchChange}
      />
      {loading && <Center><Loader color="blue" /></Center>}
      {error && <Text color="red">{error.message}</Text>}
      {manhwaList && <ManhwaCardsGrid data={manhwaList} />}
    </>
  );
};

export default Library;
