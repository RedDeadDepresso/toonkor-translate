import cx from 'clsx';
import { useState, useEffect, useContext } from 'react';
import {
  Table,
  Checkbox,
  ScrollArea,
  Group,
  Text,
  rem,
  ActionIcon,
  Tooltip,
  Popover,
  Button,
  Center,
} from '@mantine/core';
import classes from './ChaptersTable.module.css';
import ChapterData from '@/types/chapterData';
import { IconDownload, IconFilter, IconLanguage, IconTrash, IconWorld } from '@tabler/icons-react';
import { SettingsContext } from '@/contexts/SettingsContext';
import useOpenURL from '@/hooks/useOpenURL';

interface ChaptersTableProps {
  toonkorId: string | undefined;
  chapterDataList: ChapterData[];
}

const ChaptersTable = ({ toonkorId, chapterDataList = [] }: ChaptersTableProps) => {
  const [chapters, setChapters] = useState<ChapterData[]>(chapterDataList);
  const [selection, setSelection] = useState<ChapterData[]>([]);
  const [socket, setSocket] = useState<WebSocket | null>(null);
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
    const ws = new WebSocket(`ws://127.0.0.1:8000/ws/download_translate/${toonkorId}/`);
    setSocket(ws);

    ws.onopen = () => console.log('Connected to Django server');
    ws.onmessage = handleWebSocketMessage;
    ws.onerror = (e) => console.error('WebSocket error:', e);
    ws.onclose = (e) => {
      console.log(e.wasClean ? 'WebSocket closed cleanly' : 'WebSocket closed unexpectedly:', e);
    };

    return () => ws.close();
  }, [toonkorId]);

  useEffect(() => {
    applyFilters();
  }, [filters]);

  const handleWebSocketMessage = (e: MessageEvent) => {
    const { chapters: updatedChapters } = JSON.parse(e.data);
    console.log(updatedChapters);
    for (const chapter of updatedChapters) {
      const chapterIndex = chapter.index;
      chapterDataList[chapterIndex].download_status = chapter.download_status;
      chapterDataList[chapterIndex].translation_status = chapter.translation_status;
    }

    const updatedChapterList = [...chapterDataList];
    setChapters(updatedChapterList);
  };

  const applyFilters = () => {
    if (filters.downloaded && filters.translated) {
      setChapters(chapterDataList.filter((chapter) => chapter.download_status === 'READY' && chapter.translation_status === 'READY'));
    }
    else if (!filters.downloaded && !filters.translated) {
      setChapters(chapterDataList);
    }
    else if (filters.downloaded) {
      setChapters(chapterDataList.filter((chapter) => chapter.download_status === 'READY'));
    }
    else if (filters.translated) {
      setChapters(chapterDataList.filter((chapter) => chapter.translation_status === 'READY'));
    }
  };

  const toggleRow = (chapter: ChapterData) => {
    setSelection((prevSelection) =>
      prevSelection.includes(chapter)
        ? prevSelection.filter((item) => item.index !== chapter.index)
        : [...prevSelection, chapter]
    );
  };

  const toggleAll = () => {
    setSelection(selection.length === chapters.length ? [] : [...chapters]);
  };

  const sendSelection = (task: 'download' | 'download_translate' | 'remove') => {
    if (selection.length === 0) return;
    
    const filteredSelection = task === "remove" ? removeSelection() : selection;
    if (socket) {
      socket.send(
        JSON.stringify({
          task: task,
          toonkor_id: `/${toonkorId}`,
          chapters: filteredSelection,
          remove_choices: removeChoices
        })
      );
    }
  }

  const removeSelection = () => {
    if (removeChoices.downloaded && removeChoices.translated) {
      return selection.filter(selected => selected.download_status !== 'LOADING' || selected.translation_status !== 'LOADING');
    }
    else if (removeChoices.downloaded) {
      return selection.filter(selected => selected.download_status !== 'LOADING');
    }
    else if (removeChoices.downloaded) {
      return selection.filter(selected => selected.translation_status !== 'LOADING');
    }
  }

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
            <Text size="sm" fw={500} c={read[chapter.toonkor_id] ? 'blue' : undefined}>
              {chapter.index + 1}
            </Text>
          </Group>
        </Table.Td>
        <Table.Td>{chapter.date_upload}</Table.Td>
        <Table.Td>
          <Group>
            <Tooltip label="View on Toonkor">
              <ActionIcon
                onClick={(event) => {
                  event.stopPropagation();
                  openToonkorURL(chapter.toonkor_id, true)}}
              >
                <IconWorld size={18} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="View Downloaded">
              <ActionIcon
                variant="light"
                disabled={chapter.download_status === 'NOT_READY' || chapter.download_status === 'REMOVING'}
                loading={chapter.download_status === 'LOADING' || chapter.download_status === 'REMOVING'}
                color={chapter.download_status === "REMOVING" ? 'red' : undefined}
                onClick={(event) => {
                  event.stopPropagation();
                  openLocalURL(chapter.toonkor_id, 'downloaded', false);
                }}
              >
                <IconDownload size={18} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="View Translated">
              <ActionIcon
                variant="outline"
                disabled={chapter.translation_status === 'NOT_READY' || chapter.translation_status === 'REMOVING'}
                loading={chapter.translation_status === 'LOADING' || chapter.translation_status === 'REMOVING'}
                color={chapter.translation_status === "REMOVING" ? 'red' : undefined}
                onClick={(event) => {
                  event.stopPropagation();
                  openLocalURL(chapter.toonkor_id, 'translated', false);
                }}
              >
                <IconLanguage size={18} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Table.Td>
      </Table.Tr>
    );
  }

  return (
    <div>
      <Group justify="end">
        <Tooltip label="Download">
          <ActionIcon variant="default" onClick={() => sendSelection("download")}>
            <IconDownload />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Download & Translate">
          <ActionIcon variant="default" onClick={() => sendSelection("download_translate")}>
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
                setRemoveChoices({ ...removeChoices, downloaded: event.currentTarget.checked })
              }
            />
            <Checkbox
              my="sm"
              label="Translated"
              checked={removeChoices.translated}
              onChange={(event) =>
                setRemoveChoices({ ...removeChoices, translated: event.currentTarget.checked })
              }
            />
            <Center>
              <Button variant='filled' color='red' disabled={!removeChoices.downloaded && !removeChoices.translated} onClick={() => sendSelection("remove")}>
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
                setFilters({ ...filters, downloaded: event.currentTarget.checked })
              }
            />
            <Checkbox
              mt="sm"
              label="Translated"
              checked={filters.translated}
              onChange={(event) =>
                setFilters({ ...filters, translated: event.currentTarget.checked })
              }
            />
          </Popover.Dropdown>
        </Popover>
      </Group>
      <ScrollArea h={rem(750)}>
        <Table highlightOnHover verticalSpacing="sm" stickyHeader>
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ width: rem(40) }}>
                <Checkbox
                  onChange={toggleAll}
                  checked={selection.length === chapters.length}
                  indeterminate={selection.length > 0 && selection.length !== chapters.length}
                />
              </Table.Th>
              <Table.Th>Chapter</Table.Th>
              <Table.Th>Date</Table.Th>
              <Table.Th>Links</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>{rows}</Table.Tbody>
        </Table>
      </ScrollArea>
    </div>
  );
};

export default ChaptersTable;
