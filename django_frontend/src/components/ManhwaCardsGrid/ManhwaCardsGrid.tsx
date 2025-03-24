import { SimpleGrid, Card, Image, Text, AspectRatio } from '@mantine/core';
import classes from './ManhwaCardsGrid.module.css';
import ManhwaData from '@/types/manhwaData';
import { useNavigate } from 'react-router-dom';
import { SettingsContext } from '@/contexts/SettingsContext';
import { useContext } from 'react';


interface ManhwaCardsGridProps {
  data: ManhwaData[]
}

export function ManhwaCardsGrid({ data }: ManhwaCardsGridProps) {
  const navigate = useNavigate();
  const {displayEnglish} = useContext(SettingsContext);

  data.sort((a, b) => {
    if (displayEnglish) {
      return a.en_title.localeCompare(b.en_title);
    } else {
      return a.title.localeCompare(b.title);
    }
  });

  const cards = data.map((manhwaData) => (
    <Card key={manhwaData.title} p="md" radius="md" component="a" href={`/manhwa${manhwaData.toonkor_id}`}
    onClick={(event) => {event.preventDefault(); navigate(`/manhwa${manhwaData.toonkor_id}`)}}
    className={classes.card}>
      <AspectRatio ratio={1920 / 1080}>
        <Image src={manhwaData.thumbnail} />
      </AspectRatio>
      <Text className={classes.title} mx={5} ta="center">
        {displayEnglish && manhwaData.en_title ? manhwaData.en_title : manhwaData.title}
      </Text>
    </Card>
  ));

  return (
    <SimpleGrid cols={{ base: 1, md: 4 }}>{cards}</SimpleGrid>
  );
}
