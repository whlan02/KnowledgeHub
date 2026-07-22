import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

const resources = {
  zh: {
    translation: {
      appName: 'KnowledgeHub',
      appSubtitle: '本地知识阅读器',
      files: '文件',
      contents: '目录',
      noNote: '选择左侧笔记开始阅读',
      noteNotFound: '未找到该笔记',
      emptyFolder: '暂无 Markdown 笔记',
      searchPlaceholder: '搜索笔记…',
      language: '语言',
      theme: '主题',
      themeLight: '浅色',
      themeDark: '深色',
      themeSystem: '跟随系统',
      collapseSidebar: '收起侧栏',
      expandSidebar: '展开侧栏',
      onThisPage: '本页目录',
      rootNotes: '根目录',
      notesFolder: '笔记目录',
      openFolder: '打开文件夹',
      resetFolder: '恢复示例笔记',
      folderPickFailed: '无法打开文件夹，请用 Chrome / Edge 重试',
    },
  },
  en: {
    translation: {
      appName: 'KnowledgeHub',
      appSubtitle: 'Local knowledge reader',
      files: 'Files',
      contents: 'Contents',
      noNote: 'Select a note on the left to start reading',
      noteNotFound: 'Note not found',
      emptyFolder: 'No Markdown notes yet',
      searchPlaceholder: 'Search notes…',
      language: 'Language',
      theme: 'Theme',
      themeLight: 'Light',
      themeDark: 'Dark',
      themeSystem: 'System',
      collapseSidebar: 'Collapse sidebar',
      expandSidebar: 'Expand sidebar',
      onThisPage: 'On this page',
      rootNotes: 'Root',
      notesFolder: 'Notes folder',
      openFolder: 'Open folder',
      resetFolder: 'Reset to sample notes',
      folderPickFailed: 'Could not open folder. Try Chrome or Edge.',
    },
  },
}

void i18n.use(initReactI18next).init({
  resources,
  lng: localStorage.getItem('kh-lang') || 'zh',
  fallbackLng: 'zh',
  interpolation: { escapeValue: false },
})

export default i18n
