import cx from "clsx";
import { useState, useEffect, useContext, useRef } from "react";
import {
  Table,
  Checkbox,
  Group,
  Text,
  rem,
  ActionIcon,
  Tooltip,
  Popover,
  Button,
  Center,
} from "@mantine/core";
import {
  IconDownload,
  IconFilter,
  IconLanguage,
  IconTrash,
  IconWorld,
} from "@tabler/icons-react";
import classes from "./ChaptersTable.module.css";
import { SettingsContext } from "@/contexts/SettingsContext";
import useOpenURL from "@/hooks/useOpenURL";
import {
  Chapter,
  Status,
} from "../../../bindings/toonkor-translate/backend/models/models";
import {
  DeleteChapters,
  DownloadChapters,
} from "../../../bindings/toonkor-translate/backend/backend";
import { Events } from "@wailsio/runtime";

interface ChaptersTableProps {
  toonkorId: string | undefined;
  initialChapters: Chapter[];
}

const ChaptersTable = ({
  toonkorId = "",
  initialChapters = [],
}: ChaptersTableProps) => {
  // allChapters holds the complete unfiltered list at all times.
  const allChapters = useRef<Chapter[]>(initialChapters);
  const [chapters, setChapters] = useState<Chapter[]>(initialChapters);
  const [selection, setSelection] = useState<Chapter[]>([]);
  const [filters, setFilters] = useState({
    downloaded: false,
    translated: false,
  });
  const [removeChoices, setRemoveChoices] = useState({
    downloaded: false,
    translated: false,
  });
  const { read } = useContext(SettingsContext);
  const { openLocalURL, openToonkorURL } = useOpenURL();

  useEffect(() => {
    const unsubscribe = Events.On(toonkorId, (event) => {
      const incomingChapter = event.data;
      const chapterIndex = incomingChapter.index;

      // Update the source-of-truth ref.
      if (allChapters.current[chapterIndex]) {
        allChapters.current = allChapters.current.map((ch, i) =>
          i === chapterIndex
            ? { ...ch, downloadStatus: incomingChapter.downloadStatus, translationStatus: incomingChapter.translationStatus }
            : ch
        );
      }

      // Re-apply the current filters against the updated full list.
      setChapters(applyFiltersTo(allChapters.current, filters));
    });

    return () => unsubscribe();
  }, [toonkorId, filters]);

  useEffect(() => {
    setChapters(applyFiltersTo(allChapters.current, filters));
  }, [filters]);

  const applyFiltersTo = (
    source: Chapter[],
    f: { downloaded: boolean; translated: boolean }
  ): Chapter[] => {
    if (f.downloaded && f.translated) {
      return source.filter(
        (ch) =>
          ch.downloadStatus === Status.Ready &&
          ch.translationStatus === Status.Ready
      );
    }
    if (f.downloaded) {
      return source.filter((ch) => ch.downloadStatus === Status.Ready);
    }
    if (f.translated) {
      return source.filter((ch) => ch.translationStatus === Status.Ready);
    }
    return source;
  };

  const toggleRow = (chapter: Chapter) => {
    setSelection((prevSelection) =>
      prevSelection.includes(chapter)
        ? prevSelection.filter((item) => item.index !== chapter.index)
        : [...prevSelection, chapter]
    );
  };

  const toggleAll = () => {
    setSelection(selection.length === chapters.length ? [] : [...chapters]);
  };

  const updateChapters = (updatedChapters: Chapter[]) => {
    for (const chapter of updatedChapters) {
      const idx = chapter.index;
      if (allChapters.current[idx]) {
        allChapters.current = allChapters.current.map((ch, i) =>
          i === idx
            ? { ...ch, downloadStatus: chapter.downloadStatus, translationStatus: chapter.translationStatus }
            : ch
        );
      }
    }
    setChapters(applyFiltersTo(allChapters.current, filters));
  };

  const submitDownloadChapters = async (translate: boolean = false) => {
    const [updatedChapters, success] = await DownloadChapters(
      selection,
      translate,
    );
    if (success) updateChapters(updatedChapters);
  };

  const submitRemoveChapters = async () => {
    const removeSelection = getRemoveSelection();
    if (!removeSelection) return;
    const [updatedChapters, success] = await DeleteChapters(
      removeSelection,
      removeChoices.downloaded,
      removeChoices.translated,
    );
    if (success) updateChapters(updatedChapters);
  };

  const getRemoveSelection = () => {
    if (removeChoices.downloaded && removeChoices.translated) {
      return selection.filter(
        (selected) =>
          selected.downloadStatus === Status.Ready ||
          selected.translationStatus === Status.Ready,
      );
    }
    if (removeChoices.downloaded) {
      return selection.filter(
        (selected) => selected.downloadStatus === Status.Ready,
      );
    }
    if (removeChoices.translated) {
      return selection.filter(
        (selected) => selected.translationStatus === Status.Ready,
      );
    }
    return [];
  };

  const rows = [];
  for (let i = chapters.length - 1; i >= 0; i--) {
    const chapter = chapters[i];
    const selected = selection.some((item) => item.index === chapter.index);

    rows.push(
      <Table.Tr
        key={chapter.index}
        className={cx({ [classes.rowSelected]: selected })}
        onClick={() => {
          toggleRow(chapter);
        }}
      >
        <Table.Td>
          <Checkbox checked={selected} onChange={() => toggleRow(chapter)} />
        </Table.Td>
        <Table.Td>
          <Group gap="sm">
            <Text
              size="sm"
              fw={500}
              c={read[chapter.toonkorId] ? "blue" : undefined}
            >
              {chapter.index + 1}
            </Text>
          </Group>
        </Table.Td>
        <Table.Td>{chapter.uploadedDate}</Table.Td>
        <Table.Td>
          <Group>
            <Tooltip label="View on Toonkor">
              <ActionIcon
                onClick={(event) => {
                  event.stopPropagation();
                  openToonkorURL(chapter.toonkorId, true);
                }}
              >
                <IconWorld size={18} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="View Downloaded">
              <ActionIcon
                variant="light"
                disabled={
                  chapter.downloadStatus === Status.NotReady ||
                  chapter.downloadStatus === Status.Removing
                }
                loading={
                  chapter.downloadStatus === Status.Loading ||
                  chapter.downloadStatus === Status.Removing
                }
                color={
                  chapter.downloadStatus === Status.Removing ? "red" : undefined
                }
                onClick={(event) => {
                  event.stopPropagation();
                  openLocalURL(chapter.toonkorId, "downloaded", false);
                }}
              >
                <IconDownload size={18} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="View Translated">
              <ActionIcon
                variant="outline"
                disabled={
                  chapter.translationStatus === Status.NotReady ||
                  chapter.translationStatus === Status.Removing
                }
                loading={
                  chapter.translationStatus === Status.Loading ||
                  chapter.translationStatus === Status.Removing
                }
                color={
                  chapter.translationStatus === Status.Removing
                    ? "red"
                    : undefined
                }
                onClick={(event) => {
                  event.stopPropagation();
                  openLocalURL(chapter.toonkorId, "translated", false);
                }}
              >
                <IconLanguage size={18} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Table.Td>
      </Table.Tr>,
    );
  }

  return (
    <div>
      <Group justify="end">
        <Tooltip label="Download">
          <ActionIcon
            variant="default"
            onClick={() => submitDownloadChapters(false)}
          >
            <IconDownload />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Download & Translate">
          <ActionIcon
            variant="default"
            onClick={() => submitDownloadChapters(true)}
          >
            <IconLanguage />
          </ActionIcon>
        </Tooltip>
        <Popover trapFocus position="bottom" withArrow shadow="md">
          <Popover.Target>
            <Tooltip label="Remove">
              <ActionIcon variant="default">
                <IconTrash />
              </ActionIcon>
            </Tooltip>
          </Popover.Target>
          <Popover.Dropdown>
            <Checkbox
              label="Downloaded"
              checked={removeChoices.downloaded}
              onChange={(event) =>
                setRemoveChoices({
                  ...removeChoices,
                  downloaded: event.currentTarget.checked,
                })
              }
            />
            <Checkbox
              my="sm"
              label="Translated"
              checked={removeChoices.translated}
              onChange={(event) =>
                setRemoveChoices({
                  ...removeChoices,
                  translated: event.currentTarget.checked,
                })
              }
            />
            <Center>
              <Button
                variant="filled"
                color="red"
                disabled={
                  !removeChoices.downloaded && !removeChoices.translated
                }
                onClick={submitRemoveChapters}
              >
                Remove
              </Button>
            </Center>
          </Popover.Dropdown>
        </Popover>
        <Popover trapFocus position="bottom" withArrow shadow="md">
          <Popover.Target>
            <Tooltip label="Filter">
              <ActionIcon variant="default">
                <IconFilter />
              </ActionIcon>
            </Tooltip>
          </Popover.Target>
          <Popover.Dropdown>
            <Checkbox
              label="Downloaded"
              checked={filters.downloaded}
              onChange={(event) =>
                setFilters({
                  ...filters,
                  downloaded: event.currentTarget.checked,
                })
              }
            />
            <Checkbox
              mt="sm"
              label="Translated"
              checked={filters.translated}
              onChange={(event) =>
                setFilters({
                  ...filters,
                  translated: event.currentTarget.checked,
                })
              }
            />
          </Popover.Dropdown>
        </Popover>
      </Group>
      <div className={classes.tableContainer}>
        <Table highlightOnHover verticalSpacing="sm" stickyHeader>
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ width: rem(40) }}>
                <Checkbox
                  onChange={toggleAll}
                  checked={selection.length === chapters.length}
                  indeterminate={
                    selection.length > 0 && selection.length !== chapters.length
                  }
                />
              </Table.Th>
              <Table.Th>Chapter</Table.Th>
              <Table.Th>Date</Table.Th>
              <Table.Th>Links</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>{rows}</Table.Tbody>
        </Table>
      </div>
    </div>
  );
};

export default ChaptersTable;