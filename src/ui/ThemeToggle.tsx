'use client';

import { MoonIcon, SunIcon } from './icons';
import { setTheme, useTheme } from './theme';
import { IconButton } from './IconButton';

export function ThemeToggle() {
  const theme = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <IconButton label={`Switch to ${next} theme`} onClick={() => setTheme(next)}>
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </IconButton>
  );
}
