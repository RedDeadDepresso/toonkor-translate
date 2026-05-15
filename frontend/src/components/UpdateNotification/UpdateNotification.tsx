import { useEffect, useState } from 'react';
import { Button, Group, Modal, Progress, Stack, Text } from '@mantine/core';
import { CheckForUpdate, DownloadAndInstallUpdate } from '../../../bindings/toonkor-translate/backend/backend';
import { Events } from "@wailsio/runtime";

interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  newVersion: string;
  releaseNotes: string;
}

export function UpdateNotification() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    CheckForUpdate()
      .then((info) => {
        if (info && info.available) {
          setUpdateInfo(info as UpdateInfo);
        }
      })
      .catch(() => {
        // Silently ignore — no internet or no releases yet
      });

    const unsub = Events.On('update:progress', (ev) => {
      setProgress(ev.data);
    });

    return () => {
      unsub();
    };
  }, []);

  const handleInstall = async () => {
    setInstalling(true);
    setError('');
    try {
      await DownloadAndInstallUpdate();
    } catch (err: any) {
      setError(err.message ?? 'Update failed');
      setInstalling(false);
    }
  };

  if (!updateInfo) return null;

  return (
    <Modal
      opened={true}
      onClose={() => setUpdateInfo(null)}
      title={`Update available — ${updateInfo.newVersion}`}
      closeOnClickOutside={!installing}
      closeOnEscape={!installing}
      withCloseButton={!installing}
      centered
    >
      <Stack gap="sm">
        <Text size="sm" c="dimmed">Current version: {updateInfo.currentVersion}</Text>

        {updateInfo.releaseNotes && (
          <Text
            size="sm"
            style={{ whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto' }}
          >
            {updateInfo.releaseNotes}
          </Text>
        )}

        {installing && (
          <Stack gap={4}>
            <Text size="sm">{progress < 100 ? `Downloading… ${progress}%` : 'Installing…'}</Text>
            <Progress value={progress} animated size="sm" />
          </Stack>
        )}

        {error && <Text c="red" size="sm">{error}</Text>}

        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={() => setUpdateInfo(null)} disabled={installing}>
            Later
          </Button>
          <Button onClick={handleInstall} loading={installing}>
            Install update
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}