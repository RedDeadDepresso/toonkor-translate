import { useContext, useEffect, useState } from 'react';
import { SettingsContext } from '@/contexts/SettingsContext';
import { ActionIcon, Button, Drawer, Group, Stack, Switch, Text, TextInput } from '@mantine/core';
import classes from '@/components/SettingsDrawer/SettingsDrawer.module.css';
import { IconX } from '@tabler/icons-react';
interface SettingsDrawerProps {
  settingsOpened: boolean;
  closeSettings: () => void;
}

const SettingsDrawer = ({ settingsOpened, closeSettings }: SettingsDrawerProps) => {
  const {
    displayEnglish,
    setDisplayEnglish,
    colorScheme,
    setColorScheme,
    toonkorUrl,
    setToonkorUrl,
    autoFetchToonkorUrl,
    setAutoFetchToonkorUrl,
  } = useContext(SettingsContext);

  const [loading, setLoading] = useState<boolean>(false);
  const [inputUrl, setInputUrl] = useState<string>(toonkorUrl);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [success, setSuccess] = useState<boolean>(false);

  useEffect(() => {
    setInputUrl(toonkorUrl);
  }, [toonkorUrl]);

  const submitToonkorUrl = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/set_toonkor_url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: inputUrl }),
      });

      if (!response.ok) {
        throw new Error(`Response status: ${response.status}`);
      }

      const json = await response.json();
      if (json.error) {
        throw new Error(json.error);
      }

      setToonkorUrl(inputUrl);
      setSuccess(true);
    } catch (error: any) {
      setErrorMessage(error.message);
      setSuccess(false);
    } finally {
      setLoading(false);
    }
  };

  const handleInputUrlChange = (input: string) => {
    setInputUrl(input);
    setErrorMessage('');
    setSuccess(false);
  };

  return (
    <Drawer
      opened={settingsOpened}
      onClose={closeSettings}
      position="right"
      withCloseButton={false}
    > 
    <div className={classes.stack}>
      <Group justify='space-between'>
      <h1 className={classes.title}>Settings</h1>
      <ActionIcon className={classes.closeButton} onClick={closeSettings} variant='default' size="lg" radius="lg">
        <IconX/>
      </ActionIcon>
      </Group>
      <h3 className={classes.subTitle}>Personalisation</h3>
      <Stack mt="sm" gap="sm">
        <Switch
          label="Dark Mode"
          labelPosition="left"
          checked={colorScheme === 'dark'}
          onChange={(event) => setColorScheme(event.currentTarget.checked ? 'dark' : 'light')}
          classNames={{track: classes.track}}
        />
        <Switch
          label="Display Manhwa Details in English"
          labelPosition="left"
          checked={displayEnglish}
          onChange={(event) => setDisplayEnglish(event.currentTarget.checked)}
          classNames={{track: classes.track}}
        />
      </Stack>
      <h3 className={classes.subTitle}>Toonkor</h3>
      <Stack mt="sm" gap="sm">
      <Switch
        label="Auto-fetch Toonkor URL"
        labelPosition="left"
        checked={autoFetchToonkorUrl}
        onChange={(event) => setAutoFetchToonkorUrl(event.currentTarget.checked)}
        classNames={{track: classes.track}}
      />
      <Group justify='space-between'>
        <TextInput
          placeholder="Set Toonkor URL"
          value={inputUrl}
          onChange={(event) => handleInputUrlChange(event.currentTarget.value)}
          disabled={loading}
          className={classes.input}
        />
        <Button onClick={submitToonkorUrl} loading={loading} loaderProps={{ type: 'dots' }}>
          {loading ? 'Loading' : 'Save'}
        </Button>
        {success && <Text c="green">URL saved successfully</Text>}
        {errorMessage && <Text c="red">{errorMessage}</Text>}
      </Group>
      </Stack>
    </div>
    </Drawer>
  );
};

export default SettingsDrawer;
