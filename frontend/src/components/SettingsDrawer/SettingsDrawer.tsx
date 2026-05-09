import { useContext, useEffect, useState } from 'react';
import {
  ActionIcon,
  Button,
  Divider,
  Drawer,
  Group,
  NumberInput,
  Space,
  Stack,
  Switch,
  Text,
  Textarea,
} from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { SettingsContext } from '@/contexts/SettingsContext';
import classes from '@/components/SettingsDrawer/SettingsDrawer.module.css';

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
    curlCommand,
    setCurlCommand,
    setToonkorUrl,
    translationPageLimit,
    setTranslationPageLimit,
  } = useContext(SettingsContext);

  const [loading, setLoading] = useState<boolean>(false);
  const [formData, setFormData] = useState<{
    curl_command: string;
    translation_page_limit: number;
  }>({ curl_command: curlCommand, translation_page_limit: translationPageLimit });
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [success, setSuccess] = useState<boolean>(false);

  useEffect(() => {
    setFormData({
      curl_command: curlCommand,
      translation_page_limit: translationPageLimit,
    });
  }
  , [curlCommand, translationPageLimit]);

  const handleFormSubmit = async (e: React.ChangeEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error(`Response status: ${response.status}`);
      }

      const json = await response.json();
      if (json.error) {
        throw new Error(json.error);
      }
      setToonkorUrl(json.toonkor_url);
      setCurlCommand(json.curl_command);
      setTranslationPageLimit(json.translation_page_limit);
      setSuccess(true);
    } catch (error: any) {
      setErrorMessage(error.message);
      setSuccess(false);
    } finally {
      setLoading(false);
    }
  };

  const handleCurlCommandChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    if (!e.target.value) {
      setErrorMessage('Curl command cannot be empty');
      setSuccess(false);
      return;
    }
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setErrorMessage('');
    setSuccess(false);
  };

  const handlePageLimitChange = (value: number | string) => {
    if (typeof value === 'string') {
      value = parseInt(value);
    }
    if (isNaN(value)) {
      setErrorMessage('Please enter a valid number');
      setSuccess(false);
      return;
    }
    if (value < 1 || value > 999) {
      setErrorMessage('Page limit must be between 1 and 999');
      setSuccess(false);
      return;
    }
    setFormData({ ...formData, translation_page_limit: value });
    setErrorMessage('');
    setSuccess(false);
  }
 
  return (
    <Drawer
      opened={settingsOpened}
      onClose={closeSettings}
      position="right"
      withCloseButton={false}
    >
      <div className={classes.stack}>
        <Group justify="space-between">
          <h1 className={classes.title}>Settings</h1>
          <ActionIcon
            className={classes.closeButton}
            onClick={closeSettings}
            variant="default"
            size="lg"
            radius="lg"
          >
            <IconX />
          </ActionIcon>
        </Group>
        <h3 className={classes.subTitle}>Personalisation</h3>
        <Stack mt="sm" gap="sm">
          <Switch
            label="Dark Mode"
            labelPosition="left"
            checked={colorScheme === 'dark'}
            onChange={(event) => setColorScheme(event.currentTarget.checked ? 'dark' : 'light')}
            classNames={{ track: classes.track }}
          />
          <Switch
            label="Display Manhwa Details in English"
            labelPosition="left"
            checked={displayEnglish}
            onChange={(event) => setDisplayEnglish(event.currentTarget.checked)}
            classNames={{ track: classes.track }}
          />
        </Stack>
        <Divider mt="xl" />
        <h3 className={classes.subTitle}>Toonkor</h3>
        <form onSubmit={handleFormSubmit}>
          <Textarea
            name="curl_command"
            placeholder="Set curl command"
            value={curlCommand}
            onChange={handleCurlCommandChange}
            disabled={loading}
            className={classes.input}
            resize="vertical"
            label="Curl Command"
          />
          <h3 className={classes.subTitle}>Translation</h3>
          <NumberInput
            name="translation_page_limit"
            defaultValue={translationPageLimit}
            label="Page Per minute limit"
            min={1}
            max={999}
            onChange={handlePageLimitChange}
            disabled={loading}
          />
          <Space h="lg" />
          <Button type="submit" loading={loading} loaderProps={{ type: 'dots' }} w={'100%'} disabled={errorMessage !== ''}>
            {loading ? 'Loading' : 'Save'}
          </Button>
        </form>
        {success && <Text c="green">Settings saved successfully</Text>}
        {errorMessage && <Text c="red">{errorMessage}</Text>}
      </div>
    </Drawer>
  );
};

export default SettingsDrawer;
