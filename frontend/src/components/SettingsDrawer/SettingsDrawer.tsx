import { useContext, useEffect, useState } from "react";
import {
  ActionIcon,
  Button,
  Divider,
  Drawer,
  Group,
  NumberInput,
  PasswordInput,
  Select,
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
  GetLLMCatalog,
  SelectKoharuPath,
  SetSettings,
} from "../../../bindings/toonkor-translate/backend/backend";

interface SettingsDrawerProps {
  settingsOpened: boolean;
  closeSettings: () => void;
}

const PROVIDER_OPTIONS = [
  { value: "openai", label: "OpenAI" },
  { value: "gemini", label: "Gemini" },
  { value: "claude", label: "Anthropic Claude" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "openai-compatible", label: "OpenAI Compatible" },
];

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
    llmKind,
    setLlmKind,
    llmProviderID,
    setLlmProviderID,
    llmModelID,
    setLlmModelID,
    llmApiKey,
    setLlmApiKey,
  } = useContext(SettingsContext);

  const [loading, setLoading] = useState<boolean>(false);
  const [formData, setFormData] = useState({
    curlCommand,
    koharuPath,
    translationPageLimit,
    llmKind,
    llmProviderID,
    llmModelID,
    llmApiKey,
  });
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [success, setSuccess] = useState<boolean>(false);

  // LLM model options fetched from Koharu
  const [localModels, setLocalModels] = useState<{ value: string; label: string }[]>([]);
  const [providerModels, setProviderModels] = useState<{ value: string; label: string }[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  useEffect(() => {
    setFormData({ curlCommand, koharuPath, translationPageLimit, llmKind, llmProviderID, llmModelID, llmApiKey });
  }, [curlCommand, koharuPath, translationPageLimit, llmKind, llmProviderID, llmModelID, llmApiKey]);

  const fetchLLMCatalog = async () => {
    setCatalogLoading(true);
    try {
      const catalog = await GetLLMCatalog();
      setLocalModels((catalog.local ?? []).map((m: any) => ({ value: m.id, label: m.name })));
      setProviderModels((catalog.provider ?? []).map((m: any) => ({ value: m.id, label: m.name })));
    } catch (e: any) {
      // Koharu not running yet — that's fine, user can type the model ID
    } finally {
      setCatalogLoading(false);
    }
  };

  useEffect(() => {
    if (settingsOpened) fetchLLMCatalog();
  }, [settingsOpened]);

  const handleFormSubmit = async (e: React.ChangeEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const settings = await SetSettings(
        formData.curlCommand,
        formData.koharuPath,
        formData.translationPageLimit,
        formData.llmKind,
        formData.llmProviderID,
        formData.llmModelID,
        formData.llmApiKey,
      );
      setToonkorUrl(settings.toonkorUrl);
      setKoharuPath(settings.koharuPath);
      setCurlCommand(settings.curlCommand);
      setTranslationPageLimit(settings.translationPageLimit);
      setLlmKind(settings.llmKind);
      setLlmProviderID(settings.llmProviderId);
      setLlmModelID(settings.llmModelId);
      setLlmApiKey(settings.llmApiKey);
      setSuccess(true);
    } catch (error: any) {
      setErrorMessage(error.message);
      setSuccess(false);
    } finally {
      setLoading(false);
    }
  };

  const handleCurlCommandChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    if (!e.target.value) {
      setErrorMessage("Curl command cannot be empty");
      setSuccess(false);
      return;
    }
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setErrorMessage("");
    setSuccess(false);
  };

  const handleKoharuPathChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setErrorMessage("");
    setSuccess(false);
  };

  const handlePageLimitChange = (value: number | string) => {
    if (typeof value === "string") value = parseInt(value);
    if (isNaN(value)) { setErrorMessage("Please enter a valid number"); setSuccess(false); return; }
    if (value < 1 || value > 999) { setErrorMessage("Page limit must be between 1 and 999"); setSuccess(false); return; }
    setFormData({ ...formData, translationPageLimit: value });
    setErrorMessage("");
    setSuccess(false);
  };

  const handleBrowse = async () => {
    const path = await SelectKoharuPath();
    if (path) setFormData({ ...formData, koharuPath: path });
  };

  // Derive model options for the current mode
  const isProvider = formData.llmKind === "provider";
  const modelOptions = isProvider ? providerModels : localModels;

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
          <ActionIcon className={classes.closeButton} onClick={closeSettings} variant="default" size="lg" radius="lg">
            <IconX />
          </ActionIcon>
        </Group>

        <h3 className={classes.subTitle}>Personalisation</h3>
        <Stack mt="sm" gap="sm">
          <Switch
            label="Dark Mode"
            labelPosition="left"
            checked={colorScheme === "dark"}
            onChange={(event) => setColorScheme(event.currentTarget.checked ? "dark" : "light")}
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

        <form onSubmit={handleFormSubmit}>
          <h3 className={classes.subTitle}>Toonkor</h3>
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

          <Divider mt="xl" />
          <h3 className={classes.subTitle}>Translation</h3>

          <Group style={{ display: "flex", alignItems: "flex-end", gap: "10px" }}>
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
            label="Pages Per Translation Limit"
            min={1}
            max={999}
            onChange={handlePageLimitChange}
            disabled={loading}
            mt="xs"
          />

          <Divider mt="xl" />
          <h3 className={classes.subTitle}>LLM</h3>

          <Select
            label="LLM Mode"
            value={formData.llmKind}
            onChange={(v) => setFormData({ ...formData, llmKind: v ?? "provider", llmModelID: "" })}
            data={[
              { value: "provider", label: "API Provider" },
              { value: "local", label: "Local Model" },
            ]}
            disabled={loading}
            mt="xs"
          />

          {isProvider && (
            <Select
              label="Provider"
              value={formData.llmProviderID}
              onChange={(v) => setFormData({ ...formData, llmProviderID: v ?? "openai", llmModelID: "" })}
              data={PROVIDER_OPTIONS}
              disabled={loading}
              mt="xs"
            />
          )}

          {modelOptions.length > 0 ? (
            <Select
              label="Model"
              value={formData.llmModelID}
              onChange={(v) => setFormData({ ...formData, llmModelID: v ?? "" })}
              data={modelOptions}
              disabled={loading || catalogLoading}
              placeholder={catalogLoading ? "Loading models…" : "Select a model"}
              mt="xs"
            />
          ) : (
            <TextInput
              label="Model ID"
              value={formData.llmModelID}
              onChange={(e) => setFormData({ ...formData, llmModelID: e.target.value })}
              placeholder={isProvider ? "e.g. gpt-4o-mini" : "e.g. gguf:llama-3.2-3b"}
              disabled={loading}
              mt="xs"
            />
          )}

          {isProvider && (
            <PasswordInput
              label="API Key"
              value={formData.llmApiKey}
              onChange={(e) => setFormData({ ...formData, llmApiKey: e.target.value })}
              placeholder="sk-..."
              disabled={loading}
              mt="xs"
            />
          )}

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