import { useFetch, useWindowScroll } from '@mantine/hooks';
import { useParams } from 'react-router-dom'
import { Stack, Text, Loader, ActionIcon, Title, Group, Button, Anchor } from '@mantine/core';
import { IconChevronUp } from '@tabler/icons-react';
import classes from '@/pages/Chapter.module.css'
import { NavBar } from '@/components/NavBar/NavBar';
import MenuLink from '@/components/MenuLinks/MenuLinks';
import ChapterData from '@/types/chapterData';
import PaginationData from '@/types/paginationData';
import { useContext } from 'react';
import { SettingsContext } from '@/contexts/SettingsContext';
import { Link } from 'react-router-dom';

const displayTitle = (data: PaginationData, displayEnglish: boolean) => {
  const title = displayEnglish && data.manhwa_en_title ? data.manhwa_en_title : data.manhwa_title;
  document.title = title
  return (
  <>
  <Title mx="auto">
    {title} Chapter {data.current_chapter.index + 1}
  </Title>
  <Text mx="auto">
    All chapters are in <Link to={`/manhwa${data.manhwa_id}`}>{title}</Link>
  </Text>
  </>
  )
}

const paginationButton = (buttonText: string, chapterData: ChapterData) => {
  if (!chapterData) {
    return (<Button disabled={true} radius="xl">{buttonText}</Button>)
  }
  else {
    return (<MenuLink chapter={chapterData} position="bottom" newTab={false}>
              <Button radius="xl">{buttonText}</Button>
            </MenuLink>)
  }
}

const paginationButtonGroup = (paginationData: PaginationData) => {
  const {prev_chapter, current_chapter, next_chapter} = paginationData;
  return (
  <Group justify='space-between' my="md">
  {paginationButton('< Prev', prev_chapter)}
  {paginationButton('Current', current_chapter)}
  {paginationButton('Next >', next_chapter)}
  </Group>
  )
}

const pages = (pages: string[]) => {
  return pages.map((pagePath: string) => (<img src={pagePath} key={pagePath} className={classes.images}/>))
}

const Chapter = () => {
    const {toonkorId, choice} = useParams();
    const {data, loading, error} = useFetch<PaginationData>(`/api/chapter?toonkor_id=/${toonkorId}&choice=${choice}`);
    const [scroll, scrollTo] = useWindowScroll();
    const {displayEnglish} = useContext(SettingsContext);

    return (
        <>
        <NavBar showSearchBar={false}/>
        {!loading && data && displayTitle(data, displayEnglish)}
        {loading && <Loader m="auto" color='blue'/>}
        <Stack mx="auto" gap={0}>
          {!loading && data && paginationButtonGroup(data)}
            {!loading && error && <Text c="red">{error.message}</Text>}
            {!loading && data && pages(data.pages)}
            {scroll.y !== 0 && <ActionIcon size="lg" radius="lg" className={classes.anchor} onClick={() => scrollTo({ y: 0 })}>
                <IconChevronUp />
            </ActionIcon>}
          {!loading && data && paginationButtonGroup(data)}
        </Stack>
        </>
    )
}

export default Chapter