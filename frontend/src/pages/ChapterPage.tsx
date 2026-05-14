import { useWindowScroll } from "@mantine/hooks";
import { useParams, Link } from "react-router-dom";
import {
  Stack,
  Text,
  Loader,
  ActionIcon,
  Title,
  Group,
  Button,
  rem,
} from "@mantine/core";
import { IconChevronUp } from "@tabler/icons-react";
import { useContext, useEffect, useState } from "react";
import classes from "@/pages/ChapterPage.module.css";
import { NavBar } from "@/components/NavBar/NavBar";
import MenuLink from "@/components/MenuLinks/MenuLinks";
import { SettingsContext } from "@/contexts/SettingsContext";
import {
  Chapter,
  ChapterDetails,
} from "../../bindings/toonkor-translate/backend/models/models";
import { GetChapter } from "../../bindings/toonkor-translate/backend/backend";

const displayTitle = (data: ChapterDetails, displayEnglish: boolean) => {
  const title =
    displayEnglish && data.manhwaEnTitle
      ? data.manhwaEnTitle
      : data.manhwaTitle;
  document.title = title;
  return (
    <>
      <Title mx="auto" px="md">
        {title} Chapter{" "}
        {data.currentChapter ? data.currentChapter.index + 1 : "?"}
      </Title>
      <Text mx="auto">
        All chapters are in <Link to={`/manhwa/${data.manhwaID}`}>{title}</Link>
      </Text>
    </>
  );
};

const PaginationButton = ({ label, chapter }: { label: string; chapter: Chapter | null }) => {
  if (!chapter) {
    return (
      <Button disabled radius="xl">
        {label}
      </Button>
    );
  }
  return (
    <MenuLink chapter={chapter} position="bottom" newTab={false}>
      <Button radius="xl">{label}</Button>
    </MenuLink>
  );
};

const PaginationButtonGroup = ({ chapterDetails }: { chapterDetails: ChapterDetails }) => {
  const { prevChapter, currentChapter, nextChapter } = chapterDetails;
  return (
    <Group justify="space-between" my="md">
      <PaginationButton label="< Prev" chapter={prevChapter} />
      <PaginationButton label="Current" chapter={currentChapter} />
      <PaginationButton label="Next >" chapter={nextChapter} />
    </Group>
  );
};

const pages = (pages: string[]) =>
  pages.map((pagePath: string) => (
    <img src={pagePath} key={pagePath} className={classes.images} />
  ));

const ChapterPage = () => {
  const { toonkorId, choice } = useParams();
  const [data, setData] = useState<ChapterDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [scroll, scrollTo] = useWindowScroll();
  const { displayEnglish } = useContext(SettingsContext);
  const [showNav, setShowNav] = useState(false);

  async function fetchChapterDetail() {
    if (toonkorId && choice) {
      try {
        setLoading(true);
        const chapterDetails = await GetChapter(toonkorId, choice);
        setData(chapterDetails);
        setLoading(false);
      } catch (e) {
        setError("error");
      }
    }
  }

  useEffect(() => {
    fetchChapterDetail();
  }, []);

  // Toggle navbar visibility when clicking outside buttons/anchors
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      if (!target.closest("button") && !target.closest("a")) {
        setShowNav((prev) => !prev);
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  return (
    <>
      {showNav && <NavBar showSearchBar={false} />}
      {!showNav && <div style={{ marginBottom: rem("30px") }}></div>}
      <Stack>
        {!loading && data && displayTitle(data, displayEnglish)}
        {loading && <Loader m="auto" color="blue" />}
        <Stack mx="auto" gap={0}>
          {!loading && data && <PaginationButtonGroup chapterDetails={data} />}
          {!loading && error && <Text c="red">{error}</Text>}
          {!loading && data && pages(data.pages)}
          {scroll.y !== 0 && (
            <ActionIcon
              size="lg"
              radius="lg"
              className={classes.anchor}
              onClick={() => scrollTo({ y: 0 })}
            >
              <IconChevronUp />
            </ActionIcon>
          )}
          {!loading && data && <PaginationButtonGroup chapterDetails={data} />}
        </Stack>
      </Stack>
    </>
  );
};

export default ChapterPage;