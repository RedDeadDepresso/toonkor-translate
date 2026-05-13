import { SimpleGrid, Card, Image, Text, AspectRatio } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { useContext } from 'react';
import classes from './ManhwaCardsGrid.module.css';
import { SettingsContext } from '@/contexts/SettingsContext';
import { Manhwa } from '../../../bindings/toonkor-translate/backend/models/models';

interface ManhwaCardsGridProps {
  data: Manhwa[];
}

export function ManhwaCardsGrid({ data }: ManhwaCardsGridProps) {
  const navigate = useNavigate();
  const { displayEnglish } = useContext(SettingsContext);

  data.sort((a, b) => {
    if (displayEnglish) {
      return a.enTitle.localeCompare(b.enTitle);
    }
      return a.title.localeCompare(b.title);
  });

  const cards = data.map((manhwa) => (
    <Card
      key={manhwa.title}
      p="md"
      radius="md"
      component="a"
      onClick={(event) => {
        event.preventDefault();
        navigate(`/manhwa/${manhwa.toonkorId}`);
      }}
      className={classes.card}
    >
      <AspectRatio ratio={1920 / 1080}>
        <Image src={manhwa.thumbnail} />
      </AspectRatio>
      <Text className={classes.title} mx={5} ta="center">
        {displayEnglish && manhwa.enTitle ? manhwa.enTitle : manhwa.title}
      </Text>
    </Card>
  ));

  return (
    <SimpleGrid cols={{ base: 1, md: 3, lg: 4 }} px="2rem">
      {cards}
    </SimpleGrid>
  );
}
