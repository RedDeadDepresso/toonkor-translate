import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';
import { Router } from './Router';
import { theme } from './theme';
import { Stack } from '@mantine/core';
import { SettingsProvider } from './contexts/SettingsContext';


export default function App() {
  return (
    <MantineProvider theme={theme}>
      <SettingsProvider>
      <Stack px="2rem">
      <Router />
      </Stack>
      </SettingsProvider>
    </MantineProvider>
  );
}
