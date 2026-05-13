import { useContext, useEffect, useState } from "react";
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
  TextInput,
} from "@mantine/core";
import { IconX } from "@tabler/icons-react";
import { SettingsContext } from "@/contexts/SettingsContext";
import classes from "@/components/SettingsDrawer/SettingsDrawer.module.css";
import {
  SelectKoharuPath,
  SetSettings,
} from "../../../bindings/toonkor-translate/backend/backend";

interface SettingsDrawerProps {
  settingsOpened: boolean;
  closeSettings: () => void;
}

const SettingsDrawer = ({
  settingsOpened,
  closeSettings,
}: SettingsDrawerProps) => {
  const {
    displayEnglish,
    setDisplayEnglish,
    colorScheme,
    setColorScheme,
    curlCommand,
    setCurlCommand,
    setToonkorUrl,
    koharuPath,
    setKoharuPath,
    translationPageLimit,
    setTranslationPageLimit,
  } = useContext(SettingsContext);

  const [loading, setLoading] = useState<boolean>(false);
  const [formData, setFormData] = useState<{
    curlCommand: string;
    koharuPath: string;
    translationPageLimit: number;
  }>({ curlCommand, koharuPath, translationPageLimit });
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [success, setSuccess] = useState<boolean>(false);

  useEffect(() => {
    setFormData({
      curlCommand,
      koharuPath,
      translationPageLimit,
    });
  }, [curlCommand, koharuPath, translationPageLimit]);

  const handleFormSubmit = async (e: React.ChangeEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const settings = await SetSettings(
        formData.curlCommand,
        formData.koharuPath,
        formData.translationPageLimit,
      );
      setToonkorUrl(settings.toonkorUrl);
      setKoharuPath(settings.koharuPath);
      setCurlCommand(settings.curlCommand);
      setTranslationPageLimit(settings.translationPageLimit);
      setSuccess(true);
    } catch (error: any) {
      setErrorMessage(error.message);
      setSuccess(false);
    } finally {
      setLoading(false);
    }
  };

  const handleCurlCommandChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    if (!e.target.value) {
      setErrorMessage("Curl command cannot be empty");
      setSuccess(false);
      return;
    }
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setErrorMessage("");
    setSuccess(false);
  };

  const handleKoharuPathChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setErrorMessage("");
    setSuccess(false);
  };

  const handlePageLimitChange = (value: number | string) => {
    if (typeof value === "string") {
      value = parseInt(value);
    }
    if (isNaN(value)) {
      setErrorMessage("Please enter a valid number");
      setSuccess(false);
      return;
    }
    if (value < 1 || value > 999) {
      setErrorMessage("Page limit must be between 1 and 999");
      setSuccess(false);
      return;
    }
    setFormData({ ...formData, translationPageLimit: value });
    setErrorMessage("");
    setSuccess(false);
  };

  const handleBrowse = async () => {
    const path = await SelectKoharuPath();
    if (path) {
      setFormData({ ...formData, koharuPath: path });
    }
  };

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
            checked={colorScheme === "dark"}
            onChange={(event) =>
              setColorScheme(event.currentTarget.checked ? "dark" : "light")
            }
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
            name="curlCommand"
            placeholder="Set curl command"
            value={formData.curlCommand}
            onChange={handleCurlCommandChange}
            disabled={loading}
            className={classes.input}
            resize="vertical"
            label="Curl Command"
          />
          <h3 className={classes.subTitle}>Translation</h3>
          <Group
            style={{ display: "flex", alignItems: "flex-end", gap: "10px" }}
          >
            <div style={{ flexGrow: 1 }}>
              <TextInput
                name="koharuPath"
                value={formData.koharuPath}
                label="Koharu Path"
                onChange={handleKoharuPathChange}
                disabled={loading}
                style={{ width: "100%" }} 
              />
            </div>
            <Button onClick={handleBrowse}>Browse</Button>
          </Group>
          <NumberInput
            name="translationPageLimit"
            value={formData.translationPageLimit}
            defaultValue={formData.translationPageLimit}
            label="Page Per minute limit"
            min={1}
            max={999}
            onChange={handlePageLimitChange}
            disabled={loading}
          />
          <Space h="lg" />
          <Button
            type="submit"
            loading={loading}
            loaderProps={{ type: "dots" }}
            w={"100%"}
            disabled={errorMessage !== ""}
          >
            {loading ? "Loading" : "Save"}
          </Button>
        </form>
        {success && <Text c="green">Settings saved successfully</Text>}
        {errorMessage && <Text c="red">{errorMessage}</Text>}
      </div>
    </Drawer>
  );
};

export default SettingsDrawer;
