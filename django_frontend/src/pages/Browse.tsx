import { useState } from 'react';
import { Loader, Stack, Text, Title } from '@mantine/core';
import { useIsFirstRender } from '@mantine/hooks';
import { ManhwaCardsGrid } from '@/components/ManhwaCardsGrid/ManhwaCardsGrid';
import ManhwaData from '@/types/manhwaData';
import { NavBar } from '@/components/NavBar/NavBar';

const Browse = () => {
  const firstRender = useIsFirstRender();
  const [manhwaList, setManhwaList] = useState<ManhwaData[]>([]);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  document.title = 'Browse';

  const onSearchChange = async (searchQuery: string) => {
    if (!searchQuery) {
      return;
    }
    setLoading(true);
    errorMessage && setErrorMessage('');
    const url = `/api/browse?query=${searchQuery}`;
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
      <NavBar
        showSearchBar
        searchPlaceHolder="Search, Enter Toonkor or Mangadex URL"
        onSearchChange={onSearchChange}
        delaySearchChange={1000}
      />
      <Stack px="2rem">
        {loading && <Loader m="auto" color="blue" />}
        {!loading && manhwaList && <ManhwaCardsGrid data={manhwaList} />}
        {errorMessage && <Text c="red">{errorMessage}</Text>}
        {!firstRender && !loading && !manhwaList.length && (
          <Stack justify="center" align="center" px="2rem">
            <Title size={64}>¯\_(ツ)_/¯</Title>
            <Text>No results were found</Text>
          </Stack>
        )}
      </Stack>
    </>
  );
};

export default Browse;
