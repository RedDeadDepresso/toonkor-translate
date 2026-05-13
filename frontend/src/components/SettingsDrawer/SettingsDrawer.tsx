import { useContext, useEffect, useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Divider,
  Drawer,
  Group,
  NumberInput,
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

interface LLMModel {
  id: string;
  name: string;
}
interface LLMProvider {
  id: string;
  name: string;
  requiresApiKey: boolean;
  hasApiKey: boolean;
  status: string;
  models: LLMModel[];
}
interface LLMCatalog {
  local: LLMModel[];
  providers: LLMProvider[];
}

const OCR_OPTIONS = [
  { value: "", label: "Auto (prefers PaddleOCR-VL)" },
  { value: "paddle-ocr-vl-1.5", label: "PaddleOCR-VL (Korean/CJK)" },
  { value: "manga-ocr", label: "Manga OCR (Japanese only)" },
  { value: "mit48px-ocr", label: "MIT 48px OCR" },
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
    ocrEngine,
    setOcrEngine,
  } = useContext(SettingsContext);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [catalog, setCatalog] = useState<LLMCatalog | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);

  const [formData, setFormData] = useState({
    curlCommand,
    koharuPath,
    translationPageLimit,
    llmKind,
    llmProviderID,
    llmModelID,
    ocrEngine,
  });

  useEffect(() => {
    setFormData({
      curlCommand,
      koharuPath,
      translationPageLimit,
      llmKind,
      llmProviderID,
      llmModelID,
      ocrEngine,
    });
  }, [
    curlCommand,
    koharuPath,
    translationPageLimit,
    llmKind,
    llmProviderID,
    llmModelID,
    ocrEngine,
  ]);

  useEffect(() => {
    if (settingsOpened) fetchCatalog();
  }, [settingsOpened]);

  const fetchCatalog = async () => {
    setCatalogLoading(true);
    try {
      const data = (await GetLLMCatalog()) as LLMCatalog;
      setCatalog(data);
    } catch {
      // Koharu not running yet — that's fine
    } finally {
      setCatalogLoading(false);
    }
  };

  // Derived values from catalog
  const isProvider = formData.llmKind === "provider";
  const currentProvider =
    catalog?.providers?.find((p) => p.id === formData.llmProviderID) ?? null;
  const modelOptions = isProvider
    ? (currentProvider?.models ?? []).map((m) => ({
        value: m.id,
        label: m.name,
      }))
    : (catalog?.local ?? []).map((m) => ({ value: m.id, label: m.name }));

  const providerOptions = (catalog?.providers ?? []).map((p) => ({
    value: p.id,
    label: p.name,
  }));

  const handleSubmit = async (e: React.FormEvent) => {
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
        formData.ocrEngine,
      );
      setToonkorUrl(settings.toonkorUrl);
      setKoharuPath(settings.koharuPath);
      setCurlCommand(settings.curlCommand);
      setTranslationPageLimit(settings.translationPageLimit);
      setLlmKind(settings.llmKind);
      setLlmProviderID(settings.llmProviderId);
      setLlmModelID(settings.llmModelId);
      setOcrEngine(settings.ocrEngine);
      setSuccess(true);
      setErrorMessage("");
    } catch (err: any) {
      setErrorMessage(err.message);
      setSuccess(false);
    } finally {
      setLoading(false);
    }
  };

  const handleBrowse = async () => {
    const path = await SelectKoharuPath();
    if (path) setFormData((f) => ({ ...f, koharuPath: path }));
  };

  const set = (key: string) => (value: any) => {
    setFormData((f) => ({ ...f, [key]: value }));
    setSuccess(false);
    setErrorMessage("");
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
            onChange={(e) =>
              setColorScheme(e.currentTarget.checked ? "dark" : "light")
            }
            classNames={{ track: classes.track }}
          />
          <Switch
            label="Display Manhwa Details in English"
            labelPosition="left"
            checked={displayEnglish}
            onChange={(e) => setDisplayEnglish(e.currentTarget.checked)}
            classNames={{ track: classes.track }}
          />
        </Stack>

        <Divider mt="xl" />

        <form onSubmit={handleSubmit}>
          <h3 className={classes.subTitle}>Toonkor</h3>
          <Textarea
            name="curlCommand"
            label="Curl Command"
            placeholder="Set curl command"
            value={formData.curlCommand}
            onChange={(e) => set("curlCommand")(e.target.value)}
            disabled={loading}
            className={classes.input}
            resize="vertical"
          />

          <Divider mt="xl" />
          <h3 className={classes.subTitle}>Translation</h3>

          <Group style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
            <div style={{ flexGrow: 1 }}>
              <TextInput
                label="Koharu Path"
                value={formData.koharuPath}
                onChange={(e) => set("koharuPath")(e.target.value)}
                disabled={loading}
                style={{ width: "100%" }}
              />
            </div>
            <Button onClick={handleBrowse} disabled={loading}>
              Browse
            </Button>
          </Group>

          <NumberInput
            label="Pages Per Batch (rate limit)"
            description="Max pages per API call. 0 = no limit."
            value={formData.translationPageLimit}
            min={0}
            max={999}
            onChange={(v) =>
              set("translationPageLimit")(
                typeof v === "string" ? parseInt(v) || 0 : v,
              )
            }
            disabled={loading}
            mt="xs"
          />

          <Select
            label="OCR Engine"
            description="PaddleOCR-VL is recommended for Korean manhwa."
            value={formData.ocrEngine || ""}
            onChange={(v) => set("ocrEngine")(v ?? "")}
            data={OCR_OPTIONS}
            disabled={loading}
            mt="xs"
          />

          <Divider mt="xl" />
          <h3 className={classes.subTitle}>LLM</h3>

          {catalogLoading && (
            <Text size="sm" c="dimmed">
              Loading models from Koharu…
            </Text>
          )}

          <Select
            label="LLM Mode"
            value={formData.llmKind}
            onChange={(v) =>
              setFormData((f) => ({
                ...f,
                llmKind: v ?? "provider",
                llmModelID: "",
              }))
            }
            data={[
              { value: "provider", label: "API Provider" },
              { value: "local", label: "Local Model" },
            ]}
            disabled={loading}
            mt="xs"
          />

          {isProvider && (
            <>
              {providerOptions.length > 0 ? (
                <Select
                  label="Provider"
                  value={formData.llmProviderID}
                  onChange={(v) =>
                    setFormData((f) => ({
                      ...f,
                      llmProviderID: v ?? "openai",
                      llmModelID: "",
                    }))
                  }
                  data={providerOptions.map((p) => {
                    const prov = catalog?.providers?.find(
                      (x) => x.id === p.value,
                    );
                    return {
                      value: p.value,
                      label: prov?.hasApiKey ? `${p.label} ✓` : p.label,
                    };
                  })}
                  disabled={loading}
                  mt="xs"
                />
              ) : (
                <Select
                  label="Provider"
                  value={formData.llmProviderID}
                  onChange={(v) =>
                    setFormData((f) => ({
                      ...f,
                      llmProviderID: v ?? "openai",
                      llmModelID: "",
                    }))
                  }
                  data={[
                    { value: "openai", label: "OpenAI" },
                    { value: "gemini", label: "Gemini" },
                    { value: "claude", label: "Anthropic Claude" },
                    { value: "deepseek", label: "DeepSeek" },
                    { value: "deepl", label: "DeepL" },
                    { value: "google-translate", label: "Google Translate" },
                    { value: "openai-compatible", label: "OpenAI Compatible" },
                  ]}
                  disabled={loading}
                  mt="xs"
                />
              )}

              {currentProvider && (
                <Group mt={4} gap="xs">
                  <Badge
                    color={currentProvider.hasApiKey ? "green" : "red"}
                    size="sm"
                  >
                    {currentProvider.hasApiKey
                      ? "API key configured"
                      : "No API key"}
                  </Badge>
                  {currentProvider.status === "ready" && (
                    <Badge color="teal" size="sm">
                      Ready
                    </Badge>
                  )}
                </Group>
              )}
            </>
          )}

          {modelOptions.length > 0 ? (
            <Select
              label="Model"
              value={formData.llmModelID}
              onChange={(v) => set("llmModelID")(v ?? "")}
              data={modelOptions}
              searchable
              placeholder="Select a model"
              disabled={loading}
              mt="xs"
            />
          ) : (
            <TextInput
              label="Model ID"
              value={formData.llmModelID}
              onChange={(e) => set("llmModelID")(e.target.value)}
              placeholder={
                isProvider ? "e.g. gpt-4o-mini" : "e.g. gguf:llama-3.2-3b"
              }
              disabled={loading}
              mt="xs"
            />
          )}

          <Space h="lg" />
          <Button
            type="submit"
            loading={loading}
            loaderProps={{ type: "dots" }}
            w="100%"
            disabled={!!errorMessage}
          >
            {loading ? "Saving…" : "Save"}
          </Button>
        </form>

        {success && (
          <Text c="green" mt="xs">
            Settings saved successfully
          </Text>
        )}
        {errorMessage && (
          <Text c="red" mt="xs">
            {errorMessage}
          </Text>
        )}
      </div>
    </Drawer>
  );
};

export default SettingsDrawer;
