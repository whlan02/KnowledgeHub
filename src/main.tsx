import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './i18n'
import './index.css'
import { ThemeProvider } from '@/components/theme-provider'
import { NotesProvider } from '@/components/notes-provider'
import { AppShell } from '@/components/app-shell'
import { HomeRedirect } from '@/pages/home-redirect'
import { NotePage } from '@/pages/note-page'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <NotesProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<HomeRedirect />} />
              <Route path="n/*" element={<NotePage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </NotesProvider>
    </ThemeProvider>
  </StrictMode>,
)
