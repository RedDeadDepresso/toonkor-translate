import { useState } from 'react';
import { ManhwaCardsGrid } from '@/components/ManhwaCardsGrid/ManhwaCardsGrid';
import ManhwaData from '@/types/manhwaData';
import { Loader, Text } from '@mantine/core';
import { NavBar } from '@/components/NavBar/NavBar';
import { useIsFirstRender } from '@mantine/hooks';

const Browse = () => {
  const firstRender = useIsFirstRender();
  const [manhwaList, setManhwaList] = useState<ManhwaData[]>([]);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  document.title = "Browse";

  const onSearchChange = async (searchQuery: string) => {
    if (!searchQuery) {
      return
    }
    setLoading(true);
    errorMessage && setErrorMessage('');
    const url = `/api/browse/search?query=${searchQuery}`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        setErrorMessage(`Response status: ${response.status}`);
      }
      const json = await response.json();
      setManhwaList(json);
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('An unknown error occurred.');
      }
    }
    setLoading(false);
  };

  return (
    <>
      <NavBar showSearchBar={true} searchPlaceHolder="Search, Enter Toonkor or Mangadex URL" onSearchChange={onSearchChange} delaySearchChange={1000}/>
      {loading && <Loader m="auto" color='blue'/>}
      {!loading && manhwaList && <ManhwaCardsGrid data={manhwaList} />}
      {errorMessage && <Text c="red">{errorMessage}</Text>}
      {!firstRender && !loading && !manhwaList.length && <Text m="auto">No results were found</Text>}
    </>
  );
};

export default Browse;
