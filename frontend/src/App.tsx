import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';
import { Router } from './Router';
import { theme } from './theme';
import { SettingsProvider } from './contexts/SettingsContext';
import { UpdateNotification } from '@/components/UpdateNotification/UpdateNotification';

export default function App() {
  return (
    <MantineProvider theme={theme}>
      <SettingsProvider>
        <UpdateNotification />
        <Router />
      </SettingsProvider>
    </MantineProvider>
  );
}